"""Versioned JSON loader with operand and control-flow stack validation."""

import json
import math
from collections import deque
from .types import VALUE_TYPES, is_value_type, MAX_ARRAY_LENGTH

UNARY = {"+", "-", "not", "float"}
BINARY = {"+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "and", "or"}


class ArtifactError(ValueError):
    pass


def validate(artifact: dict) -> dict:
    def require(condition, message):
        if not condition:
            raise ArtifactError(message)

    def index(value, size):
        return type(value) is int and 0 <= value < size

    require(type(artifact) is dict, "Artifact must be an object.")
    require(artifact.get("format") == "polyglot-bytecode" and type(artifact.get("version")) is int
            and artifact["version"] in (1, 2), "Unsupported artifact format/version.")
    version = artifact["version"]
    constants, functions = artifact.get("constants"), artifact.get("functions")
    require(type(constants) is list and len(constants) <= 100000 and type(functions) is list
            and 0 < len(functions) <= 1000, "Invalid constant/function tables.")
    require(type(artifact.get("global_count")) is int and 0 <= artifact["global_count"] <= 100000,
            "Invalid global storage count.")
    require(index(artifact.get("entry"), len(functions)), "Invalid entry function.")
    for constant in constants:
        require(type(constant) is dict, "Invalid constant.")
        require(type(constant.get("type")) is str, "Invalid constant type.")
        expected = {"int": int, "float": float, "bool": bool, "string": str}.get(constant["type"])
        require(expected is not None and type(constant.get("value")) is expected, "Invalid constant type/value.")
        if expected is float:
            require(math.isfinite(constant["value"]), "Nonfinite constant.")
    for fid, fn in enumerate(functions):
        require(type(fn) is dict and type(fn.get("id")) is int and fn["id"] == fid
                and type(fn.get("name")) is str, "Invalid function identity.")
        locals_count = fn.get("local_count")
        require(type(locals_count) is int and 0 <= locals_count <= 100000, "Invalid local storage count.")
        valid_type = is_value_type if version == 2 else lambda t: t in VALUE_TYPES
        require(type(fn.get("params")) is list and all(valid_type(t) for t in fn["params"])
                and len(fn["params"]) <= locals_count, "Invalid function parameters.")
        require(fn.get("return_type") == "void" or valid_type(fn.get("return_type")), "Invalid return type.")
        require(type(fn.get("code")) is list and 0 < len(fn["code"]) <= 100000, "Invalid instruction table.")
    require(functions[artifact["entry"]]["params"] == []
            and functions[artifact["entry"]]["return_type"] == "void", "Entry must be a parameterless void function.")
    for fn in functions:
        code = fn["code"]
        for instruction in code:
            require(type(instruction) is dict and type(instruction.get("args")) is list, "Invalid instruction.")
            op, args, loc = instruction.get("op"), instruction["args"], instruction.get("source")
            require(type(op) is str, "Invalid opcode.")
            if op.startswith("ARRAY_"):
                require(version == 2, "Array instructions require artifact version 2.")
            require(type(loc) is dict and type(loc.get("filename")) is str and type(loc.get("line")) is int
                    and type(loc.get("column")) is int and loc["line"] > 0 and loc["column"] > 0
                    and type(loc.get("excerpt", "")) is str, "Invalid source mapping.")
            if op in ("CONST", "LOAD_LOCAL", "STORE_LOCAL", "LOAD_GLOBAL", "STORE_GLOBAL"):
                bound = len(constants) if op == "CONST" else fn["local_count"] if op.endswith("LOCAL") else artifact["global_count"]
                require(len(args) == 1 and index(args[0], bound), "Invalid storage/constant operand.")
            elif op in ("UNARY", "BINARY"):
                require(len(args) == 1 and type(args[0]) is str
                        and args[0] in (UNARY if op == "UNARY" else BINARY), "Invalid operation.")
            elif op == "OUTPUT":
                require(len(args) == 3 and type(args[0]) is int and 0 <= args[0] <= 1000
                        and type(args[1]) is str and type(args[2]) is str, "Invalid output operands.")
            elif op in ("JUMP", "JUMP_IF_FALSE"):
                require(len(args) == 1 and index(args[0], len(code)), "Invalid jump target.")
            elif op == "CALL":
                require(len(args) == 2 and index(args[0], len(functions)) and type(args[1]) is int
                        and args[1] == len(functions[args[0]]["params"]), "Invalid function reference/arity.")
            elif op == "ARRAY_BUILD":
                require(len(args) == 2 and args[0] in VALUE_TYPES and type(args[1]) is int
                        and 0 <= args[1] <= MAX_ARRAY_LENGTH, "Invalid array construction operands.")
            elif op == "ARRAY_NEW":
                require(len(args) == 1 and args[0] in VALUE_TYPES, "Invalid array element type.")
            elif op in ("ARRAY_GET", "ARRAY_SET", "ARRAY_CHECK", "ARRAY_LENGTH", "ARRAY_SIZE_CHECK"):
                require(not args, "Invalid array instruction operands.")
            elif op in ("ASSERT", "TRAP"):
                require(len(args) == 2 and all(type(v) is str for v in args), "Invalid runtime guard.")
            elif op in ("RETURN_VOID", "RETURN_VALUE", "POP"):
                require(not args, "Invalid instruction operands.")
                if op == "RETURN_VOID":
                    require(fn["return_type"] == "void", "Void return in a value function.")
                elif op == "RETURN_VALUE":
                    require(fn["return_type"] != "void", "Value return in a void function.")
            else:
                raise ArtifactError(f"Unknown instruction {op!r}.")
        # One incoming stack height per reachable instruction; branches must agree.
        heights, work = {0: 0}, deque([0])
        while work:
            position = work.popleft()
            instruction = code[position]
            op, args, height = instruction["op"], instruction["args"], heights[position]
            consume = 0
            produce = 0
            if op in ("CONST", "LOAD_LOCAL", "LOAD_GLOBAL"):
                produce = 1
            elif op in ("STORE_LOCAL", "STORE_GLOBAL", "POP", "JUMP_IF_FALSE", "ASSERT", "RETURN_VALUE"):
                consume = 1
            elif op == "UNARY":
                consume = produce = 1
            elif op == "BINARY":
                consume, produce = 2, 1
            elif op == "OUTPUT":
                consume = args[0]
            elif op == "CALL":
                consume = args[1]
                produce = int(functions[args[0]]["return_type"] != "void")
            elif op == "ARRAY_BUILD":
                consume, produce = args[1], 1
            elif op in ("ARRAY_NEW", "ARRAY_LENGTH"):
                consume = produce = 1
            elif op == "ARRAY_GET":
                consume, produce = 2, 1
            elif op in ("ARRAY_CHECK", "ARRAY_SIZE_CHECK"):
                consume = 2
            elif op == "ARRAY_SET":
                consume = 3
            require(height >= consume, "Operand stack underflow.")
            new_height = height - consume + produce
            require(new_height <= 4096, "Operand stack exceeds its limit.")
            if op in ("RETURN_VOID", "RETURN_VALUE", "TRAP"):
                require(op == "TRAP" or new_height == 0, "Return leaves values on the operand stack.")
                continue
            targets = [args[0]] if op == "JUMP" else [position + 1, args[0]] if op == "JUMP_IF_FALSE" else [position + 1]
            for target in targets:
                require(target < len(code), "Function can fall off the instruction table.")
                if target in heights:
                    require(heights[target] == new_height, "Inconsistent operand stack at branch merge.")
                else:
                    heights[target] = new_height
                    work.append(target)
    return artifact


def dumps(artifact: dict) -> str:
    validate(artifact)
    chunks, size = [], 0
    encoder = json.JSONEncoder(indent=2, ensure_ascii=False, allow_nan=False)
    for chunk in encoder.iterencode(artifact):
        size += len(chunk.encode("utf-8"))
        if size > 5_000_000:
            raise ArtifactError("Artifact exceeds the 5 MB limit.")
        chunks.append(chunk)
    return "".join(chunks)


def loads(text: str) -> dict:
    if len(text.encode("utf-8")) > 5_000_000:
        raise ArtifactError("Artifact exceeds the 5 MB limit.")
    def pairs(items):
        result = {}
        for name, value in items:
            if name in result:
                raise ArtifactError(f"Duplicate JSON key {name!r}.")
            result[name] = value
        return result
    try:
        value = json.loads(text, object_pairs_hook=pairs)
        return validate(value)
    except (ValueError, TypeError, KeyError, RecursionError) as exc:
        raise ArtifactError(f"Invalid bytecode artifact: {exc}") from exc
