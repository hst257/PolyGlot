"""Typed three-address lowering with explicit control flow and temporary slots."""

from dataclasses import dataclass, field
from .ast import Node
from .source import Source


@dataclass
class IRFunction:
    id: int
    name: str
    params: list[str]
    return_type: str
    local_count: int
    instructions: list[dict] = field(default_factory=list)
    temp_count: int = 0


class Lowerer:
    def __init__(self, source: Source, analyzer):
        self.source, self.analyzer = source, analyzer
        self.current = IRFunction(0, "<main>", [], "void", analyzer.local_counts[0])
        self.labels = 0
        self.loops = []

    def emit(self, op: str, node: Node, **operands):
        self.current.instructions.append({"op": op, **operands, "source": self.source.location(node.span)})

    def temp(self):
        result = self.current.temp_count
        self.current.temp_count += 1
        return result

    def label(self):
        self.labels += 1
        return f"L{self.labels}"

    def mark(self, label, node):
        self.emit("LABEL", node, label=label)

    def constant(self, value, node, type_name="int"):
        result = self.temp()
        self.emit("CONST", node, dest=result, value=value, type=type_name)
        return result

    def widen(self, value, actual, expected, node):
        if actual == "int" and expected == "float":
            dest = self.temp()
            self.emit("WIDEN", node, dest=dest, value=value, type="float")
            return dest
        return value

    def load_binding(self, node):
        value = self.temp()
        self.emit("LOAD", node, dest=value, storage=node.meta["storage"], slot=node.meta["slot"], type=node.meta["type"])
        return value

    def store_binding(self, node, value):
        self.emit("STORE", node, value=value, storage=node.meta["storage"], slot=node.meta["slot"], type=node.meta["type"])

    def binary(self, operator, left, right, node, type_name):
        dest = self.temp()
        self.emit("BINARY", node, dest=dest, operator=operator, left=left, right=right, type=type_name)
        return dest

    def expr(self, node: Node):
        d = node.data
        if node.kind == "Literal":
            return self.constant(d["value"], node, node.meta["type"])
        if node.kind == "Name":
            return self.load_binding(node)
        if node.kind == "ArrayLiteral":
            element = node.meta["element_type"]
            values = [self.widen(self.expr(value), value.meta["type"], element, value) for value in d["values"]]
            dest = self.temp()
            self.emit("ARRAY_BUILD", node, dest=dest, args=values, element_type=element, type=node.meta["type"])
            return dest
        if node.kind == "ArrayNew":
            size, dest = self.expr(d["size"]), self.temp()
            self.emit("ARRAY_NEW", node, dest=dest, size=size, element_type=d["element_type"], type=node.meta["type"])
            return dest
        if node.kind == "Index":
            array, index, dest = self.expr(d["array"]), self.expr(d["index"]), self.temp()
            self.emit("ARRAY_GET", node, dest=dest, array=array, index=index, type=node.meta["type"])
            return dest
        if node.kind == "Call":
            if node.meta.get("builtin") == "len":
                array, dest = self.expr(d["args"][0]), self.temp()
                self.emit("ARRAY_LENGTH", node, dest=dest, array=array, type="int")
                return dest
            args = []
            for arg, expected in zip(d["args"], node.meta["param_types"]):
                args.append(self.widen(self.expr(arg), arg.meta["type"], expected, arg))
            dest = None if node.meta["type"] == "void" else self.temp()
            self.emit("CALL", node, dest=dest, function=node.meta["function"], args=args, type=node.meta["type"])
            return dest
        if node.kind == "Unary":
            value, dest = self.expr(d["value"]), self.temp()
            self.emit("UNARY", node, dest=dest, operator=d["op"], value=value, type=node.meta["type"])
            return dest
        if node.kind == "Binary":
            left = self.expr(d["left"])
            if d["op"] in ("and", "or"):
                dest = self.temp()
                self.emit("MOVE", node, dest=dest, value=left, type="bool")
                right_label, end = self.label(), self.label()
                self.emit("BRANCH", node, condition=left,
                          true=right_label if d["op"] == "and" else end,
                          false=end if d["op"] == "and" else right_label)
                self.mark(right_label, node)
                right = self.expr(d["right"])
                self.emit("MOVE", node, dest=dest, value=right, type="bool")
                self.mark(end, node)
                return dest
            right = self.expr(d["right"])
            a, b = d["left"].meta["type"], d["right"].meta["type"]
            if a in ("int", "float") and b in ("int", "float") and "float" in (a, b):
                left = self.widen(left, a, "float", node)
                right = self.widen(right, b, "float", node)
            return self.binary(d["op"], left, right, node, node.meta["type"])
        raise ValueError(f"Unknown expression {node.kind}")

    def block(self, node):
        for statement in node.data["body"]:
            self.statement(statement)

    def statement(self, node: Node):
        d = node.data
        if node.kind in ("Declare", "Assign") and d.get("value"):
            size = self.expr(d["size"]) if d.get("size") is not None else None
            value = self.widen(self.expr(d["value"]), d["value"].meta["type"], node.meta["type"], node)
            if size is not None:
                self.emit("ARRAY_SIZE_CHECK", node, array=value, size=size)
            self.store_binding(node, value)
        elif node.kind == "IndexAssign":
            target = d["target"]
            array, index = self.expr(target.data["array"]), self.expr(target.data["index"])
            self.emit("ARRAY_CHECK", target, array=array, index=index)
            old = None
            if d["op"] != "=":
                old = self.temp()
                self.emit("ARRAY_GET", target, dest=old, array=array, index=index, type=node.meta["type"])
            value = self.expr(d["value"])
            if old is not None:
                if node.meta["operation_type"] == "float":
                    old = self.widen(old, node.meta["type"], "float", node)
                    value = self.widen(value, d["value"].meta["type"], "float", node)
                value = self.binary(d["op"][0], old, value, node, node.meta["operation_type"])
            value = self.widen(value, node.meta["operation_type"], node.meta["type"], node)
            self.emit("ARRAY_SET", node, array=array, index=index, value=value, type=node.meta["type"])
        elif node.kind == "Output":
            args = [self.expr(arg) for arg in d["args"]]
            self.emit("OUTPUT", node, args=args, separator=d["separator"], ending=d["ending"])
        elif node.kind == "OutputSequence":
            self.block(node)
        elif node.kind == "Printf":
            values = [self.widen(self.expr(arg), arg.meta["type"], expected, arg)
                      for arg, expected in zip(d["args"], node.meta["format_types"])]
            parts = []
            for segment in node.meta["segments"]:
                if segment["kind"] == "literal":
                    parts.append(self.constant(segment["text"], node, "string"))
                else:
                    dest = self.temp()
                    self.emit("FORMAT", node, dest=dest, value=values[segment["index"]],
                              specifier=segment["specifier"], type="string")
                    parts.append(dest)
            # Evaluate/format every argument before emitting output. Each OUTPUT stays bounded.
            for start in range(0, max(1, len(parts)), 1000):
                self.emit("OUTPUT", node, args=parts[start:start + 1000], separator="", ending="")
        elif node.kind == "Expression":
            self.expr(d["value"])
        elif node.kind == "Return":
            if d["value"] is None:
                self.emit("RETURN_VOID", node)
            else:
                value = self.widen(self.expr(d["value"]), d["value"].meta["type"], self.current.return_type, node)
                self.emit("RETURN_VALUE", node, value=value)
        elif node.kind in ("Break", "Continue"):
            self.emit("JUMP", node, target=self.loops[-1][0 if node.kind == "Break" else 1])
        elif node.kind == "If":
            end = self.label()
            for branch in d["branches"]:
                yes, no = self.label(), self.label()
                condition = self.expr(branch["condition"])
                self.emit("BRANCH", node, condition=condition, true=yes, false=no)
                self.mark(yes, node)
                self.block(branch["body"])
                self.emit("JUMP", node, target=end)
                self.mark(no, node)
            if d["else"]:
                self.block(d["else"])
            self.mark(end, node)
        elif node.kind in ("While", "For"):
            if node.kind == "For" and d["initial"]:
                self.statement(d["initial"])
            condition_label, body, update, end = (self.label() for _ in range(4))
            self.mark(condition_label, node)
            condition = self.expr(d["condition"])
            self.emit("BRANCH", node, condition=condition, true=body, false=end)
            self.mark(body, node)
            self.loops.append((end, update if node.kind == "For" else condition_label))
            self.block(d["body"])
            self.loops.pop()
            self.mark(update, node)
            if node.kind == "For" and d["update"]:
                self.statement(d["update"])
            self.emit("JUMP", node, target=condition_label)
            self.mark(end, node)
        elif node.kind == "ForEach":
            array = self.expr(d["iterable"])
            length = self.temp()
            self.emit("ARRAY_LENGTH", node, dest=length, array=array, type="int")
            index, one = self.constant(0, node), self.constant(1, node)
            condition_label, body, update, end = (self.label() for _ in range(4))
            self.mark(condition_label, node)
            condition = self.binary("<", index, length, node, "bool")
            self.emit("BRANCH", node, condition=condition, true=body, false=end)
            self.mark(body, node)
            value = self.temp()
            self.emit("ARRAY_GET", node, dest=value, array=array, index=index, type=node.meta["type"])
            self.store_binding(node, value)
            self.loops.append((end, update))
            self.block(d["body"])
            self.loops.pop()
            self.mark(update, node)
            next_index = self.binary("+", index, one, node, "int")
            self.emit("MOVE", node, dest=index, value=next_index, type="int")
            self.emit("JUMP", node, target=condition_label)
            self.mark(end, node)
        elif node.kind == "Range":
            args = [self.expr(arg) for arg in d["args"]]
            zero = self.constant(0, node)
            start = zero if len(args) == 1 else args[0]
            stop = args[0] if len(args) == 1 else args[1]
            step = args[2] if len(args) == 3 else self.constant(1, node)
            nonzero = self.binary("!=", step, zero, node, "bool")
            self.emit("ASSERT", node, condition=nonzero, code="R009", message="range step cannot be zero.")
            self.store_binding(node, start)
            condition_label, positive, negative, test, body, update, end = (self.label() for _ in range(7))
            self.mark(condition_label, node)
            counter = self.load_binding(node)
            sign = self.binary(">", step, zero, node, "bool")
            result = self.temp()
            self.emit("BRANCH", node, condition=sign, true=positive, false=negative)
            self.mark(positive, node)
            compare = self.binary("<", counter, stop, node, "bool")
            self.emit("MOVE", node, dest=result, value=compare, type="bool")
            self.emit("JUMP", node, target=test)
            self.mark(negative, node)
            compare = self.binary(">", counter, stop, node, "bool")
            self.emit("MOVE", node, dest=result, value=compare, type="bool")
            self.mark(test, node)
            self.emit("BRANCH", node, condition=result, true=body, false=end)
            self.mark(body, node)
            self.loops.append((end, update))
            self.block(d["body"])
            self.loops.pop()
            self.mark(update, node)
            next_value = self.binary("+", self.load_binding(node), step, node, "int")
            self.store_binding(node, next_value)
            self.emit("JUMP", node, target=condition_label)
            self.mark(end, node)

    def lower(self, program: Node):
        main = self.current
        for node in program.data["body"]:
            if node.kind != "Function":
                self.statement(node)
        self.emit("RETURN_VOID", program)
        functions = [main]
        for node in self.analyzer.functions:
            fid = node.meta["function"]
            self.current = IRFunction(fid, node.data["name"], [p["type"] for p in node.data["params"]],
                                      node.data["return_type"], self.analyzer.local_counts[fid])
            self.block(node.data["body"])
            if self.current.return_type == "void":
                self.emit("RETURN_VOID", node)
            else:
                self.emit("TRAP", node, code="R008", message="Function reached its end without returning.")
            functions.append(self.current)
        return functions
