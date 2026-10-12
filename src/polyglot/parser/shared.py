"""One Pratt expression grammar for every syntax family."""

from ..ast import Node

TYPES = {"int": "int", "float": "float", "double": "float", "bool": "bool", "boolean": "bool",
         "str": "string", "string": "string", "String": "string", "void": "void"}
PRECEDENCE = {"or": 1, "||": 1, "and": 2, "&&": 2, "==": 4, "!=": 4, "<": 4,
              "<=": 4, ">": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6}
COMPARISONS = {"==", "!=", "<", "<=", ">", ">="}
NORMAL = {"&&": "and", "||": "or", "!": "not"}


def expression(p, minimum: int = 0) -> Node:
    token = p.take()
    if token.text in ("+", "-", "not", "!"):
        right = expression(p, 3 if token.text in ("not", "!") else 7)
        left = Node("Unary", p.join(token.span, right.span), {"op": NORMAL.get(token.text, token.text), "value": right})
    elif token.kind in ("NUMBER", "STRING"):
        left = Node("Literal", token.span, {"value": token.value})
    elif token.text in ("true", "false", "True", "False"):
        left = Node("Literal", token.span, {"value": token.text in ("true", "True")})
    elif token.text == "(":
        left = expression(p)
        p.expect(")")
        left.meta["parenthesized"] = True
    elif token.kind == "NAME":
        left = Node("Name", token.span, {"name": token.text})
    else:
        p.error(token, "P010", "Expected an expression.")
    if p.at("("):
        if left.kind != "Name":
            p.error(p.peek(), "P011", "Only named function calls are supported.")
        args = p.arguments()
        left = Node("Call", p.join(left.span, p.previous().span), {"name": left.data["name"], "args": args})
    while p.peek().text in PRECEDENCE and PRECEDENCE[p.peek().text] >= minimum:
        op = p.take()
        if op.text in COMPARISONS and left.kind == "Binary" and left.data["op"] in COMPARISONS and not left.meta.get("parenthesized"):
            p.error(op, "P012", "Chained comparisons are unsupported.", "Combine comparisons with 'and'.")
        right = expression(p, PRECEDENCE[op.text] + 1)
        left = Node("Binary", p.join(left.span, right.span), {"op": NORMAL.get(op.text, op.text), "left": left, "right": right})
    return left
