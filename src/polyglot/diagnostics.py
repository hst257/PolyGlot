"""Structured errors; compilation failures never reach execution."""

from dataclasses import dataclass, field
from .source import Source, Span


@dataclass
class Diagnostic:
    code: str
    message: str
    location: dict
    suggestion: str = ""
    related: list[dict] = field(default_factory=list)
    stack: list[dict] = field(default_factory=list)

    def render(self) -> str:
        p = self.location
        width = max(1, min(p.get("end_column", p["column"] + 1) - p["column"], 60))
        result = (f'{p["filename"]}:{p["line"]}:{p["column"]}: {self.code}: {self.message}\n'
                  f'  {p.get("excerpt", "")}\n  {" " * (p["column"] - 1)}{"^" * width}')
        if self.suggestion:
            result += f"\n  Help: {self.suggestion}"
        for site in self.stack:
            result += f'\n  at {site["function"]} ({site["filename"]}:{site["line"]})'
        return result


class PolyglotError(Exception):
    def __init__(self, diagnostic: Diagnostic):
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic


def fail(source: Source, span: Span, code: str, message: str, suggestion: str = "",
         related: list[dict] | None = None) -> None:
    raise PolyglotError(Diagnostic(code, message, source.location(span), suggestion, related or []))
