"""The single compiler API used by the CLI and browser worker."""

from dataclasses import asdict, is_dataclass
from .source import Source
from .lexer import lex
from .parser import Parser
from .semantics import Analyzer
from .ir import Lowerer
from .codegen import generate
from .artifact import dumps, ArtifactError
from .diagnostics import PolyglotError, Diagnostic


def serializable(value):
    if is_dataclass(value):
        return serializable(asdict(value))
    if isinstance(value, dict):
        return {k: serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [serializable(v) for v in value]
    return value


def compile_source(text: str, filename: str = "program.poly") -> dict:
    source = Source(text, filename)
    stages = {}
    try:
        if len(text.encode("utf-8")) > 131072:
            raise PolyglotError(Diagnostic("C001", "Source exceeds the 128 KiB limit.", source.location(source.span(0, 0))))
        tokens = lex(source)
        stages["tokens"] = serializable(tokens)
        parser = Parser(source, tokens)
        tree = parser.parse()
        stages["recognition"] = serializable(parser.recognition)
        stages["layout"] = serializable(parser.layout.events)
        stages["ast"] = serializable(tree)
        analyzer = Analyzer(source)
        symbols = analyzer.analyze(tree)
        stages["symbols"] = symbols
        stages["ast"] = serializable(tree)
        functions = Lowerer(source, analyzer).lower(tree)
        stages["ir"] = serializable(functions)
        artifact = generate(functions, symbols)
        dumps(artifact)
        stages["bytecode"] = artifact
        return {"ok": True, "diagnostics": [], "stages": stages, "artifact": artifact}
    except PolyglotError as exc:
        return {"ok": False, "diagnostics": [asdict(exc.diagnostic)], "stages": stages, "artifact": None}
    except RecursionError:
        return {"ok": False, "diagnostics": [asdict(Diagnostic("P099", "Expression nesting limit exceeded.", source.location(source.span(0, 0))))],
                "stages": stages, "artifact": None}
    except ArtifactError as exc:
        return {"ok": False, "diagnostics": [asdict(Diagnostic("C002", str(exc), source.location(source.span(0, 0))))],
                "stages": stages, "artifact": None}
