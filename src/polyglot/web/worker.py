"""Spawned jobs share the compiler API; no shell or host-source execution."""

from dataclasses import asdict
import math
from ..compiler import compile_source
from ..artifact import loads, dumps, ArtifactError
from ..diagnostics import Diagnostic, PolyglotError
from ..vm import run, Limits


def execution_limits(payload):
    values = payload.get("limits", {})
    if not isinstance(values, dict) or set(values) - {"steps", "recursion", "output", "timeout"}:
        raise ValueError("Invalid execution limits.")
    defaults = asdict(Limits())
    for name, value in values.items():
        if name == "timeout":
            valid = type(value) in (int, float) and math.isfinite(value)
        else:
            valid = type(value) is int
        if not valid or not 0 < value <= defaults[name]:
            raise ValueError(f"{name} must be positive and no greater than {defaults[name]}.")
        defaults[name] = value
    return Limits(**defaults)


def execute_job(operation: str, payload: dict) -> dict:
    location = {"filename": payload.get("filename", "program.poly"), "line": 1, "column": 1, "excerpt": ""}
    try:
        if operation == "exec":
            artifact_text = payload.get("artifact")
            if not isinstance(artifact_text, str):
                raise ValueError("artifact must be JSON text")
            artifact = loads(artifact_text)
            result = {"ok": True, "diagnostics": [], "stages": {"bytecode": artifact}, "artifact": artifact}
        else:
            source = payload.get("source")
            filename = payload.get("filename", "program.poly")
            if not isinstance(source, str) or not isinstance(filename, str) or len(filename) > 256:
                raise ValueError("source and filename must be strings")
            result = compile_source(source, filename)
            artifact = result["artifact"]
        result["output"] = ""
        if not result["ok"]:
            return result
        if operation in ("run", "exec"):
            result.update(run(artifact, execution_limits(payload)))
        if operation == "build":
            result["artifact_text"] = dumps(artifact)
        return result
    except PolyglotError as exc:
        if "result" not in locals():
            result = {"stages": {}, "artifact": None}
        return {**result, "ok": False, "output": getattr(exc, "output", ""), "diagnostics": [asdict(exc.diagnostic)]}
    except (ArtifactError, ValueError, TypeError) as exc:
        return {"ok": False, "output": "", "stages": {}, "artifact": None,
                "diagnostics": [asdict(Diagnostic("A001", str(exc), location))]}


def worker(connection, operation, payload):
    try:
        connection.send(execute_job(operation, payload))
    except Exception:
        connection.send({"ok": False, "output": "", "stages": {}, "artifact": None,
                         "diagnostics": [{"code": "C999", "message": "Internal compiler error. Report this program as a defect.",
                                          "location": {"filename": "program.poly", "line": 1, "column": 1, "excerpt": ""}}]})
    finally:
        connection.close()
