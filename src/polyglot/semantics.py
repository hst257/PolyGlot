"""Shared lexical scopes, static types, and conservative control-flow analysis."""

import math
from dataclasses import dataclass, field, asdict
from .ast import Node
from .source import Source
from .diagnostics import fail
from .types import VALUE_TYPES, is_array, is_value_type, MAX_ARRAY_LENGTH


@dataclass
class Symbol:
    id: int
    name: str
    type: str
    storage: str
    slot: int
    scope: int
    location: dict
    owner: int
    params: list[str] = field(default_factory=list)


@dataclass
class Scope:
    id: int
    parent: "Scope | None"
    owner: int
    names: dict[str, Symbol] = field(default_factory=dict)


RESERVED = {"print", "range", "cout", "endl", "std", "System", "def", "if", "elif", "else", "for", "while",
            "return", "break", "continue", "True", "False", "true", "false", "int", "float", "double", "bool",
            "boolean", "string", "str", "String", "void", "len", "new"}


class Analyzer:
    def __init__(self, source: Source):
        self.source = source
        self.symbols: list[Symbol] = []
        self.root = Scope(0, None, 0)
        self.scope = self.root
        self.scope_count = 1
        self.local_counts = {0: 0}
        self.global_count = 0
        self.assigned: set[int] = set()
        self.loop_depth = 0
        self.return_type = "void"
        self.functions: list[Node] = []

    def error(self, node: Node, code: str, message: str, suggestion: str = "", related=None):
        fail(self.source, node.span, code, message, suggestion, related)

    def enter(self):
        self.scope = Scope(self.scope_count, self.scope, self.scope.owner)
        self.scope_count += 1

    def bind(self, node: Node, name: str, type_name: str, function_id=None, params=None) -> Symbol:
        if name in RESERVED:
            self.error(node, "S008", f"{name!r} is reserved by the language.")
        if name in self.scope.names:
            self.error(node, "S001", f"Duplicate declaration of {name!r}.",
                       related=[self.scope.names[name].location])
        if function_id is not None:
            storage, slot = "function", function_id
        elif not is_value_type(type_name):
            self.error(node, "S002", "Variables and parameters cannot have type void.")
        elif self.scope is self.root:
            storage, slot = "global", self.global_count
            self.global_count += 1
        else:
            storage, slot = "local", self.local_counts[self.scope.owner]
            self.local_counts[self.scope.owner] += 1
        symbol = Symbol(len(self.symbols), name, type_name, storage, slot, self.scope.id,
                        self.source.location(node.span), self.scope.owner, params or [])
        self.symbols.append(symbol)
        self.scope.names[name] = symbol
        return symbol

    def find(self, name: str):
        scope = self.scope
        while scope:
            if name in scope.names:
                return scope.names[name]
            scope = scope.parent
        return None

    def reference(self, node: Node, name: str) -> Symbol:
        symbol = self.find(name)
        if symbol is None:
            self.error(node, "S003", f"Undefined name {name!r}.", "Declare the name before using it.")
        return symbol

    @staticmethod
    def attach(node: Node, symbol: Symbol):
        node.meta.update({"symbol": symbol.id, "storage": symbol.storage, "slot": symbol.slot, "type": symbol.type})

    def compatible(self, node: Node, actual: str, expected: str):
        if actual != expected and not (actual == "int" and expected == "float"):
            self.error(node, "S004", f"Cannot use {actual} where {expected} is required.")

    def binary_type(self, node, op, a, b):
        numeric = a in ("int", "float") and b in ("int", "float")
        if op in ("and", "or") and a == b == "bool":
            return "bool"
        if op in ("==", "!=") and (numeric or a == b != "void") and not is_array(a) and not is_array(b):
            return "bool"
        if op in ("<", "<=", ">", ">=") and (numeric or a == b == "string"):
            return "bool"
        if op == "+" and a == b == "string":
            return "string"
        if op in ("+", "-", "*", "/", "%") and numeric:
            return "float" if op == "/" or "float" in (a, b) else "int"
        self.error(node, "S006", f"Invalid operator {op} for {a} and {b}.")

    def array_size(self, node):
        if self.expr(node) != "int":
            self.error(node, "S023", "Array length must have type int.")
        if node.kind == "Literal" and not 0 <= node.data["value"] <= MAX_ARRAY_LENGTH:
            self.error(node, "S025", f"Array length must be between 0 and {MAX_ARRAY_LENGTH}.")

    def readable(self, node: Node, symbol: Symbol):
        if symbol.storage == "function":
            self.error(node, "S007", "Functions are callable names, not first-class values.")
        if symbol.id not in self.assigned and not (self.scope.owner != 0 and symbol.storage == "global"):
            self.error(node, "S005", f"Variable {symbol.name!r} may be uninitialized.",
                       "Assign a value on every path before reading it.")

    def expr(self, node: Node, expected: str | None = None) -> str:
        d = node.data
        if node.kind == "Literal":
            t = {bool: "bool", int: "int", float: "float", str: "string"}[type(d["value"])]
            if t == "float" and not math.isfinite(d["value"]):
                self.error(node, "S009", "Nonfinite floating-point literal.")
        elif node.kind == "ArrayLiteral":
            values = d["values"]
            if any(value.kind in ("ArrayLiteral", "ArrayNew") for value in values):
                self.error(node, "S022", "Nested arrays are unsupported.")
            if len(values) > MAX_ARRAY_LENGTH:
                self.error(node, "S025", f"Arrays may contain at most {MAX_ARRAY_LENGTH} elements.")
            types = [self.expr(value) for value in values]
            if any(t not in VALUE_TYPES for t in types):
                self.error(node, "S022", "Arrays must contain primitive values; nested arrays are unsupported.")
            if is_array(expected):
                element = expected[:-2]
            elif not types:
                self.error(node, "S021", "Cannot infer the element type of an empty array.", "Use an explicit declaration such as int[] values = [];")
            elif all(t in ("int", "float") for t in types):
                element = "float" if "float" in types else "int"
            elif len(set(types)) == 1:
                element = types[0]
            else:
                self.error(node, "S022", "Array elements must have one compatible primitive type.")
            for value, actual in zip(values, types):
                self.compatible(value, actual, element)
            node.meta["element_type"] = element
            t = element + "[]"
        elif node.kind == "ArrayNew":
            self.array_size(d["size"])
            t = d["element_type"] + "[]"
            node.meta["element_type"] = d["element_type"]
        elif node.kind == "Index":
            array_type = self.expr(d["array"])
            if not is_array(array_type):
                self.error(node, "S019", "Indexing requires a one-dimensional array.")
            if self.expr(d["index"]) != "int":
                self.error(d["index"], "S020", "Array indexes must have type int.")
            t = array_type[:-2]
        elif node.kind == "Name":
            symbol = self.reference(node, d["name"])
            self.readable(node, symbol)
            self.attach(node, symbol)
            t = symbol.type
        elif node.kind == "Call":
            if d["name"] == "len":
                if len(d["args"]) != 1:
                    self.error(node, "S011", "len expects exactly one array argument.")
                if not is_array(self.expr(d["args"][0])):
                    self.error(node, "S019", "len requires an array.")
                node.meta.update({"builtin": "len", "type": "int"})
                return "int"
            symbol = self.reference(node, d["name"])
            if symbol.storage != "function":
                self.error(node, "S010", f"{symbol.name!r} is not a function.")
            if len(d["args"]) != len(symbol.params):
                self.error(node, "S011", f"{symbol.name} expects {len(symbol.params)} arguments, got {len(d['args'])}.")
            for arg, expected in zip(d["args"], symbol.params):
                self.compatible(arg, self.expr(arg, expected), expected)
            node.meta.update({"function": symbol.slot, "param_types": symbol.params})
            t = symbol.type
        elif node.kind == "Unary":
            t = self.expr(d["value"])
            if (d["op"] == "not" and t != "bool") or (d["op"] != "not" and t not in ("int", "float")):
                self.error(node, "S006", f"Invalid unary operator {d['op']} for {t}.")
        elif node.kind == "Binary":
            a, b, op = self.expr(d["left"]), self.expr(d["right"]), d["op"]
            t = self.binary_type(node, op, a, b)
        else:
            self.error(node, "S007", "Unsupported expression.")
        node.meta["type"] = t
        return t

    def condition(self, node: Node):
        if self.expr(node) != "bool":
            self.error(node, "S012", "Conditions must have type bool.")

    def block(self, block: Node, new_scope=True) -> bool:
        old_scope = self.scope
        if new_scope:
            self.enter()
        falls = True
        for node in block.data["body"]:
            current_falls = self.statement(node)
            falls = falls and current_falls
        self.scope = old_scope
        return falls

    def statement(self, node: Node) -> bool:
        d = node.data
        if node.kind == "Function":
            self.error(node, "S013", "Nested functions are unsupported.")
        if node.kind in ("Declare", "Assign"):
            existing = self.find(d["name"]) if node.kind == "Assign" else None
            expected = d["type"] if node.kind == "Declare" else existing.type if existing else None
            value_type = self.expr(d["value"], expected) if d.get("value") else None
            if d.get("size") is not None:
                self.array_size(d["size"])
                if d["size"].kind == "Literal" and d["value"].kind == "ArrayLiteral" and d["size"].data["value"] != len(d["value"].data["values"]):
                    self.error(node, "S026", "Array initializer length does not match the declared length.")
            if node.kind == "Declare":
                symbol = self.bind(node, d["name"], d["type"])
            else:
                symbol = self.find(d["name"])
                if symbol is None:
                    if d["op"] != "=":
                        self.error(node, "S003", "Compound assignment requires an existing variable.")
                    symbol = self.bind(node, d["name"], value_type)
                elif symbol.storage == "function":
                    self.error(node, "S004", "Cannot assign to a function.")
            if d.get("op") in ("+=", "-="):
                old = Node("Name", node.span, {"name": d["name"]})
                binary = Node("Binary", node.span, {"op": d["op"][0], "left": old, "right": d["value"]})
                value_type = self.expr(binary)
                d["value"] = binary
            self.attach(node, symbol)
            if value_type is not None:
                self.compatible(node, value_type, symbol.type)
                self.assigned.add(symbol.id)
        elif node.kind == "IndexAssign":
            target_type = self.expr(d["target"])
            value_type = self.expr(d["value"])
            result_type = value_type if d["op"] == "=" else self.binary_type(node, d["op"][0], target_type, value_type)
            self.compatible(node, result_type, target_type)
            node.meta.update({"type": target_type, "operation_type": result_type})
        elif node.kind == "Output":
            for arg in d["args"]:
                if self.expr(arg) == "void":
                    self.error(arg, "S006", "Cannot print a void value.")
        elif node.kind == "OutputSequence":
            for piece in d["body"]:
                self.statement(piece)
        elif node.kind == "Expression":
            self.expr(d["value"])
        elif node.kind == "If":
            before = set(self.assigned)
            exits = []
            for branch in d["branches"]:
                self.assigned = set(before)
                self.condition(branch["condition"])
                falls = self.block(branch["body"])
                if falls:
                    exits.append(set(self.assigned))
            self.assigned = set(before)
            if d["else"]:
                if self.block(d["else"]):
                    exits.append(set(self.assigned))
            else:
                exits.append(before)
            self.assigned = set.intersection(*exits) if exits else before
            return bool(exits)
        elif node.kind in ("While", "For", "Range"):
            old_scope, before = self.scope, set(self.assigned)
            self.enter()
            if node.kind == "Range":
                for arg in d["args"]:
                    if self.expr(arg) != "int":
                        self.error(arg, "S014", "range arguments must be integers.")
                symbol = self.bind(node, d["name"], "int")
                self.attach(node, symbol)
                self.assigned.add(symbol.id)
                after = before
            elif node.kind == "For":
                if d["initial"]:
                    self.statement(d["initial"])
                self.condition(d["condition"])
                after = set(self.assigned)
            else:
                self.condition(d["condition"])
                after = before
            self.loop_depth += 1
            self.block(d["body"])
            if node.kind == "For" and d["update"]:
                # An update may be reached through continue, so do not rely on body-only initialization.
                self.assigned = set(after)
                self.statement(d["update"])
            self.loop_depth -= 1
            self.scope, self.assigned = old_scope, after
        elif node.kind in ("Break", "Continue"):
            if not self.loop_depth:
                self.error(node, "S015", f"{node.kind.lower()} is only valid inside a loop.")
            return False
        elif node.kind == "Return":
            if self.scope.owner == 0:
                self.error(node, "S016", "return is only valid inside a function.")
            if d["value"] is None:
                if self.return_type != "void":
                    self.error(node, "S017", "A value-returning function must return a value.")
            elif self.return_type == "void":
                self.error(node, "S017", "A void function cannot return a value.")
            else:
                self.compatible(node, self.expr(d["value"], self.return_type), self.return_type)
            return False
        else:
            self.error(node, "S007", f"Unsupported AST node {node.kind}.")
        return True

    def analyze(self, program: Node):
        for node in program.data["body"]:
            if node.kind == "Function":
                fid = len(self.functions) + 1
                symbol = self.bind(node, node.data["name"], node.data["return_type"], fid,
                                   [p["type"] for p in node.data["params"]])
                self.attach(node, symbol)
                node.meta["function"] = fid
                self.functions.append(node)
        for node in program.data["body"]:
            if node.kind != "Function":
                self.statement(node)
        for node in self.functions:
            fid = node.meta["function"]
            self.local_counts[fid] = 0
            self.scope = Scope(self.scope_count, self.root, fid)
            self.scope_count += 1
            self.assigned = set()
            self.return_type = node.data["return_type"]
            for param in node.data["params"]:
                site = Node("Parameter", param["span"])
                symbol = self.bind(site, param["name"], param["type"])
                param["binding"] = asdict(symbol)
                self.assigned.add(symbol.id)
            if self.block(node.data["body"], new_scope=False) and self.return_type != "void":
                self.error(node, "S018", "A value-returning function may reach its end without returning.",
                           "Return a compatible value on every path; loop termination is checked conservatively.")
        self.scope = self.root
        return [asdict(s) for s in self.symbols]
