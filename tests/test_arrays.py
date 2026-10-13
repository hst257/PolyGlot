import json
from pathlib import Path
import pytest
from polyglot.compiler import compile_source
from polyglot.artifact import loads, dumps, ArtifactError
from polyglot.vm import run
from polyglot.diagnostics import PolyglotError
from polyglot.web.worker import execute_job


def compile_ok(source):
    result = compile_source(source, "arrays.poly")
    assert result["ok"], result["diagnostics"]
    return result


def execute(source):
    return run(compile_ok(source)["artifact"])["output"]


@pytest.mark.parametrize("source,expected", [
    ('values = [1, 2, 3]\nvalues[0] = 5\nvalues[1] += values[0]\nprint(values, len(values))\n', '[5, 7, 3] 3\n'),
    ('int values[3] = {1, 2, 3};\ncout << values[1] << endl;\n', '2\n'),
    ('int values[] = {1, 2};\nprint(values)\n', '[1, 2]\n'),
    ('double[] values = [1, 2.5];\nvalues[0] += 2\nprint(values)\n', '[3.0, 2.5]\n'),
    ('values = [1, 2.5]\nprint(values)\n', '[1.0, 2.5]\n'),
    ('boolean[] values = [True, false];\nSystem.out.println(values[0]);\nprint(values)\n', 'true\n[true, false]\n'),
    ('String names[2] = {"a", "b"};\nnames[0] += "!"\nprint(names)\n', '["a!", "b"]\n'),
    ('int values[3];\nvalues[2] = 8\nprint(values)\n', '[0, 0, 8]\n'),
    ('double[] values = new double[2];\nprint(values)\n', '[0.0, 0.0]\n'),
    ('bool flags[2];\nString names[1];\nprint(flags, names)\n', '[false, false] [""]\n'),
    ('int[] empty = [];\nint nothing[0];\nprint(empty, nothing, len(empty))\n', '[] [] 0\n'),
    ('values = [1]\nvalues = []\nprint(values)\n', '[]\n'),
    ('size = 2\nint values[size] = {4, 5};\nprint(values)\n', '[4, 5]\n'),
    ('values = [\n    1,\n    2,\n]\nprint(values[0] + values[1])\n', '3\n'),
    ('int values[2] = {\n    1,\n    2,\n};\nprint(values)\n', '[1, 2]\n'),
    ('values = [1, 2]\nfor (int i = 0; i < len(values); i++) { values[i] += i; }\nprint(values)\n', '[1, 3]\n'),
    ('def change(values: int[]) -> int[]:\n    values[0] += 1\n    return values\nvalues = [1]\nalias = values\nprint(change(values), alias[0])\n', '[2] 2\n'),
    ('int[] make() { return [3, 4]; }\nprint(make()[1])\n', '4\n'),
    ('int first(int values[]) { return values[0]; }\nprint(first([7]))\n', '7\n'),
    ('def empty() -> float[]:\n    return []\nprint(empty())\n', '[]\n'),
    ('def take(values: int[]) -> int:\n    return len(values)\nprint(take([]))\n', '0\n'),
])
def test_array_execution(source, expected):
    assert execute(source) == expected


@pytest.mark.parametrize("source,code", [
    ('values = []\n', 'S021'),
    ('values = [1, "a"]\n', 'S022'),
    ('values = [[1], [2]]\n', 'S022'),
    ('values = [[]]\n', 'S022'),
    ('values = [1]\nvalues[0] = "bad"\n', 'S004'),
    ('values = [1]\nprint(values[True])\n', 'S020'),
    ('values = [1]\nprint(values[1.0])\n', 'S020'),
    ('value = 2\nprint(value[0])\n', 'S019'),
    ('int[] values;\nprint(values[0])\n', 'S005'),
    ('int[] values = [1.5];\n', 'S004'),
    ('int[] values = [1];\nfloat[] other = values;\n', 'S004'),
    ('values = [1]\nvalues = [1.5]\n', 'S004'),
    ('values = [1]\nprint(values == values)\n', 'S006'),
    ('values = [1]\nvalues += [2]\n', 'S006'),
    ('int values[3] = {1, 2};\n', 'S026'),
    ('int values[1.5];\n', 'S023'),
    ('int values[1001];\n', 'S025'),
    ('void[] values = [];\n', 'P025'),
    ('int[][] values = [[1]];\n', 'P025'),
    ('int values[2][2];\n', 'P025'),
    ('print(len(1))\n', 'S019'),
    ('print(len())\n', 'S011'),
    ('def take(values: int[]) -> int:\n    return len(values)\nprint(take([1.5]))\n', 'S004'),
])
def test_array_errors_prevent_execution(source, code):
    result = compile_source(source, "bad-array.poly")
    assert not result["ok"]
    assert result["artifact"] is None
    assert result["diagnostics"][0]["code"] == code, result["diagnostics"]


