"""Validated stack bytecode execution, call frames, guards, and resource limits."""

import math
import json
import time
from dataclasses import dataclass, field
from .artifact import validate
from .diagnostics import Diagnostic, PolyglotError
from .types import MAX_ARRAY_LENGTH, MAX_ARRAY_ELEMENTS
from .formats import FORMAT_TYPES

UNINITIALIZED = object()


@dataclass
class ArrayValue:
    element_type: str
    values: list


@dataclass
class Limits:
    steps: int = 1_000_000
    recursion: int = 64
    output: int = 65536
    timeout: float = 5.0


@dataclass
class Frame:
    function: dict
    locals: list
    ip: int = 0
    stack: list = field(default_factory=list)
    callsite: dict | None = None


def type_name(value):
    if isinstance(value, ArrayValue):
        return value.element_type + "[]"
    return {bool: "bool", int: "int", float: "float", str: "string"}.get(type(value))


def format_value(value):
    if isinstance(value, ArrayValue):
        return json.dumps(value.values, ensure_ascii=False, allow_nan=False)
    return "true" if value is True else "false" if value is False else str(value)


def run(artifact: dict, limits: Limits | None = None, *, trace_limit: int = 0) -> dict:
    validate(artifact)
    if type(trace_limit) is not int or not 0 <= trace_limit <= 120:
        raise ValueError("Trace limit must be an integer from 0 to 120.")
    limits = limits or Limits()
    if (any(type(v) is not int for v in (limits.steps, limits.recursion, limits.output))
            or type(limits.timeout) not in (int, float) or not math.isfinite(limits.timeout)
            or min(limits.steps, limits.recursion, limits.output, limits.timeout) <= 0):
        raise ValueError("Execution limits must be positive.")
    globals_ = [UNINITIALIZED] * artifact["global_count"]
    fn = artifact["functions"][artifact["entry"]]
    frames = [Frame(fn, [UNINITIALIZED] * fn["local_count"])]
    output, steps, output_size = [], 0, 0
    allocated_elements = 0
    events = []

    def preview(value):
        if value is UNINITIALIZED:
            return {"state": "uninitialized"}
        if isinstance(value, ArrayValue):
            return {"type": value.element_type + "[]", "length": len(value.values),
                    "items": [preview(v) for v in value.values[:8]]}
        if type(value) is str:
            return value[:80] + ("…" if len(value) > 80 else "")
        if type(value) is int and value.bit_length() > 256:
            return {"type": "int", "bits": value.bit_length(), "preview_omitted": True}
        return value

    def trace_result():
        return {"events": events, "limit": trace_limit, "truncated": steps > len(events),
                "timing": "State before the recorded instruction. First 120 instructions at most; values, labels and frame contents are bounded previews."}

    started = time.monotonic()
    while frames:
        frame = frames[-1]
        ip = frame.ip
        instruction = frame.function["code"][frame.ip]
        frame.ip += 1
        steps += 1
        op, args = instruction["op"], instruction["args"]
        if trace_limit and len(events) < trace_limit:
            events.append({"step": steps, "ip": ip, "function": preview(frame.function["name"]), "op": op,
                           "args": [preview(v) for v in args], "depth": len(frames),
                           "source": {"filename": instruction["source"]["filename"][:256],
                                      **{k: v for k, v in instruction["source"].items()
                                         if k in ("line", "column", "end_line", "end_column") and type(v) is int}},
                           "globals": [preview(v) for v in globals_[:8]], "globals_omitted": max(0, len(globals_) - 8),
                           "frames_omitted": max(0, len(frames) - 8),
                           "frames": [{"function": preview(f.function["name"]), "ip": ip if f is frame else f.ip,
                                       "locals": [preview(v) for v in f.locals[:8]], "locals_omitted": max(0, len(f.locals) - 8),
                                       "stack": [preview(v) for v in f.stack[-8:]], "stack_omitted": max(0, len(f.stack) - 8)}
                                      for f in frames[-8:]]})

        def error(code, message):
            stack = [{"function": f.function["name"], **(f.callsite or instruction["source"])}
                     for f in reversed(frames)]
            failure = PolyglotError(Diagnostic(code, message, instruction["source"], stack=stack))
            failure.output = "".join(output)
            if trace_limit:
                failure.trace = trace_result()
            raise failure

        def checked(value):
            if type(value) is float and not math.isfinite(value):
                error("R005", "Nonfinite numeric result.")
            if type(value) is str and len(value.encode("utf-8")) > 131072:
                error("R010", "String value exceeds the 128 KiB resource limit.")
            if type(value) is int and value.bit_length() > 1_000_000:
                error("R010", "Integer value exceeds the execution resource limit.")
            return value

        def array_index(array, index):
            if not isinstance(array, ArrayValue) or type(index) is not int:
                error("R007", "Array access requires an array and an integer index.")
            if not 0 <= index < len(array.values):
                error("R012", f"Array index {index} is outside bounds [0, {len(array.values)}).")

        def array_size(size):
            if type(size) is not int or not 0 <= size <= MAX_ARRAY_LENGTH:
                error("R013", f"Array length must be an integer between 0 and {MAX_ARRAY_LENGTH}.")

        def allocate(element, values):
            nonlocal allocated_elements
            array_size(len(values))
            if any(type_name(v) != element for v in values):
                error("R007", "Array elements have incompatible types.")
            allocated_elements += max(1, len(values))
            if allocated_elements > MAX_ARRAY_ELEMENTS:
                error("R013", "Array allocation budget exceeded.")
            return ArrayValue(element, values)

        if steps > limits.steps:
            error("R001", "Instruction execution limit exceeded.")
        if time.monotonic() - started > limits.timeout:
            error("R002", "Execution timeout exceeded.")
        try:
            if op == "CONST":
                frame.stack.append(checked(artifact["constants"][args[0]]["value"]))
            elif op.startswith("LOAD_"):
                value = (globals_ if op.endswith("GLOBAL") else frame.locals)[args[0]]
                if value is UNINITIALIZED:
                    error("R003", "Read of an uninitialized variable.")
                frame.stack.append(value)
            elif op.startswith("STORE_"):
                (globals_ if op.endswith("GLOBAL") else frame.locals)[args[0]] = frame.stack.pop()
            elif op == "POP":
                frame.stack.pop()
            elif op == "UNARY":
                v, operator = frame.stack.pop(), args[0]
                if operator == "not":
                    if type(v) is not bool:
                        error("R007", "Logical negation requires a Boolean.")
                    value = not v
                else:
                    if type(v) not in (int, float):
                        error("R007", "Numeric unary operation requires a number.")
                    value = float(v) if operator == "float" else -v if operator == "-" else +v
                frame.stack.append(checked(value))
            elif op == "BINARY":
                b, a = frame.stack.pop(), frame.stack.pop()
                operator = args[0]
                numeric = type(a) in (int, float) and type(b) in (int, float)
                if operator in ("and", "or"):
                    if type(a) is not bool or type(b) is not bool:
                        error("R007", "Boolean operation requires Booleans.")
                elif operator in ("==", "!="):
                    if isinstance(a, ArrayValue) or isinstance(b, ArrayValue) or not (numeric or type_name(a) == type_name(b)):
                        error("R007", "Comparison operands have incompatible types.")
                elif not numeric and not (type(a) is type(b) is str and operator in ("+", "<", "<=", ">", ">=")):
                    error("R007", "Operands have incompatible types.")
                if operator in ("/", "%") and b == 0:
                    error("R004", "Division or remainder by zero.")
                if operator == "%":
                    value = (abs(a) % abs(b)) * (-1 if a < 0 else 1) if type(a) is type(b) is int else math.fmod(a, b)
                else:
                    value = {"+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b, "/": lambda: a / b,
                             "==": lambda: a == b, "!=": lambda: a != b, "<": lambda: a < b, "<=": lambda: a <= b,
                             ">": lambda: a > b, ">=": lambda: a >= b, "and": lambda: a and b, "or": lambda: a or b}[operator]()
                frame.stack.append(checked(value))
            elif op == "FORMAT":
                value = frame.stack.pop()
                if type_name(value) != FORMAT_TYPES[args[0]]:
                    error("R007", "Formatting value has an incompatible type.")
                rendered = format(value, ".6f") if args[0] == "f" else str(value)
                frame.stack.append(checked(rendered))
            elif op == "ARRAY_BUILD":
                values = [frame.stack.pop() for _ in range(args[1])][::-1]
                frame.stack.append(allocate(args[0], values))
            elif op == "ARRAY_NEW":
                size = frame.stack.pop()
                array_size(size)
                default = {"int": 0, "float": 0.0, "bool": False, "string": ""}[args[0]]
                frame.stack.append(allocate(args[0], [default] * size))
            elif op in ("ARRAY_GET", "ARRAY_SET", "ARRAY_CHECK"):
                value = frame.stack.pop() if op == "ARRAY_SET" else None
                index, array = frame.stack.pop(), frame.stack.pop()
                array_index(array, index)
                if op == "ARRAY_GET":
                    frame.stack.append(array.values[index])
                elif op == "ARRAY_SET":
                    if type_name(value) != array.element_type:
                        error("R007", "Array element assignment has an incompatible type.")
                    array.values[index] = checked(value)
            elif op == "ARRAY_LENGTH":
                array = frame.stack.pop()
                if not isinstance(array, ArrayValue):
                    error("R007", "Array length requires an array.")
                frame.stack.append(len(array.values))
            elif op == "ARRAY_SIZE_CHECK":
                size, array = frame.stack.pop(), frame.stack.pop()
                array_size(size)
                if not isinstance(array, ArrayValue):
                    error("R007", "Array size validation requires an array.")
                if size != len(array.values):
                    error("R014", "Array initializer length does not match the declared length.")
            elif op in ("JUMP", "JUMP_IF_FALSE"):
                if op == "JUMP":
                    frame.ip = args[0]
                else:
                    condition = frame.stack.pop()
                    if type(condition) is not bool:
                        error("R007", "Branch condition must be a Boolean.")
                    if not condition:
                        frame.ip = args[0]
            elif op == "CALL":
                if len(frames) - 1 >= limits.recursion:
                    error("R011", "Recursion/call-depth limit exceeded.")
                values = [frame.stack.pop() for _ in range(args[1])][::-1]
                callee = artifact["functions"][args[0]]
                if [type_name(v) for v in values] != callee["params"]:
                    error("R007", "Bytecode call has incompatible argument types.")
                locals_ = [UNINITIALIZED] * callee["local_count"]
                locals_[:len(values)] = values
                frames.append(Frame(callee, locals_, callsite=instruction["source"]))
            elif op in ("RETURN_VALUE", "RETURN_VOID"):
                value = frame.stack.pop() if op == "RETURN_VALUE" else None
                if op == "RETURN_VALUE" and type_name(value) != frame.function["return_type"]:
                    error("R007", "Bytecode return type is incompatible.")
                frames.pop()
                if frames and op == "RETURN_VALUE":
                    frames[-1].stack.append(value)
            elif op == "OUTPUT":
                values = [frame.stack.pop() for _ in range(args[0])][::-1]
                rendered = args[1].join(format_value(v) for v in values) + args[2]
                output_size += len(rendered.encode("utf-8"))
                if output_size > limits.output:
                    error("R006", "Output size limit exceeded.")
                output.append(rendered)
            elif op == "ASSERT":
                condition = frame.stack.pop()
                if type(condition) is not bool:
                    error("R007", "Runtime guard requires a Boolean.")
                if not condition:
                    error(args[0], args[1])
            elif op == "TRAP":
                error(args[0], args[1])
        except (IndexError, TypeError, ValueError, OverflowError, ZeroDivisionError) as exc:
            error("R007", f"Invalid runtime operation: {exc}")
    result = {"output": "".join(output), "steps": steps}
    if trace_limit:
        result["trace"] = trace_result()
    return result
