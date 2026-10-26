import copy
import random
from pathlib import Path

import pytest

from polyglot.compiler import compile_source
from polyglot.vm import run
from polyglot.diagnostics import PolyglotError
from polyglot.optimizer import optimize_functions
from polyglot.ir import IRFunction
from polyglot.analysis import analyze_function


def compile_pair(source):
    plain = compile_source(source, optimize=False)
    optimized = compile_source(source)
    assert plain['ok'] == optimized['ok']
    return plain, optimized


def outcome(result):
    if not result['ok']:
        return 'compile', result['diagnostics'][0]['code']
    try:
        return 'ok', run(result['artifact'])['output']
    except PolyglotError as error:
        return 'runtime', error.diagnostic.code, getattr(error, 'output', ''), error.diagnostic.location


def test_constant_folding_is_used_by_default_before_bytecode_generation():
    plain, optimized = compile_pair('print((2 + 3) * 4)\n')
    assert outcome(plain) == outcome(optimized) == ('ok', '20\n')
    assert optimized['stages']['ir'] == plain['stages']['ir']
    original = plain['stages']['ir'][0]['instructions']
    transformed = optimized['stages']['optimized_ir'][0]['instructions']
    assert sum(i['op'] == 'BINARY' for i in original) == 2
    assert [i['op'] for i in transformed] == ['CONST', 'OUTPUT', 'RETURN_VOID']
    assert transformed[0]['value'] == 20 and transformed[0]['type'] == 'int'
    before = sum(len(f['code']) for f in plain['artifact']['functions'])
    after = sum(len(f['code']) for f in optimized['artifact']['functions'])
    assert before == 17 and after == 5
    assert run(plain['artifact'])['steps'] == 17
    assert run(optimized['artifact'])['steps'] == 5
    assert optimized['stages']['optimization']['enabled']
    report = optimized['stages']['optimization']['functions'][0]
    assert report['constant_folds'] == 2 and report['dead_constants_removed'] == 4


def test_constant_branches_remove_only_unreachable_side_effects():
    source = 'if True:\n    print("kept")\nelse:\n    print("unreachable")\nprint("after")\n'
    plain, optimized = compile_pair(source)
    assert outcome(plain) == outcome(optimized) == ('ok', 'kept\nafter\n')
    code = optimized['stages']['optimized_ir'][0]['instructions']
    assert not any(i.get('value') == 'unreachable' for i in code)
    report = optimized['stages']['optimization']['functions'][0]
    assert report['constant_branches'] and report['unreachable_removed']
    assert not any(not b['reachable'] for b in analyze_function(optimized['stages']['optimized_ir'][0])['blocks'])


@pytest.mark.parametrize('source', [
    'print(-5 % 3, 5 % -3, -5.5 % 3.0)\n',
    'print((2 + 3.0) / 2, not False, -0.0, "a" + "b")\n',
    'print("before")\nprint(1 / 0)\n',
    'print(1e308 * 1e308)\n',
    'int[] values = {1};\nprint(values[2]);\n',
    'for i in range(0, 4, 0):\n    print(i)\n',
    'def effect() -> bool:\n    print("effect")\n    return True\nprint(False and effect(), True or effect())\n',
    'def effect() -> int:\n    print("called")\n    return 2\nprint(effect() + (2 * 3))\n',
    'x = 1\nx = 4\nprint(x + 3)\n',
    'while False:\n    print(1 / 0)\nprint(7)\n',
    'if False:\n    print(undefined)\n',
])
def test_optimization_preserves_values_evaluation_order_and_errors(source):
    plain, optimized = compile_pair(source)
    assert outcome(plain) == outcome(optimized)


@pytest.mark.parametrize('path', sorted(p for p in (Path(__file__).parents[1] / 'examples').glob('*.poly') if not p.name.startswith('error_')))
def test_all_real_examples_have_identical_optimized_and_unoptimized_output(path):
    plain, optimized = compile_pair(path.read_text())
    assert outcome(plain) == outcome(optimized)


