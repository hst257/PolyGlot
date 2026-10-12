"""Python-inspired headers reuse shared expression and suite grammars."""

from ..ast import Node
from .shared import expression, type_spec


def annotation(p):
    return type_spec(p)


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
    iterable = expression(p)
    is_range = iterable.kind == "Call" and iterable.data["name"] == "range"
    if is_range and not 1 <= len(iterable.data["args"]) <= 3:
        p.error(variable, "P021", "range requires one, two, or three arguments.")
    if not p.at(":"):
        p.error(p.peek(), "P001", "Python-style for-loop headers require a colon.")
    body = p.suite(start)
    if is_range:
        node = Node("Range", p.join(start.span, body.span), {"name": variable.text, "args": iterable.data["args"], "body": body})
        return p.record(node, "Python", "range-loop", ["for/in/range and indentation"])
    node = Node("ForEach", p.join(start.span, body.span), {"name": variable.text, "iterable": iterable, "body": body})
    return p.record(node, "Python", "for-in-loop", ["for/in expression and indentation"])
