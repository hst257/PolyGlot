from pathlib import Path
import pytest
from polyglot.compiler import compile_source
from polyglot.artifact import dumps, loads
from polyglot.vm import run


def compile_ok(source):
    result = compile_source(source, "iteration.poly")
    assert result["ok"], result["diagnostics"]
    return result


@pytest.mark.parametrize("source,expected", [
    ('int[] arr = {1, 2, 3, 4, 5};\nfor num in arr:\n    print(num)\n', '1\n2\n3\n4\n5\n'),
    ('int arr[3] = {2, 4, 6};\nfor num in arr:\n    System.out.println(num);\n', '2\n4\n6\n'),
    ('double[] arr = [1, 2.5];\nfor num in arr:\n    print(num)\n', '1.0\n2.5\n'),
    ('boolean[] arr = [true, false];\nfor flag in arr:\n    cout << flag << endl;\n', 'true\nfalse\n'),
    ('String[] arr = ["one", "two"];\nfor word in arr:\n    print(word)\n', 'one\ntwo\n'),
    ('int[] arr = [];\nfor num in arr:\n    print(num)\nprint("empty")\n', 'empty\n'),
    ('for num in [2, 3]:\n    print(num)\n', '2\n3\n'),
    ('num = 99\narr = [1, 2]\nfor num in arr:\n    print(num)\nprint(num)\n', '1\n2\n99\n'),
    ('arr = [1, 2]\nfor num in arr:\n    num += 10\n    print(num)\nprint(arr)\n', '11\n12\n[1, 2]\n'),
    ('arr = [1, 2, 3, 4]\nfor num in arr:\n    if num == 2:\n        continue\n    if num == 4:\n        break\n    print(num)\n', '1\n3\n'),
    ('arr = [1, 2]\nfor x in arr:\n    for y in arr:\n        print(x, y)\n', '1 1\n1 2\n2 1\n2 2\n'),
    ('arr = [1, 2, 3]\nfor num in arr:\n    arr = [9]\n    print(num)\nprint(arr)\n', '1\n2\n3\n[9]\n'),
    ('arr = [1, 2, 3]\nfor num in arr:\n    arr[1] = 20\n    print(num)\n', '1\n20\n3\n'),
    ('def total(arr: int[]) -> int:\n    result = 0\n    for num in arr:\n        result += num\n    return result\nprint(total([1, 2, 3]))\n', '6\n'),
    ('arr = [1, 2, 3]\nfor num in arr:\n    if (num % 2 == 0) { cout << num << endl; }\n', '2\n'),
    ('arr = [4, 5]\nfor (int i = 0; i < 2; i++) {\n    for num in arr:\n        print(i, num)\n}\n', '0 4\n0 5\n1 4\n1 5\n'),
])
def test_iteration_behavior(source, expected):
    result = compile_ok(source)
    assert run(loads(dumps(result["artifact"])))["output"] == expected


@pytest.mark.parametrize("source,code", [
    ('for num in 5:\n    print(num)\n', 'S027'),
    ('for num in "hello":\n    print(num)\n', 'S027'),
    ('for num in missing:\n    print(num)\n', 'S003'),
    ('int[] arr;\nfor num in arr:\n    print(num)\n', 'S005'),
    ('arr = [1]\nfor num in arr:\n    print(num)\nprint(num)\n', 'S003'),
    ('arr = [1]\nfor num in arr:\n    num = "wrong"\n', 'S004'),
    ('int value;\nfor num in [1]:\n    value = num\nprint(value)\n', 'S005'),
    ('arr = [1]\nfor num in arr\n    print(num)\n', 'P001'),
])
def test_iteration_errors(source, code):
    result = compile_source(source)
    assert not result["ok"]
    assert result["artifact"] is None
    assert result["diagnostics"][0]["code"] == code


def test_iterator_expression_evaluates_once():
    source = 'calls = 0\ndef make() -> int[]:\n    calls += 1\n    return [1, 2]\nfor num in make():\n    print(num)\nprint(calls)\n'
    result = compile_ok(source)
    assert run(result["artifact"])["output"] == '1\n2\n1\n'
    tree = result["stages"]["ast"]["data"]["body"]
    assert any(node["kind"] == "ForEach" for node in tree)
    assert any(r["grammar_rule"] == "for-in-loop" for r in result["stages"]["recognition"])
    ops = {inst["op"] for fn in result["stages"]["ir"] for inst in fn["instructions"]}
    assert ops >= {"ARRAY_LENGTH", "ARRAY_GET", "BRANCH"}
