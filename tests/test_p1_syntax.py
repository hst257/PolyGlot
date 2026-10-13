from pathlib import Path
import json
import pytest
from polyglot.compiler import compile_source
from polyglot.artifact import dumps, loads, ArtifactError
from polyglot.vm import run
from polyglot.web.worker import execute_job


def compile_ok(source):
    result = compile_source(source, "p1.poly")
    assert result["ok"], result["diagnostics"]
    return result


def execute(source):
    return run(loads(dumps(compile_ok(source)["artifact"])))["output"]


@pytest.mark.parametrize("source,expected", [
    ('let x = 1;\nx += 2\nconsole.log("value", x, true);\n', 'value 3 true\n'),
    ('console.log();\nconsole.log("hello");\n', '\nhello\n'),
    ('const x = 2;\nprint(x)\n', '2\n'),
    ('const values = [1, 2];\nvalues[0] = 3\nconsole.log(values);\n', '[3, 2]\n'),
    ('const x = 9;\nif True:\n    let x = 2;\n    x += 1\n    PRINT x\nprint(x)\n', '3\n9\n'),
    ('let total = 0;\nfor (let i = 0; i < 3; i++) { total += i; }\nPRINT total\n', '3\n'),
    ('function add(a: int, b: int): int { return a + b; }\nprint(add(1, 2))\n', '3\n'),
    ('console.log(fact(5));\nfunction fact(n: int): int { if (n <= 1) { return 1; } return n * fact(n - 1); }\n', '120\n'),
    ('function first(values: int[]): int { return values[0]; }\nLET result = first([7])\nPRINT result\n', '7\n'),
    ('function make(): int[] { return [1, 2]; }\nfor value in make():\n    PRINT value\n', '1\n2\n'),
    ('function say(): void { console.log("hello"); }\nsay()\n', 'hello\n'),
    ('function as_float(value: float): float { return value; }\nconsole.log(as_float(3));\n', '3.0\n'),
    ('LET X = 1\nLET X = X + 2\nPRINT X\nPRINT\n', '3\n\n'),
    ('LET X = 1\nx = 2\nPRINT X\nPRINT x\n', '1\n2\n'),
    ('LET values = [1, 2]\nLET values[0] = 3\nPRINT values\n', '[3, 2]\n'),
    ('printf("%d %f %s %%\\n", -3, 2.5, "ok");\n', '-3 2.500000 ok %\n'),
    ('printf("%f", 2);\nprint("!")\n', '2.000000!\n'),
    ('printf("plain text");\nprintf("");\n', 'plain text'),
    ('printf("%%d %%f %%s");\n', '%d %f %s'),
    ('printf("%s", "100% ready");\n', '100% ready'),
])
def test_supported_spellings(source, expected):
    assert execute(source) == expected


@pytest.mark.parametrize("source,code", [
    ('const x = 1;\nx = 2\n', 'S028'),
    ('const x = 1;\nx += 2\n', 'S028'),
    ('const x = 1;\nLET x = 2\n', 'S028'),
    ('const x = 1;\ndef change() -> void:\n    x = 2\n', 'S028'),
    ('for (const i = 0; i < 2; i++) { print(i); }\n', 'S028'),
    ('const x;\n', 'P030'),
    ('let x;\n', 'P030'),
    ('let x = 1;\nx = "bad"\n', 'S004'),
    ('let x = 1;\nlet x = 2;\n', 'S001'),
    ('console.log(1)\n', 'P002'),
    ('console.warn(1);\n', 'P001'),
    ('function add(a): int { return a; }\n', 'P020'),
    ('function add(a: int) { return a; }\n', 'P020'),
    ('function add(): int { console.log(1); }\n', 'S018'),
    ('function outer(): void { function inner(): void {} }\n', 'S013'),
    ('LET X += 1\n', 'P030'),
    ('GOTO finish\n', 'P004'),
    ('LABEL finish\n', 'P004'),
    ('printf();\n', 'P030'),
    ('printf(3);\n', 'S029'),
    ('const fmt = "%d";\nprintf(fmt, 1);\n', 'S029'),
    ('printf("%c", "a");\n', 'S029'),
    ('printf("%.2f", 1.2);\n', 'S029'),
    ('printf("%ld", 1);\n', 'S029'),
    ('printf("%");\n', 'S029'),
    ('printf("%d");\n', 'S011'),
    ('printf("plain", 1);\n', 'S011'),
    ('printf("%d", 1.2);\n', 'S004'),
    ('printf("%d", true);\n', 'S004'),
    ('printf("%s", [1]);\n', 'S004'),
])
def test_invalid_extensions_do_not_execute(source, code):
    result = compile_source(source)
    assert not result["ok"]
    assert result["artifact"] is None
    assert result["diagnostics"][0]["code"] == code, result["diagnostics"]


