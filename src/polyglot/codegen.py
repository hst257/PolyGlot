"""Translate three-address IR into independent stack bytecode."""

from .ir import IRFunction


def generate(functions: list[IRFunction], symbols: list[dict]) -> dict:
    constants, compiled = [], []
    for fn in functions:
        code, labels, jumps = [], {}, []

        def emit(op, args, location):
            code.append({"op": op, "args": args, "source": location})

        def load(temp, location):
            emit("LOAD_LOCAL", [fn.local_count + temp], location)

        def store(temp, location):
            emit("STORE_LOCAL", [fn.local_count + temp], location)

        def jump(op, target, loc):
            jumps.append((len(code), target))
            emit(op, [0], loc)

        for inst in fn.instructions:
            op, loc = inst["op"], inst["source"]
            if op == "LABEL":
                labels[inst["label"]] = len(code)
            elif op == "CONST":
                constants.append({"type": inst["type"], "value": inst["value"]})
                emit("CONST", [len(constants) - 1], loc)
                store(inst["dest"], loc)
            elif op == "LOAD":
                emit("LOAD_" + inst["storage"].upper(), [inst["slot"]], loc)
                store(inst["dest"], loc)
            elif op == "STORE":
                load(inst["value"], loc)
                emit("STORE_" + inst["storage"].upper(), [inst["slot"]], loc)
            elif op == "MOVE":
                load(inst["value"], loc)
                store(inst["dest"], loc)
            elif op in ("UNARY", "WIDEN"):
                load(inst["value"], loc)
                emit("UNARY", [inst.get("operator", "float")], loc)
                store(inst["dest"], loc)
            elif op == "BINARY":
                load(inst["left"], loc)
                load(inst["right"], loc)
                emit("BINARY", [inst["operator"]], loc)
                store(inst["dest"], loc)
            elif op == "OUTPUT":
                for value in inst["args"]:
                    load(value, loc)
                emit("OUTPUT", [len(inst["args"]), inst["separator"], inst["ending"]], loc)
            elif op == "BRANCH":
                load(inst["condition"], loc)
                jump("JUMP_IF_FALSE", inst["false"], loc)
                jump("JUMP", inst["true"], loc)
            elif op == "JUMP":
                jump("JUMP", inst["target"], loc)
            elif op == "CALL":
                for arg in inst["args"]:
                    load(arg, loc)
                emit("CALL", [inst["function"], len(inst["args"])], loc)
                if inst["dest"] is not None:
                    store(inst["dest"], loc)
            elif op == "RETURN_VALUE":
                load(inst["value"], loc)
                emit("RETURN_VALUE", [], loc)
            elif op == "RETURN_VOID":
                emit("RETURN_VOID", [], loc)
            elif op == "ASSERT":
                load(inst["condition"], loc)
                emit("ASSERT", [inst["code"], inst["message"]], loc)
            elif op == "TRAP":
                emit("TRAP", [inst["code"], inst["message"]], loc)
            else:
                raise ValueError(f"Unknown IR operation {op}")
        for position, target in jumps:
            code[position]["args"][0] = labels[target]
        compiled.append({"id": fn.id, "name": fn.name, "params": fn.params, "return_type": fn.return_type,
                         "local_count": fn.local_count + fn.temp_count, "code": code})
    return {"format": "polyglot-bytecode", "version": 1, "entry": 0, "constants": constants,
            "global_count": sum(s["storage"] == "global" for s in symbols), "functions": compiled}
