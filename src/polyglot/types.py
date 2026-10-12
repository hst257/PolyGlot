"""Common primitive and one-dimensional array types."""

VALUE_TYPES = ("int", "float", "bool", "string")
MAX_ARRAY_LENGTH = 1_000
MAX_ARRAY_ELEMENTS = 100_000


def is_array(type_name: str) -> bool:
    return isinstance(type_name, str) and type_name.endswith("[]") and type_name[:-2] in VALUE_TYPES


def is_value_type(type_name: str) -> bool:
    return type_name in VALUE_TYPES or is_array(type_name)
