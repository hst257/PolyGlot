import pytest
from polyglot.compiler import compile_source
from polyglot.vm import run, Limits
from polyglot.diagnostics import PolyglotError


def execute(text, limits=None):
    compiled = compile_source(text)
    assert compiled["ok"], compiled["diagnostics"]
    return run(compiled["artifact"], limits)["output"]


@pytest.mark.parametrize("source,expected", [
    ('String s = "hello";\nboolean ready = true;\ncout << s << " " << ready << endl;\nSystem.out.println(s);\n', "hello true\nhello\n"),
    ('print()\nprint("a", 2, 3.5, False)\n', "\na 2 3.5 false\n"),
    ('print(-2 * 3 + +10, not 2 < 3, !False, (1 < 2) == True)\n', "4 false true true\n"),
    ('print("a" + "b", "a" < "b", True != False)\n', "ab true true\n"),
    ('x = 1\nif True:\n    int x = x + 2;\n    print(x)\nprint(x)\n', "3\n1\n"),
    ('int x;\nif True:\n    x = 1\nelse:\n    x = 2\nprint(x)\n', "1\n"),
    ('x = 0\nwhile x < 5:\n    x += 1\n    if x == 2:\n        continue\n    if x == 4:\n        break\n    print(x)\n', "1\n3\n"),
    ('for i in range(0):\n    print(i)\nfor j in range(2, 2):\n    print(j)\nprint("empty")\n', "empty\n"),
    ('x = 0\nfor (; x < 2; x++) { print(x); }\n', "0\n1\n"),
    ('x = 2\nfor (; ; x--) { if (x == 0) { break; } print(x); }\n', "2\n1\n"),
    ('double f(double x) { return x; }\nprint(f(3))\n', "3.0\n"),
    ('def f(x: int) -> float:\n    return x\nprint(f(3))\n', "3.0\n"),
    ('def greet() -> void:\n    print("hello")\n    return\ngreet()\n', "hello\n"),
    ('x = 1\ndef inc() -> void:\n    x += 1\ninc()\nprint(x)\n', "2\n"),
    ('def read() -> int:\n    return later\nlater = 8\nprint(read())\n', "8\n"),
    ('# comment\nx = (1 +\n     2) // comment\n/* block\ncomment */\nprint("{:#//}", x)\n', "{:#//} 3\n"),
    ('print("one\\ntwo", \'say "yes"\')\n', 'one\ntwo say "yes"\n'),
    ('if False:\n    print(0)\nelif True:\n    print(1)\nelse:\n    print(2)\n', "1\n"),
    ('if (false) { print(0); } else if (true) { print(1); } else { print(2); }\n', "1\n"),
    ('print(1000000000000000000000000000000 + 1)\n', "1000000000000000000000000000001\n"),
])
def test_language_behavior(source, expected):
    assert execute(source) == expected


@pytest.mark.parametrize("source,code", [
    ('int x;\nif True:\n    x = 1\nprint(x)\n', "S005"),
    ('int x;\nwhile False:\n    x = 1\nprint(x)\n', "S005"),
    ('int x = 1.5;\n', "S004"),
    ('x = True + 1\n', "S006"),
    ('if 1:\n    print(1)\n', "S012"),
    ('int x = 1;\nint x = 2;\n', "S001"),
    ('x = 1\nx = "a"\n', "S004"),
    ('print(unknown)\n', "S003"),
    ('break\n', "S015"),
    ('continue\n', "S015"),
    ('return 1\n', "S016"),
    ('def f() -> void:\n    return 1\n', "S017"),
    ('def f() -> int:\n    print(1)\n', "S018"),
    ('def f(x: int) -> int:\n    if x > 0:\n        return x\n', "S018"),
    ('def f(x) -> int:\n    return x\n', "P020"),
    ('def f() -> int:\n    return\n', "S017"),
    ('def f(x: int, x: int) -> int:\n    return x\n', "S001"),
    ('def f() -> void:\n    def nested() -> void:\n        print(1)\n', "S013"),
    ('def f(x: int) -> int:\n    return x\nprint(f("a"))\n', "S004"),
    ('for i in range(2.0):\n    print(i)\n', "S014"),
    ('for i in range(2):\n    print(i)\nprint(i)\n', "S003"),
    ('x = 1 < 2 < 3\n', "P012"),
    ('if True:\n', "P003"),
    ('class Example {}\n', "P004"),
    ('int x = 1\n', "P002"),
    ('void x;\n', "S002"),
    ('print = 1\n', "P001"),
    ('x = 1e999\n', "S009"),
    ('\tprint(1)\n', "L001"),
    ('print("unclosed)\n', "L004"),
    ('/* unclosed', "L002"),
])
def test_negative_cases_have_locations_and_no_artifact(source, code):
    compiled = compile_source(source, "bad.poly")
    assert not compiled["ok"]
    assert compiled["artifact"] is None
    diagnostic = compiled["diagnostics"][0]
    assert diagnostic["code"] == code, diagnostic
    assert diagnostic["location"]["filename"] == "bad.poly"
    assert diagnostic["location"]["line"] >= 1


@pytest.mark.parametrize("source,limits,code", [
    ('print(1 / 0)\n', None, "R004"),
    ('for i in range(1, 4, 0):\n    print(i)\n', None, "R009"),
    ('while True:\n    print("x")\n', Limits(steps=30), "R001"),
    ('print("long output")\n', Limits(output=2), "R006"),
    ('def f() -> void:\n    f()\nf()\n', Limits(recursion=3), "R011"),
    ('def read() -> int:\n    return later\nprint(read())\nlater = 3\n', None, "R003"),
])
def test_runtime_errors_are_bounded_and_mapped(source, limits, code):
    with pytest.raises(PolyglotError) as failure:
        execute(source, limits)
    diagnostic = failure.value.diagnostic
    assert diagnostic.code == code
    assert diagnostic.location["line"] >= 1
    assert diagnostic.stack


def test_range_arguments_evaluated_once_and_left_to_right():
    source = 'calls = 0\ndef value(n: int) -> int:\n    calls += 1\n    print(n)\n    return n\nfor i in range(value(0), value(3), value(1)):\n    print(i)\nprint(calls)\n'
    assert execute(source) == "0\n3\n1\n0\n1\n2\n3\n"
