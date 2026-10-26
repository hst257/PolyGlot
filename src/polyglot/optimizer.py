"""Conservative local IR optimization before stack-bytecode generation.

Only proven primitive constants are folded. Operations that can raise a runtime
error are retained unless their exact successful result is known. Calls, stores,
loads, array operations and output are never removed as dead pure expressions.
"""

import copy
import math
from dataclasses import asdict
from .analysis import analyze_function

UNKNOWN = object()


def safe_constant(value, expected: str) -> bool:
    actual = {bool: "bool", int: "int", float: "float", str: "string"}.get(type(value))
    if actual != expected:
        return False
    if type(value) is int:
        return value.bit_length() <= 1_000_000
    if type(value) is float:
        return math.isfinite(value)
    if type(value) is str:
        return len(value.encode("utf-8")) <= 131072
    return True


def constant_result(instruction: dict, constants: dict):
    op = instruction["op"]
    value = constants.get(instruction.get("value"), UNKNOWN)
    try:
        if op == "MOVE":
            return value
        if op in ("UNARY", "WIDEN") and value is not UNKNOWN:
            operator = instruction.get("operator", "float")
            if operator == "float":
                return float(value)
            if operator == "not":
                return not value
            if operator == "-":
                return -value
            if operator == "+":
                return +value
        if op != "BINARY":
            return UNKNOWN
        left = constants.get(instruction["left"], UNKNOWN)
        right = constants.get(instruction["right"], UNKNOWN)
        if left is UNKNOWN or right is UNKNOWN:
            return UNKNOWN
        operator = instruction["operator"]
        if operator == "+":
            return left + right
        if operator == "-":
            return left - right
        if operator == "*":
            return left * right
        if operator == "/":
            return left / right
        if operator == "%":
            # Match the VM's truncation-toward-zero remainder, including negatives.
            if type(left) is type(right) is int:
                return (abs(left) % abs(right)) * (-1 if left < 0 else 1)
            return math.fmod(left, right)
        if operator == "==":
            return left == right
        if operator == "!=":
            return left != right
        if operator == "<":
            return left < right
        if operator == "<=":
            return left <= right
        if operator == ">":
            return left > right
        if operator == ">=":
            return left >= right
        if operator == "and":
            return left and right
        if operator == "or":
            return left or right
    except (ZeroDivisionError, OverflowError, ValueError, TypeError):
        # Preserve the original runtime operation, diagnostic and source location.
        pass
    return UNKNOWN


def optimize_functions(functions: list) -> tuple[list, dict]:
    optimized, reports = [], []
    budget = 3000
    for index, original in enumerate(functions):
        fn = copy.deepcopy(original)
        before = len(fn.instructions)
        report = {"id": fn.id, "name": fn.name, "before": before, "after": before,
                  "constant_folds": 0, "constant_branches": 0, "unreachable_removed": 0, "dead_constants_removed": 0}
        reports.append(report)
        optimized.append(fn)
        # Bounded analysis avoids making large valid programs harder to compile.
        if index >= 12 or before > 1500 or before > budget:
            report["skipped"] = "Optimization analysis limit reached. Original IR retained."
            continue
        cfg = analyze_function(asdict(fn))
        if "omitted" in cfg:
            report["skipped"] = cfg["omitted"]
            continue
        budget -= before

        # Constants are local to a basic block. No facts are propagated through
        # mutable storage, calls or control-flow joins.
        folded = []
        for block in cfg["blocks"]:
            constants = {}
            for original_instruction in fn.instructions[block["start"]:block["end"]]:
                instruction = copy.deepcopy(original_instruction)
                op = instruction["op"]
                result = constant_result(instruction, constants)
                if result is not UNKNOWN and safe_constant(result, instruction.get("type", "")):
                    instruction = {"op": "CONST", "dest": instruction["dest"], "value": result,
                                   "type": instruction["type"], "source": instruction["source"]}
                    report["constant_folds"] += 1
                elif op == "BRANCH" and type(constants.get(instruction["condition"])) is bool:
                    target = instruction["true"] if constants[instruction["condition"]] else instruction["false"]
                    instruction = {"op": "JUMP", "target": target, "source": instruction["source"]}
                    report["constant_branches"] += 1
                dest = instruction.get("dest")
                if dest is not None:
                    constants.pop(dest, None)
                    if instruction["op"] == "CONST" and safe_constant(instruction["value"], instruction["type"]):
                        constants[dest] = instruction["value"]
                folded.append(instruction)
        fn.instructions = folded

        # Rebuild the graph after branch simplification, then remove only blocks
        # that have no path from this function's entry.
        cfg = analyze_function(asdict(fn))
        reachable = []
        for block in cfg["blocks"]:
            instructions = fn.instructions[block["start"]:block["end"]]
            if block["reachable"]:
                reachable.extend(instructions)
            else:
                report["unreachable_removed"] += len(instructions)
        fn.instructions = reachable

        # Next-use facts are seeded by cross-block liveness. Removing a CONST
        # removes no operand uses, so no additional dead-use iteration is needed.
        # Never discard a LOAD, division, call, array check or other trapping op.
        cfg = analyze_function(asdict(fn))
        retained = []
        for block in cfg["blocks"]:
            for row in block["rows"]:
                instruction = fn.instructions[row["index"]]
                needed = any(n["at"] is not None or n["live_out"] for n in row["next"])
                if (instruction["op"] == "CONST" and not needed
                        and safe_constant(instruction["value"], instruction["type"])):
                    report["dead_constants_removed"] += 1
                    continue
                retained.append(instruction)
        fn.instructions = retained
        report["after"] = len(retained)
    return optimized, {"enabled": True, "functions": reports,
                       "passes": ["local constant folding", "constant branch simplification", "unreachable basic-block removal", "liveness and next-use dead constant removal"],
                       "limits": {"functions": 12, "instructions_per_function": 1500, "total_instructions": 3000, "blocks_per_function": 120}}
