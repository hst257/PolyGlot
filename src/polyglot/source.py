"""Source positions shared by every compiler stage."""

from bisect import bisect_right
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Span:
    filename: str
    start: int
    end: int
    line: int
    column: int
    end_line: int
    end_column: int


class Source:
    def __init__(self, text: str, filename: str = "program.poly"):
        self.text = text
        self.filename = filename
        self.lines = text.splitlines()
        self.starts = [0] + [i + 1 for i, c in enumerate(text) if c == "\n"]

    def span(self, start: int, end: int) -> Span:
        a = bisect_right(self.starts, start) - 1
        b = bisect_right(self.starts, end) - 1
        return Span(self.filename, start, end, a + 1, start - self.starts[a] + 1,
                    b + 1, end - self.starts[b] + 1)

    def excerpt(self, span: Span) -> str:
        return self.lines[span.line - 1] if 0 < span.line <= len(self.lines) else ""

    def location(self, span: Span) -> dict:
        return {**asdict(span), "excerpt": self.excerpt(span)}
