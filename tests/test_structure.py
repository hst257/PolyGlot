import random
from pathlib import Path
import pytest
from polyglot.compiler import compile_source
from polyglot.vm import run
from polyglot.web.server import EXAMPLES


def test_equivalent_output_forms_normalize_to_shared_ast():
    forms = ['print(3)\n', 'System.out.println(3);\n', 'std::cout << 3 << std::endl;\n']
    nodes = []
    for text in forms:
        result = compile_source(text)
        assert result["ok"]
        node = result["stages"]["ast"]["data"]["body"][0]
        assert node["kind"] == "Output"
        assert node["data"]["ending"] == "\n"
        assert node["data"]["separator"] == ""
        nodes.append(node["data"]["args"][0]["data"])
    assert nodes[0] == nodes[1] == nodes[2]


@pytest.mark.parametrize("name", ["python_style.poly", "cpp_style.poly", "java_style.poly"])
def test_equivalent_algorithms_across_styles(name):
    result = compile_source(EXAMPLES[name])
    assert result["ok"]
    assert run(result["artifact"])["output"] == "1\n4\n9\n"


def test_bundled_examples_match_repository_sources():
    paths = list((Path(__file__).parents[1] / "examples").glob("*.poly"))
    assert set(EXAMPLES) == {p.name for p in paths}
    for path in paths:
        assert EXAMPLES[path.name] == path.read_text()
        result = compile_source(path.read_text(), path.name)
        assert result["ok"] != path.name.startswith("error_"), result["diagnostics"]


def test_multiline_function_headers_comments_and_spans():
    text = 'def add(\n    a: int,\n    b: int\n) -> int:\n    # comment-only line\n    return a + b\nprint(add(1, 2))\n'
    result = compile_source(text, "multiline.poly")
    assert result["ok"], result["diagnostics"]
    assert run(result["artifact"])["output"] == "3\n"
    returned = next(t for t in result["stages"]["tokens"] if t["text"] == "return")
    assert returned["span"]["line"] == 6
    assert returned["span"]["column"] == 5


def test_cout_evaluation_and_output_order():
    text = 'def value() -> int:\n    print("inside")\n    return 2\ncout << "first" << value() << endl;\n'
    result = compile_source(text)
    assert result["ok"]
    assert run(result["artifact"])["output"] == "firstinside\n2\n"


def test_malformed_inputs_terminate_without_internal_exceptions():
    rng = random.Random(2026)
    vocabulary = ["if", "def", "for", "x", "int", "return", "print", "(", ")", "{", "}", ":", ";", "=", "+", "1", "\n", "    "]
    for _ in range(150):
        text = " ".join(rng.choice(vocabulary) for _ in range(rng.randint(0, 25)))
        result = compile_source(text)
        assert result["ok"] or result["diagnostics"]


def test_timeout_and_invalid_limits():
    from polyglot.diagnostics import PolyglotError
    from polyglot.vm import Limits
    result = compile_source('while True:\n    continue\n')
    with pytest.raises(PolyglotError) as failure:
        run(result["artifact"], Limits(timeout=0.000001))
    assert failure.value.diagnostic.code == "R002"
    with pytest.raises(ValueError):
        run(result["artifact"], Limits(timeout=float("nan")))


def test_brace_header_requires_enclosing_parentheses():
    result = compile_source('if (True) and False { print(1); }\n')
    assert not result["ok"]
    assert result["diagnostics"][0]["code"] == "P006"
