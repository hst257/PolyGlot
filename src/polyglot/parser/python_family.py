"""Python-inspired headers reuse shared expression and suite grammars."""

from ..ast import Node
from .shared import TYPES, expression


def annotation(p):
    token = p.expect("NAME")
    if token.text not in TYPES:
        p.error(token, "P020", "Unknown type annotation.")
    return TYPES[token.text]


def function(p):
    start = p.expect("def")
    name = p.expect("NAME")
    p.expect("(")
    params = []
    if not p.at(")"):
        while True:
            parameter = p.expect("NAME")
            if not p.match(":"):
                p.error(p.peek(), "P020", "Function parameters require annotations.", "Write name: int (or another supported type).")
            params.append({"name": parameter.text, "type": annotation(p), "span": parameter.span})
            if not p.match(","):
                break
    p.expect(")")
    if not p.match("->"):
        p.error(p.peek(), "P020", "Functions require a return annotation.", "Add -> int, -> float, -> bool, -> string, or -> void.")
    result = annotation(p)
    if not p.at(":"):
        p.error(p.peek(), "P001", "Python-style function headers require a colon.")
    body = p.suite(start)
    node = Node("Function", p.join(start.span, body.span), {"name": name.text, "params": params, "return_type": result, "body": body})
    return p.record(node, "Python", "annotated-function", ["def, annotations, colon and indentation"])


def for_loop(p):
    start = p.expect("for")
    variable = p.expect("NAME")
    p.expect("in")
    p.expect("range")
    args = p.arguments()
    if not 1 <= len(args) <= 3:
        p.error(variable, "P021", "range requires one, two, or three arguments.")
    if not p.at(":"):
        p.error(p.peek(), "P001", "Range-loop headers require a colon.")
    body = p.suite(start)
    node = Node("Range", p.join(start.span, body.span), {"name": variable.text, "args": args, "body": body})
    return p.record(node, "Python", "range-loop", ["for/in/range and indentation"])
