from polyglot.compiler import compile_source
from polyglot.artifact import dumps, loads
from polyglot.vm import run


def test_pipeline_and_reusable_artifact():
    result = compile_source('total = 2\nint extra = 3;\ntotal += extra\nprint(total)\n')
    assert result["ok"], result["diagnostics"]
    assert set(result["stages"]) >= {"tokens", "recognition", "ast", "symbols", "ir", "bytecode"}
    artifact = loads(dumps(result["artifact"]))
    assert run(artifact)["output"] == "5\n"
    assert any(i["op"] == "BINARY" for i in result["stages"]["ir"][0]["instructions"])


def test_precedence_and_widening():
    result = compile_source('double result = 2 + 3 * 4;\nprint(result)\n')
    assert result["ok"]
    assert run(result["artifact"])["output"] == "14.0\n"


def test_type_error_prevents_artifact():
    result = compile_source('value = 3\nvalue = "bad"\n')
    assert not result["ok"]
    assert result["artifact"] is None
    assert result["diagnostics"][0]["code"] == "S004"


def test_uninitialized_read():
    result = compile_source('int value;\nprint(value)\n')
    assert not result["ok"]
    assert result["diagnostics"][0]["code"] == "S005"
