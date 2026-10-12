"""Shared C++/Java grammar, with explicit built-in output forms."""

from ..ast import Node
from .shared import TYPES, expression


def declaration(p):
    start, name = p.take(), p.expect("NAME")
    if p.at("{"):
        p.error(name, "P022", "A function declaration needs a name followed by parameters.", "Use int name(int parameter) { ... }.")
    value = expression(p) if p.match("=") else None
    return Node("Declare", p.join(start.span, p.previous().span), {"name": name.text, "type": TYPES[start.text], "value": value})


def function(p):
    start, name = p.take(), p.expect("NAME")
    p.expect("(")
    params = []
    if not p.at(")"):
        while True:
            type_token = p.expect("NAME")
            if type_token.text not in TYPES:
                p.error(type_token, "P020", "Function parameters require a supported type.")
            parameter = p.expect("NAME")
            params.append({"name": parameter.text, "type": TYPES[type_token.text], "span": parameter.span})
            if not p.match(","):
                break
    p.expect(")")
    if not p.at("{"):
        p.error(p.peek(), "P001", "Typed functions require a brace body.")
    body = p.suite(start)
    node = Node("Function", p.join(start.span, body.span), {"name": name.text, "params": params,
                                                          "return_type": TYPES[start.text], "body": body})
    return p.record(node, "shared-c", "typed-function", ["typed signature and braces"])


def for_loop(p):
    start = p.expect("for")
    p.expect("(")
    initial = None
    if not p.at(";"):
        initial = declaration(p) if p.peek().text in TYPES else p.assignment()
    p.expect(";")
    condition = expression(p) if not p.at(";") else Node("Literal", p.peek().span, {"value": True})
    p.expect(";")
    update = p.assignment() if not p.at(")") else None
    p.expect(")")
    if not p.at("{"):
        p.error(p.peek(), "P001", "Three-part loops require a brace body.")
    body = p.suite(start)
    node = Node("For", p.join(start.span, body.span), {"initial": initial, "condition": condition, "update": update, "body": body})
    return p.record(node, "shared-c", "three-part-for", ["semicolon-separated header and braces"])


def output(p):
    start = p.take()
    if start.text == "System":
        for part in (".", "out", ".", "println"):
            p.expect(part)
        args = p.arguments()
        if len(args) != 1:
            p.error(start, "P023", "System.out.println requires exactly one argument.")
        node = Node("Output", p.join(start.span, p.previous().span), {"args": args, "separator": "", "ending": "\n"})
        p.end(True)
        return p.record(node, "Java", "println", ["recognized System.out.println builtin"])
    if start.text == "std":
        p.expect("::")
        p.expect("cout")
    pieces = []
    if not p.at("<<"):
        p.error(p.peek(), "P023", "cout requires an insertion chain.")
    while p.match("<<"):
        item = p.peek()
        if item.text == "endl" or (item.text == "std" and p.peek(1).text == "::" and p.peek(2).text == "endl"):
            if p.match("std"):
                p.expect("::")
            p.expect("endl")
            if pieces:
                pieces[-1].data["ending"] += "\n"
            else:
                pieces.append(Node("Output", item.span, {"args": [], "separator": "", "ending": "\n"}))
        else:
            value = expression(p)
            pieces.append(Node("Output", value.span, {"args": [value], "separator": "", "ending": ""}))
    node = pieces[0] if len(pieces) == 1 else Node("OutputSequence", start.span, {"body": pieces})
    node.span = p.join(start.span, p.previous().span)
    p.end(True)
    return p.record(node, "C++", "cout-chain", ["recognized cout insertion builtin"])
