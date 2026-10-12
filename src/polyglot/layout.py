"""Parser-driven block context: only Python suites activate indentation."""

from dataclasses import dataclass
from .lexer import Token
from .source import Source
from .diagnostics import fail


@dataclass
class Context:
    style: str
    column: int


class Layout:
    def __init__(self, source: Source):
        self.source = source
        self.stack: list[Context] = []
        self.events: list[dict] = []

    def enter(self, style: str, token: Token) -> None:
        if len(self.stack) >= 100:
            fail(self.source, token.span, "P099", "Block nesting limit exceeded.")
        self.stack.append(Context(style, token.span.column))
        self.events.append({"kind": "INDENT" if style == "indent" else "BRACE_OPEN", "span": token.span})

    def leave(self, token: Token) -> None:
        context = self.stack.pop()
        self.events.append({"kind": "DEDENT" if context.style == "indent" else "BRACE_CLOSE", "span": token.span})
