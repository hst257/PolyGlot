"""Restricted BASIC spellings normalize to shared assignments and output."""

from ..ast import Node
from .shared import expression


def statement(p):
    start = p.take()
    if start.text == "LET":
        node = p.assignment()
        if node.data["op"] != "=":
            p.error(start, "P030", "BASIC LET requires '=' assignment.")
        node.span = p.join(start.span, node.span)
        p.end()
        return p.record(node, "BASIC", "let-assignment", ["explicit uppercase LET prefix"])
    args = [] if p.at("NEWLINE") or p.at(";") else [expression(p)]
    node = Node("Output", p.join(start.span, p.previous().span), {"args": args, "separator": "", "ending": "\n"})
    p.end()
    return p.record(node, "BASIC", "basic-print", ["explicit uppercase PRINT builtin"])
