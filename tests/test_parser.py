from pathlib import Path
import pytest
from polyglot.source import Source
from polyglot.lexer import lex
from polyglot.parser import Parser
from polyglot.diagnostics import PolyglotError


@pytest.mark.parametrize("filename", ["mixed_demo.poly", "mixed_nesting.poly"])
def test_acceptance_programs_parse(filename):
    source = Source((Path(__file__).parents[1] / "examples" / filename).read_text(), filename)
    parser = Parser(source, lex(source))
    tree = parser.parse()
    assert tree.kind == "Program"
    assert {r["family"] for r in parser.recognition} >= {"Python", "shared-c"}
    assert any(e["kind"] == "INDENT" for e in parser.layout.events)
    assert any(e["kind"] == "BRACE_OPEN" for e in parser.layout.events)


@pytest.mark.parametrize("text", ['if True:\nprint(1)\n', 'if True:\n    print(1)\n      print(2)\n', 'int x {\n}\n'])
def test_malformed_layout_and_declaration(text):
    source = Source(text)
    with pytest.raises(PolyglotError):
        Parser(source, lex(source)).parse()