def test_optimizer_never_mutates_original_ir_or_drops_potentially_trapping_loads():
    original = IRFunction(0, '<main>', [], 'void', 0, [
        {'op': 'LOAD', 'dest': 0, 'storage': 'global', 'slot': 0, 'type': 'int', 'source': {'line': 1}},
        {'op': 'RETURN_VOID', 'source': {'line': 2}}], 1)
    before = copy.deepcopy(original)
    optimized, report = optimize_functions([original])
    assert original == before
    assert optimized[0].instructions[0]['op'] == 'LOAD'
    assert optimized[0] is not original


def test_liveness_keeps_range_and_short_circuit_temporaries_across_blocks():
    source = 'total = 0\nfor i in range(1, 8, 2):\n    total += i\nprint(total, True and False, False or True)\n'
    plain, optimized = compile_pair(source)
    assert outcome(plain) == outcome(optimized) == ('ok', '16 false true\n')
    cfg = analyze_function(optimized['stages']['optimized_ir'][0])
    assert any(b['live_in'] for b in cfg['blocks'])
    assert any(e['to'] <= e['from'] for e in cfg['edges'])
    for block in cfg['blocks']:
        outgoing = set().union(*(set(cfg['blocks'][s]['live_in']) for s in block['successors']))
        assert set(block['live_out']) == outgoing
        assert set(block['live_in']) == set(block['use']) | (outgoing - set(block['def']))


def test_seeded_constant_expression_differential_results():
    rng = random.Random(2026)
    expressions = []
    for _ in range(100):
        a, b, c = [rng.randint(-20, 20) for _ in range(3)]
        op = rng.choice(['+', '-', '*', '/', '%', '<', '=='])
        expressions.append(f'print(({a} + {b}) {op} {c})\n')
    for source in expressions:
        plain, optimized = compile_pair(source)
        assert outcome(plain) == outcome(optimized), source


def test_large_function_falls_back_to_original_ir_without_changing_output():
    source = 'print(1)\n' * 800
    plain, optimized = compile_pair(source)
    assert optimized['stages']['optimization']['functions'][0]['skipped']
    assert plain['artifact'] == optimized['artifact']
    assert outcome(plain) == outcome(optimized)


def test_api_accepts_only_boolean_optimization_options():
    from polyglot.web.worker import execute_job
    result = execute_job('run', {'source': 'print(2 + 3)\n', 'optimize': False})
    assert result['output'] == '5\n' and not result['stages']['optimization']['enabled']
    invalid = execute_job('run', {'source': 'print(2 + 3)\n', 'optimize': 'yes'})
    assert not invalid['ok'] and invalid['diagnostics'][0]['code'] == 'A001'


def test_cli_exposes_actual_pass_results_and_unoptimized_comparison(tmp_path, capsys):
    import json
    from polyglot.cli import main
    source = tmp_path / 'fold.poly'
    source.write_text('print((2 + 3) * 4)\n')
    assert main(['inspect', str(source), '--optimized-ir', '--optimization']) == 0
    inspected = json.loads(capsys.readouterr().out)
    assert inspected['optimized_ir'][0]['instructions'][0]['value'] == 20
    assert inspected['optimization']['functions'][0]['constant_folds'] == 2
    assert main(['inspect', str(source), '--no-optimize', '--optimized-ir']) == 0
    unoptimized = json.loads(capsys.readouterr().out)
    assert any(i['op'] == 'BINARY' for i in unoptimized['optimized_ir'][0]['instructions'])


def test_next_use_distinguishes_overwritten_values_from_the_live_out_definition():
    source = {'filename': 'overwrite.poly', 'line': 1, 'column': 1}
    fn = IRFunction(0, '<main>', [], 'void', 0, [
        {'op': 'CONST', 'dest': 0, 'value': 1, 'type': 'int', 'source': source},
        {'op': 'CONST', 'dest': 0, 'value': 2, 'type': 'int', 'source': source},
        {'op': 'JUMP', 'target': 'L1', 'source': source},
        {'op': 'LABEL', 'label': 'L1', 'source': source},
        {'op': 'OUTPUT', 'args': [0], 'separator': '', 'ending': '\n', 'source': source},
        {'op': 'RETURN_VOID', 'source': source}], 1)
    optimized, report = optimize_functions([fn])
    assert [i['value'] for i in optimized[0].instructions if i['op'] == 'CONST'] == [2]
    assert report['functions'][0]['dead_constants_removed'] == 1
