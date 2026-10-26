"""PowerShell-friendly CLI over the shared library."""

import argparse
import json
import sys
import math
from pathlib import Path
from dataclasses import asdict
from .compiler import compile_source
from .artifact import dumps, loads, ArtifactError
from .vm import run, Limits
from .diagnostics import Diagnostic, PolyglotError


def report(diagnostics, as_json):
    if as_json:
        print(json.dumps({"ok": False, "diagnostics": diagnostics}), file=sys.stderr)
    else:
        for diagnostic in diagnostics:
            print(Diagnostic(**diagnostic).render(), file=sys.stderr)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="polyglot", description="Compile a restricted mixed-syntax language.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("check", "run", "build", "exec", "inspect"):
        command = commands.add_parser(name)
        command.add_argument("file", type=Path)
        command.add_argument("--json", action="store_true", help="Structured output/diagnostics")
        if name in ("run", "exec"):
            command.add_argument("--steps", type=int, default=1_000_000)
            command.add_argument("--recursion", type=int, default=64)
            command.add_argument("--timeout", type=float, default=5.0)
            command.add_argument("--output-limit", type=int, default=65536)
        if name == "build":
            command.add_argument("-o", "--output", type=Path, required=True)
        if name == "inspect":
            for flag in ("tokens", "syntax", "ast", "symbols", "ir", "bytecode", "analysis"):
                command.add_argument("--" + flag, action="store_true")
    serve = commands.add_parser("serve")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--worker-timeout", type=float, default=8.0)
    args = parser.parse_args(argv)
    if args.command == "serve":
        from .web.server import serve as start_server
        if not 0 < args.worker_timeout <= 60:
            parser.error("Worker timeout must be between 0 and 60 seconds.")
        start_server(args.port, args.worker_timeout)
        return 0
    try:
        text = args.file.read_text(encoding="utf-8-sig")
        if args.command == "exec":
            artifact = loads(text)
        else:
            compilation = compile_source(text, str(args.file))
            if not compilation["ok"]:
                report(compilation["diagnostics"], args.json)
                return 3
            artifact = compilation["artifact"]
        if args.command == "check":
            print(json.dumps({"ok": True, "diagnostics": []}) if args.json else "Compilation successful.")
        elif args.command == "build":
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(dumps(artifact), encoding="utf-8")
            print(json.dumps({"ok": True, "artifact": str(args.output)}) if args.json else f"Built {args.output}")
        elif args.command == "inspect":
            selected = [k for k in ("tokens", "syntax", "ast", "symbols", "ir", "bytecode", "analysis") if getattr(args, k)]
            stages = compilation["stages"]
            if args.analysis:
                from .analysis import analyze_ir
                stages["analysis"] = analyze_ir(stages["ir"])
            value = {k: stages["recognition" if k == "syntax" else k] for k in selected} if selected else stages
            print(json.dumps(value, indent=2, ensure_ascii=False))
        else:
            if min(args.steps, args.recursion, args.timeout, args.output_limit) <= 0 or not math.isfinite(args.timeout):
                parser.error("Execution limits must be positive.")
            execution = run(artifact, Limits(args.steps, args.recursion, args.output_limit, args.timeout))
            print(json.dumps({"ok": True, **execution}) if args.json else execution["output"], end="\n" if args.json else "")
        return 0
    except PolyglotError as exc:
        if not args.json:
            print(getattr(exc, "output", ""), end="")
        report([asdict(exc.diagnostic)], args.json)
        return 4
    except (ArtifactError, OSError, UnicodeError) as exc:
        print(f"polyglot: {exc}", file=sys.stderr)
        return 5
