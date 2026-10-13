"""Deterministic construct dispatch, plus structural suite parsing."""

from ..ast import Node
from ..source import Source, Span
from ..diagnostics import fail
from ..layout import Layout
from .shared import TYPES, expression
from . import python_family, c_family, basic_family


class Parser:
    def __init__(self, source: Source, tokens: list):
        self.source, self.tokens, self.pos = source, tokens, 0
        self.layout = Layout(source)
        self.recognition: list[dict] = []

    def peek(self, offset: int = 0):
        return self.tokens[min(self.pos + offset, len(self.tokens) - 1)]

    def previous(self):
        return self.tokens[self.pos - 1]

    def take(self):
        token = self.peek()
        self.pos += 1
        return token

    def at(self, spelling: str) -> bool:
        return self.peek().text == spelling or self.peek().kind == spelling

    def match(self, spelling: str) -> bool:
        if self.at(spelling):
            self.take()
            return True
        return False

    def expect(self, spelling: str):
        if not self.at(spelling):
            self.error(self.peek(), "P001", f"Expected {spelling!r}, found {self.peek().text or self.peek().kind!r}.")
        return self.take()

    def error(self, token, code: str, message: str, suggestion: str = "") -> None:
        fail(self.source, token.span, code, message, suggestion)

    def join(self, a: Span, b: Span) -> Span:
        return self.source.span(a.start, b.end)

    def newlines(self):
        while self.match("NEWLINE"):
            pass

    def end(self, required_semicolon: bool = False):
        if self.match(";"):
            self.newlines()
        elif not required_semicolon and self.match("NEWLINE"):
            self.newlines()
        else:
            self.error(self.peek(), "P002", "Missing semicolon." if required_semicolon else "Expected a statement terminator.")

    def arguments(self) -> list[Node]:
        self.expect("(")
        args = []
        if not self.at(")"):
            args.append(expression(self))
            while self.match(","):
                args.append(expression(self))
        if len(args) > 1000:
            self.error(self.peek(), "P024", "Argument count exceeds the 1000-argument resource limit.")
        self.expect(")")
        return args

    def record(self, node: Node, family: str, rule: str, reasons: list[str]):
        candidates = ["C", "C++", "Java"] if family == "shared-c" else []
        if family == "shared-c" and (rule in ("if", "while") or
                rule == "three-part-for" and (node.data["initial"] is None or node.data["initial"].kind in ("Assign", "IndexAssign"))):
            candidates.append("JavaScript")
        meta = {"family": family, "candidates": candidates,
                "grammar_rule": rule, "distinctive": family not in ("shared", "shared-c"), "reasons": reasons}
        node.meta["syntax"] = meta
        self.recognition.append({**meta, "kind": node.kind, "span": node.span})
        return node

    def parse(self) -> Node:
        self.newlines()
        statements = []
        while not self.at("EOF"):
            if self.peek().span.column != 1:
                self.error(self.peek(), "P003", "Unexpected top-level indentation.")
            statements.append(self.statement())
            self.newlines()
        return Node("Program", self.source.span(0, len(self.source.text)), {"body": statements})

    def suite(self, header) -> Node:
        opening = self.peek()
        body = []
        if self.match(":"):
            self.expect("NEWLINE")
            self.newlines()
            first = self.peek()
            if first.kind == "EOF" or first.text == "}" or first.span.column <= header.span.column:
                self.error(first, "P003", "Expected an indented suite.", "Indent the body using spaces.")
            column = first.span.column
            self.layout.enter("indent", first)
            while not self.at("EOF") and not self.at("}") and self.peek().span.column > header.span.column:
                if self.peek().span.column != column:
                    self.error(self.peek(), "P003", "Inconsistent suite indentation.")
                body.append(self.statement())
                self.newlines()
            self.layout.leave(self.peek())
            style = "indent"
        elif self.match("{"):
            self.layout.enter("brace", opening)
            self.newlines()
            while not self.at("}"):
                if self.at("EOF"):
                    self.error(opening, "P005", "Unclosed brace block.", "Add a closing '}'.")
                body.append(self.statement())
                self.newlines()
            closing = self.take()
            self.layout.leave(closing)
            self.newlines()
            style = "brace"
        else:
            self.error(opening, "P005", "Expected ':' and indentation, or a brace block.")
        node = Node("Block", self.join(opening.span, self.previous().span), {"body": body, "style": style})
        return node

    def assignment(self) -> Node:
        start = self.expect("NAME")
        target = None
        if self.match("["):
            index = expression(self)
            end = self.expect("]")
            target = Node("Index", self.join(start.span, end.span),
                          {"array": Node("Name", start.span, {"name": start.text}), "index": index})
        op = self.take()
        if op.text in ("++", "--"):
            if target is not None:
                self.error(op, "P025", "Indexed increment/decrement is unsupported; use += or -=.")
            value = Node("Literal", op.span, {"value": 1})
            operator = "+=" if op.text == "++" else "-="
        elif op.text in ("=", "+=", "-="):
            value, operator = expression(self), op.text
        else:
            self.error(op, "P006", "Expected an assignment or loop update.")
        if target is not None:
            return Node("IndexAssign", self.join(start.span, value.span), {"target": target, "op": operator, "value": value})
        return Node("Assign", self.join(start.span, value.span), {"name": start.text, "op": operator, "value": value})

    def control(self) -> Node:
        start = self.take()
        condition_start = self.pos
        parenthesized = self.at("(")
        condition = expression(self)
        if self.at("{"):
            depth, closing = 0, -1
            for index in range(condition_start, self.pos):
                text = self.tokens[index].text
                if text == "(":
                    depth += 1
                elif text == ")":
                    depth -= 1
                    if depth == 0:
                        closing = index
                        break
            if not parenthesized or closing != self.pos - 1:
                self.error(self.peek(), "P006", "Brace-style conditions require enclosing parentheses.")
        body = self.suite(start)
        family = "Python" if body.data["style"] == "indent" else "shared-c"
        if start.text == "while":
            node = Node("While", self.join(start.span, body.span), {"condition": condition, "body": body})
        else:
            branches = [{"condition": condition, "body": body}]
            otherwise = None
            while self.peek().text in ("elif", "else"):
                if family == "Python" and self.peek().span.column != start.span.column:
                    break
                branch = self.take()
                if branch.text == "elif" or self.match("if"):
                    next_condition = expression(self)
                    next_body = self.suite(branch)
                    branches.append({"condition": next_condition, "body": next_body})
                else:
                    otherwise = self.suite(branch)
                    break
            node = Node("If", self.join(start.span, self.previous().span), {"branches": branches, "else": otherwise})
        return self.record(node, family, start.text, ["indentation suite" if family == "Python" else "parenthesized condition and braces"])

    def statement(self) -> Node:
        token = self.peek()
        if token.text in ("class", "import", "from", "using", "namespace", "GOTO", "LABEL", "IF", "THEN", "END"):
            self.error(token, "P004", f"Unsupported construct {token.text!r}.", "Use the documented syntax subset.")
        if token.text in ("let", "const"):
            node = c_family.javascript_declaration(self)
            self.end(True)
            return node
        if token.text == "function":
            return c_family.javascript_function(self)
        if token.text == "console":
            return c_family.javascript_output(self)
        if token.text == "printf":
            return c_family.formatted_output(self)
        if token.text in ("LET", "PRINT"):
            return basic_family.statement(self)
        if token.text in TYPES:
            offset = 3 if self.peek(1).text == "[" and self.peek(2).text == "]" else 1
            if self.peek(offset + 1).text == "(":
                return c_family.function(self)
            node = c_family.declaration(self)
            self.end(True)
            return self.record(node, "shared-c", "typed-declaration", ["type keyword and semicolon"])
        if token.text == "def":
            return python_family.function(self)
        if token.text in ("if", "while"):
            return self.control()
        if token.text == "for":
            return c_family.for_loop(self) if self.peek(1).text == "(" else python_family.for_loop(self)
        if token.text in ("std", "cout", "System"):
            return c_family.output(self)
        if token.text in ("return", "break", "continue"):
            start = self.take()
            value = expression(self) if start.text == "return" and not self.at("NEWLINE") and not self.at(";") else None
            node = Node(start.text.capitalize(), self.join(start.span, value.span if value else start.span), {"value": value})
            self.end()
            return self.record(node, "shared", start.text, ["shared control statement"])
        if token.text == "print":
            start = self.take()
            args = self.arguments()
            node = Node("Output", self.join(start.span, self.previous().span), {"args": args, "separator": " " if len(args) > 1 else "", "ending": "\n"})
            self.end()
            return self.record(node, "Python", "print", ["recognized print builtin"])
        if token.kind == "NAME" and self.peek(1).text in ("=", "+=", "-=", "["):
            node = self.assignment()
            self.end()
            return self.record(node, "shared", "assignment", ["shared assignment spelling"])
        if token.kind == "NAME" and self.peek(1).text == "(":
            value = expression(self)
            node = Node("Expression", value.span, {"value": value})
            self.end()
            return self.record(node, "shared", "function-call", ["shared call spelling"])
        self.error(token, "P004", "Unsupported or malformed statement.")
