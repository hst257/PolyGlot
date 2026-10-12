from pathlib import Path
import pytest
from polyglot.compiler import compile_source
from polyglot.artifact import dumps, loads
from polyglot.vm import run


@pytest.mark.parametrize("filename,expected", [
    ("mixed_demo.poly", "0\n1\n3\n6\n12\ndone\n"),
    ("mixed_nesting.poly", "22\n"),
])
def test_required_mixed_programs(filename, expected):
    path = Path(__file__).parents[1] / "examples" / filename
    result = compile_source(path.read_text(), filename)
    assert result["ok"], result["diagnostics"]
    assert run(loads(dumps(result["artifact"])))["output"] == expected


def execute(text):
    result = compile_source(text)
    assert result["ok"], result["diagnostics"]
    return run(result["artifact"])["output"]


def test_forward_calls_and_recursion():
    assert execute('print(fact(5))\ndef fact(n: int) -> int:\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n') == "120\n"


def test_braces_inside_indentation():
    assert execute('x = 0\nif True:\n    while (x < 3) {\n        x += 1;\n    }\nprint(x)\n') == "3\n"


def test_for_continue_runs_update_and_break_skips_it():
    assert execute('total = 0\nfor (int i = 0; i < 5; i++) {\n    if (i == 2) { continue; }\n    if (i == 4) { break; }\n    total += i;\n}\nprint(total)\n') == "4\n"


def test_short_circuit_avoids_division_by_zero():
    assert execute('print(False and 1 / 0 > 0)\nprint(True or 1 / 0 > 0)\n') == "false\ntrue\n"


def test_negative_range_and_numeric_semantics():
    assert execute('for i in range(5, 0, -2):\n    print(i)\nprint(-7 % 3, 7 % -3, 5 / 2)\n') == "5\n3\n1\n-1 1 2.5\n"