@pytest.mark.parametrize("source,code", [
    ('values = [1]\nprint(values[-1])\n', 'R012'),
    ('values = [1]\nvalues[1] = 2\n', 'R012'),
    ('int[] empty = [];\nprint(empty[0])\n', 'R012'),
    ('n = -1\nint values[n];\n', 'R013'),
    ('n = 1001\nint[] values = new int[n];\n', 'R013'),
    ('n = 3\nint values[n] = {1, 2};\n', 'R014'),
    ('for i in range(101):\n    int values[1000];\n', 'R013'),
])
def test_runtime_bounds_sizes_and_budget(source, code):
    with pytest.raises(PolyglotError) as failure:
        execute(source)
    assert failure.value.diagnostic.code == code
    assert failure.value.diagnostic.location["filename"] == 'arrays.poly'


def test_compound_index_evaluated_once_and_old_value_before_rhs():
    source = 'values = [10]\ncalls = 0\ndef index() -> int:\n    calls += 1\n    return 0\ndef rhs() -> int:\n    values[0] = 100\n    return 3\nvalues[index()] += rhs()\nprint(values[0], calls)\n'
    assert execute(source) == '13 1\n'


def test_invalid_store_checks_bounds_before_rhs():
    source = 'values = [1]\ndef rhs() -> int:\n    print("should not run")\n    return 2\nvalues[1] = rhs()\n'
    with pytest.raises(PolyglotError) as failure:
        execute(source)
    assert failure.value.output == ''


def test_array_artifact_roundtrip_and_stages():
    result = compile_ok('values = [1, 2]\nvalues[0] += 2\nprint(values)\n')
    assert result["artifact"]["version"] == 3
    assert run(loads(dumps(result["artifact"])))["output"] == '[3, 2]\n'
    assert result["stages"]["symbols"][0]["type"] == 'int[]'
    ops = {i["op"] for i in result["stages"]["ir"][0]["instructions"]}
    assert ops >= {"ARRAY_BUILD", "ARRAY_GET", "ARRAY_SET", "ARRAY_CHECK"}


def test_v1_scalar_artifacts_still_execute_and_reject_array_opcodes():
    scalar = compile_ok('print(3)\n')["artifact"]
    scalar["version"] = 1
    assert run(loads(dumps(scalar)))["output"] == '3\n'
    array = compile_ok('values = [1]\n')["artifact"]
    array["version"] = 1
    with pytest.raises(ArtifactError):
        loads(json.dumps(array))


@pytest.mark.parametrize("replacement", [
    {"op": "ARRAY_BUILD", "args": ["void", 1]},
    {"op": "ARRAY_BUILD", "args": ["int", -1]},
    {"op": "ARRAY_BUILD", "args": ["int", 1001]},
    {"op": "ARRAY_NEW", "args": ["int[]"]},
    {"op": "ARRAY_GET", "args": [0]},
    {"op": "ARRAY_SET", "args": []},
])
def test_invalid_array_artifacts_rejected(replacement):
    artifact = compile_ok('print(1)\n')["artifact"]
    first = artifact["functions"][0]["code"][0]
    first.update(replacement)
    with pytest.raises(ArtifactError):
        loads(json.dumps(artifact))


def test_mixed_array_program_through_web_worker():
    source = (Path(__file__).parents[1] / "examples/arrays_mixed.poly").read_text()
    built = execute_job("build", {"source": source})
    assert built["ok"], built["diagnostics"]
    result = execute_job("exec", {"artifact": built["artifact_text"]})
    assert result["ok"]
    assert result["output"] == '15\n7\n[1, 7, 3, 4] 4\n'


def test_each_call_allocates_fresh_array_and_parameter_rebinding_is_local():
    source = 'def make() -> int[]:\n    return [0]\ndef replace(values: int[]) -> void:\n    values = [9]\na = make()\nb = make()\na[0] = 7\nreplace(a)\nprint(a, b)\n'
    assert execute(source) == '[7] [0]\n'


def test_generated_artifact_size_limit_prevents_unloadable_builds():
    from polyglot.artifact import validate
    result = compile_ok('print(1)\n')
    artifact = result["artifact"]
    artifact["functions"][0]["code"][0]["source"]["excerpt"] = 'x' * 5_000_000
    validate(artifact)
    with pytest.raises(ArtifactError, match='5 MB'):
        dumps(artifact)