def test_printf_argument_evaluation_order_and_normalized_output():
    source = 'def value(n: int) -> int:\n    print(n)\n    return n\nprintf("result %d %d\\n", value(1), value(2));\n'
    result = compile_ok(source)
    assert run(result["artifact"])["output"] == '1\n2\nresult 1 2\n'
    ops = [i["op"] for i in result["stages"]["ir"][0]["instructions"]]
    assert 'FORMAT' in ops and 'OUTPUT' in ops
    assert 'PRINTF' not in ops


def test_const_metadata_and_related_location():
    result = compile_ok('const value = 1;\n')
    assert not result["stages"]["symbols"][0]["mutable"]
    invalid = compile_source('const value = 1;\nvalue = 2\n')
    assert invalid["diagnostics"][0]["related"][0]["line"] == 1


def test_new_spellings_have_real_recognition_and_shared_functions():
    source = (Path(__file__).parents[1] / 'examples/p1_mixed.poly').read_text()
    result = compile_ok(source)
    families = {r["family"] for r in result["stages"]["recognition"]}
    assert families >= {'Python', 'C++', 'Java', 'C', 'JavaScript', 'BASIC'}
    assert run(result["artifact"])["output"] == 'total 8\nformatted: 8, 2.500000, ready\nBASIC output\n8\ndone\n'
    built = execute_job('build', {"source": source})
    assert built["ok"]
    assert execute_job('exec', {"artifact": built["artifact_text"]})["output"] == 'total 8\nformatted: 8, 2.500000, ready\nBASIC output\n8\ndone\n'


def test_v2_arrays_still_execute():
    result = compile_ok('values = [1, 2]\nfor value in values:\n    print(value)\n')
    result["artifact"]["version"] = 2
    assert run(loads(dumps(result["artifact"])))["output"] == '1\n2\n'


@pytest.mark.parametrize('version,specifier', [(1, 'd'), (2, 'd'), (3, 'c'), (3, None)])
def test_bad_or_version_mismatched_format_instructions_rejected(version, specifier):
    artifact = compile_ok('printf("%d", 1);\n')["artifact"]
    artifact['version'] = version
    instruction = next(i for i in artifact['functions'][0]['code'] if i['op'] == 'FORMAT')
    instruction['args'] = [specifier]
    with pytest.raises(ArtifactError):
        loads(json.dumps(artifact))


def test_many_printf_segments_preserve_order_and_bounded_output_instructions():
    source = 'printf(\n"' + '%d ' * 600 + '",\n' + ',\n'.join(['1'] * 600) + '\n);\n'
    result = compile_ok(source)
    assert run(result["artifact"])["output"] == '1 ' * 600
    outputs = [i for i in result["artifact"]["functions"][0]["code"] if i['op'] == 'OUTPUT']
    assert len(outputs) == 2
    assert all(i['args'][0] <= 1000 for i in outputs)


def test_shared_control_syntax_and_distinctive_let_loop_attribution():
    result = compile_ok('if (true) { console.log(1); }\nfor (let i = 0; i < 1; i++) { PRINT i; }\n')
    recognition = result["stages"]["recognition"]
    conditional = next(r for r in recognition if r['kind'] == 'If')
    assert conditional['candidates'] == ['C', 'C++', 'Java', 'JavaScript']
    loop = next(r for r in recognition if r['kind'] == 'For')
    assert loop['family'] == 'JavaScript'


def test_format_instruction_checks_runtime_operand_type():
    from polyglot.diagnostics import PolyglotError
    artifact = compile_ok('printf("%d", 1);\n')["artifact"]
    artifact['constants'][0] = {"type": "string", "value": "wrong"}
    with pytest.raises(PolyglotError) as failure:
        run(artifact)
    assert failure.value.diagnostic.code == 'R007'
