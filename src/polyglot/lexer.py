"""Character lexer. Braces do not suppress logical newlines; parentheses do."""

from dataclasses import dataclass
from .source import Source, Span
from .diagnostics import fail


@dataclass(frozen=True)
class Token:
    kind: str
    text: str
    value: object
    span: Span


def lex(source: Source) -> list[Token]:
    text = source.text.replace("\r\n", "\n")
    if text != source.text:
        source.__init__(text, source.filename)
    tokens: list[Token] = []
    i = 0
    parens: list[int] = []
    leading = True

    def emit(kind: str, start: int, end: int, value: object = None) -> None:
        tokens.append(Token(kind, text[start:end], value, source.span(start, end)))

    def newline(pos: int) -> None:
        if not parens and (not tokens or tokens[-1].kind != "NEWLINE"):
            emit("NEWLINE", pos, min(pos + 1, len(text)))

    while i < len(text):
        c = text[i]
        if c in " \t":
            if c == "\t" and leading:
                fail(source, source.span(i, i + 1), "L001", "Tabs in indentation are unsupported.",
                     "Use spaces for indentation.")
            i += 1
            continue
        if c == "\n":
            newline(i)
            leading = True
            i += 1
            continue
        if c == "#" or text.startswith("//", i):
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        if text.startswith("/*", i):
            start = i
            end = text.find("*/", i + 2)
            if end < 0:
                fail(source, source.span(start, start + 2), "L002", "Unclosed block comment.")
            for p in range(i, end + 2):
                if text[p] == "\n":
                    newline(p)
                    leading = True
            i = end + 2
            continue
        leading = False
        start = i
        if c in "\"'":
            quote = c
            if text.startswith(c * 3, i):
                fail(source, source.span(i, i + 3), "L003", "Triple-quoted strings are unsupported.")
            i += 1
            value = ""
            escapes = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\", "'": "'", '"': '"'}
            while i < len(text) and text[i] != quote:
                if text[i] == "\n":
                    fail(source, source.span(start, i), "L004", "Unclosed string literal.")
                if text[i] == "\\":
                    i += 1
                    if i >= len(text) or text[i] not in escapes:
                        fail(source, source.span(i - 1, min(i + 1, len(text))), "L005", "Unsupported string escape.")
                    value += escapes[text[i]]
                else:
                    value += text[i]
                i += 1
            if i >= len(text):
                fail(source, source.span(start, i), "L004", "Unclosed string literal.")
            i += 1
            emit("STRING", start, i, value)
        elif c.isascii() and (c.isalpha() or c == "_"):
            i += 1
            while i < len(text) and text[i].isascii() and (text[i].isalnum() or text[i] == "_"):
                i += 1
            emit("NAME", start, i, text[start:i])
        elif c.isascii() and c.isdigit():
            i += 1
            while i < len(text) and text[i].isascii() and text[i].isdigit():
                i += 1
            floating = False
            if i < len(text) and text[i] == "." and i + 1 < len(text) and text[i + 1].isdigit():
                floating = True
                i += 1
                while i < len(text) and text[i].isascii() and text[i].isdigit():
                    i += 1
            if i < len(text) and text[i] in "eE":
                floating = True
                i += 1
                if i < len(text) and text[i] in "+-":
                    i += 1
                exponent = i
                while i < len(text) and text[i].isascii() and text[i].isdigit():
                    i += 1
                if i == exponent:
                    fail(source, source.span(start, i), "L006", "Invalid numeric exponent.")
            spelling = text[start:i]
            try:
                value = float(spelling) if floating else int(spelling)
            except ValueError:
                fail(source, source.span(start, i), "L006", "Numeric literal is too large or invalid.")
            emit("NUMBER", start, i, value)
        else:
            op = next((p for p in ("::", "<<", "->", "+=", "-=", "++", "--", "==", "!=", "<=", ">=", "&&", "||")
                       if text.startswith(p, i)), None)
            if op:
                i += len(op)
            elif c in "()[]{}:;,+-*/%<>=!.":
                op = c
                i += 1
            else:
                fail(source, source.span(i, i + 1), "L007", f"Invalid token {c!r}.")
            if op in ("(", "["):
                parens.append(start)
            elif op in (")", "]"):
                if not parens or text[parens[-1]] != ("(" if op == ")" else "["):
                    fail(source, source.span(start, i), "L008", "Unexpected or mismatched closing delimiter.")
                parens.pop()
            emit("OP", start, i)
    if parens:
        fail(source, source.span(parens[-1], parens[-1] + 1), "L008", "Unclosed parenthesis or array bracket.")
    if not tokens or tokens[-1].kind != "NEWLINE":
        emit("NEWLINE", len(text), len(text))
    emit("EOF", len(text), len(text))
    return tokens
