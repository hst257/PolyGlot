"""Compile literal printf formats into a small, explicit formatting plan."""

FORMAT_TYPES = {"d": "int", "f": "float", "s": "string"}


class FormatError(ValueError):
    pass


def parse_format(text: str) -> tuple[list[dict], list[str]]:
    segments, types, literal = [], [], []
    position = 0
    while position < len(text):
        character = text[position]
        position += 1
        if character != "%":
            literal.append(character)
            continue
        if position == len(text):
            raise FormatError("Trailing '%' in printf format.")
        specifier = text[position]
        position += 1
        if specifier == "%":
            literal.append("%")
            continue
        if specifier not in FORMAT_TYPES:
            raise FormatError(f"Unsupported printf format %{specifier}.")
        if literal:
            segments.append({"kind": "literal", "text": "".join(literal)})
            literal = []
        segments.append({"kind": "value", "specifier": specifier, "index": len(types)})
        types.append(FORMAT_TYPES[specifier])
    if literal:
        segments.append({"kind": "literal", "text": "".join(literal)})
    return segments, types
