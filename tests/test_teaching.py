import copy
import json
from pathlib import Path

import pytest

from polyglot.analysis import analyze_ir, analyze_function
from polyglot.compiler import compile_source
from polyglot.diagnostics import PolyglotError
from polyglot.teaching import syllabus
from polyglot.vm import run, Limits
from polyglot.web.worker import execute_job


def compilation(source):
    result = compile_source(source)
    assert result['ok'], result['diagnostics']
    return result


def test_cfg_liveness_and_next_use_for_real_arithmetic():
    result = compilation('print(1 + 2)\n')
    fn = analyze_ir(result['stages']['ir'])['functions'][0]
    assert len(fn['blocks']) == 1
    block = fn['blocks'][0]
    assert block['use'] == block['live_in'] == block['live_out'] == []
    assert block['def'] == [0, 1, 2]
    assert block['rows'][0]['next'] == [{'temp': 0, 'at': 2, 'live_out': False}]
    assert block['rows'][2]['uses'] == [0, 1]
    assert block['rows'][2]['defs'] == [2]
    assert next(n for n in block['rows'][2]['next'] if n['temp'] == 2)['at'] == 3
    assert fn['edges'] == fn['back_edges'] == []


def test_real_loop_graph_reaches_fixed_point_and_back_edges_target_dominators():
    source = (Path(__file__).parents[1] / 'examples/mixed_nesting.poly').read_text()
    result = compilation(source)
    analysis = analyze_ir(result['stages']['ir'])
    assert run(result['artifact'])['output'] == '22\n'
    fn = analysis['functions'][0]
    assert len(fn['blocks']) > 4 and fn['back_edges']
    for block in fn['blocks']:
        outgoing = set().union(*(set(fn['blocks'][s]['live_in']) for s in block['successors']))
        assert set(block['live_out']) == outgoing
        assert set(block['live_in']) == set(block['use']) | (outgoing - set(block['def']))
        for target in block['successors']:
            assert block['id'] in fn['blocks'][target]['predecessors']
    assert any(edge['kind'] == 'true' for edge in fn['edges'])
    assert any(edge['kind'] == 'false' for edge in fn['edges'])


def test_return_unreachable_blocks_and_self_loop():
    fn = {'id': 0, 'name': 'test', 'instructions': [
        {'op': 'JUMP', 'target': 'L1'}, {'op': 'CONST', 'dest': 0, 'value': 1},
        {'op': 'RETURN_VOID'}, {'op': 'LABEL', 'label': 'L1'}, {'op': 'JUMP', 'target': 'L1'}]}
    analyzed = analyze_function(fn)
    assert [b['reachable'] for b in analyzed['blocks']] == [True, False, True]
    assert analyzed['blocks'][1]['successors'] == []
    assert analyzed['back_edges'] == [{'from': 2, 'to': 2, 'kind': 'jump'}]


def test_analysis_is_read_only_and_omits_large_functions_without_changing_execution():
    result = compilation('print(1)\n' * 1000)
    original = copy.deepcopy(result)
    analysis = analyze_ir(result['stages']['ir'])
    assert 'omitted' in analysis['functions'][0]
    assert result == original
    assert run(result['artifact'])['output'] == '1\n' * 1000


def test_recorded_call_frames_are_real_before_instruction_states_and_do_not_alias():
    result = compilation('print(add(2, 3))\n\ndef add(a: int, b: int) -> int:\n    return a + b\n')
    original = copy.deepcopy(result['artifact'])
    regular = run(result['artifact'])
    traced = run(result['artifact'], trace_limit=120)
    assert {k: traced[k] for k in ('output', 'steps')} == regular
    assert result['artifact'] == original
    trace = traced['trace']
    assert not trace['truncated']
    call_index = next(i for i, e in enumerate(trace['events']) if e['op'] == 'CALL')
    call, callee = trace['events'][call_index:call_index + 2]
    assert call['depth'] == 1 and call['frames'][-1]['stack'] == [2, 3]
    assert callee['depth'] == 2 and callee['function'] == 'add'
    assert callee['frames'][-1]['locals'][:2] == [2, 3]
    assert callee['frames'][0]['ip'] == call['ip'] + 1
    assert call['frames'][-1]['stack'] == [2, 3]  # snapshots survived later execution
    assert regular['output'] == traced['output'] == '5\n'
    assert 'trace' not in regular


def test_trace_bounds_and_runtime_failure_preserve_partial_output_and_states():
    result = compilation('for i in range(100):\n    print(i)\n')
    traced = run(result['artifact'], trace_limit=5)
    assert len(traced['trace']['events']) == 5 and traced['trace']['truncated']
    failing = compilation('print("before")\nprint(1 / 0)\n')
    with pytest.raises(PolyglotError) as failure:
        run(failing['artifact'], trace_limit=120)
    assert failure.value.output == 'before\n'
    assert failure.value.trace['events'][-1]['op'] == 'BINARY'
    assert failure.value.diagnostic.code == 'R004'
    infinite = compilation('while True:\n    continue\n')
    with pytest.raises(PolyglotError) as limit:
        run(infinite['artifact'], Limits(steps=10), trace_limit=5)
    assert limit.value.diagnostic.code == 'R001'
    assert len(limit.value.trace['events']) == 5
    for invalid in (-1, 121, True, 1.5):
        with pytest.raises(ValueError):
            run(failing['artifact'], trace_limit=invalid)


def test_array_and_large_value_previews_are_bounded_snapshots():
    result = compilation('values = [1, 2]\nvalues[0] = 7\nprint(values)\n')
    traced = run(result['artifact'], trace_limit=120)
    before = next(e for e in traced['trace']['events'] if e['op'] == 'ARRAY_SET')
    after = traced['trace']['events'][-1]
    assert before['globals'][0]['items'] == [1, 2]
    assert after['globals'][0]['items'] == [7, 2]
    text = 'a' * 1000
    big = run(compilation('print("' + text + '")\n')['artifact'], trace_limit=120)
    assert len(json.dumps(big['trace'])) < 10000
    assert big['output'] == text + '\n'


def test_optional_worker_analysis_trace_and_invalid_teaching_option():
    payload = {'source': 'print(2 + 3)\n'}
    regular = execute_job('run', payload)
    assert 'analysis' not in regular and 'trace' not in regular
    taught = execute_job('run', {**payload, 'teaching': True})
    assert taught['output'] == regular['output'] == '5\n'
    assert taught['analysis']['functions'][0]['blocks']
    assert taught['trace']['events']
    checked = execute_job('inspect', {**payload, 'teaching': True})
    assert checked['analysis'] and 'trace' not in checked
    failure = execute_job('run', {'source': 'print(1 / 0)\n', 'teaching': True})
    assert not failure['ok'] and failure['trace']['events'] and failure['analysis']
    invalid = execute_job('run', {**payload, 'teaching': 'yes'})
    assert not invalid['ok'] and invalid['diagnostics'][0]['code'] == 'A001'


def test_syllabus_source_evidence_is_actual_and_does_not_overclaim():
    catalog = syllabus()
    assert len(catalog['modules']) == 6
    assert all(m['evidence'] and m['topics'] for m in catalog['modules'])
    lexical = catalog['modules'][0]['topics']
    assert next(t for t in lexical if t['title'] == 'Introduction to LLVM')['status'] == 'missing'
    assert next(t for t in catalog['modules'][1]['topics'] if t['title'] == 'CLR parsing')['status'] == 'missing'
    for source in catalog['sources'].values():
        path = Path(__file__).parents[1] / source['file']
        actual = path.read_text().splitlines(keepends=True)
        assert ''.join(actual[source['line'] - 1:]).startswith(source['code'])


def test_liveness_propagates_across_real_loop_and_short_circuit_edges():
    for source in ('for i in range(3):\n    print(i)\n', 'print(True and False)\n'):
        result = compilation(source)
        fn = analyze_ir(result['stages']['ir'])['functions'][0]
        assert any(block['live_in'] for block in fn['blocks'])
        assert any(block['live_out'] for block in fn['blocks'])
        assert any(n['live_out'] and n['at'] is None for b in fn['blocks'] for row in b['rows'] for n in row['next'])
        for block in fn['blocks']:
            outgoing = set().union(*(set(fn['blocks'][s]['live_in']) for s in block['successors']))
            assert set(block['live_out']) == outgoing
            assert set(block['live_in']) == set(block['use']) | (outgoing - set(block['def']))


def test_trace_preview_bounds_deep_frames_and_keeps_vm_recursion_limit():
    result = compilation('def recurse(n: int) -> int:\n    return recurse(n)\nprint(recurse(1))\n')
    with pytest.raises(PolyglotError) as failure:
        run(result['artifact'], Limits(recursion=16), trace_limit=120)
    assert failure.value.diagnostic.code == 'R011'
    events = failure.value.trace['events']
    assert any(e['frames_omitted'] for e in events)
    assert all(len(e['frames']) <= 8 for e in events)
    assert all(len(f['locals']) <= 8 and len(f['stack']) <= 8 for e in events for f in e['frames'])


def test_uploaded_artifact_labels_and_trace_locations_are_bounded():
    result = compilation('print(1)\n')
    artifact = copy.deepcopy(result['artifact'])
    artifact['functions'][0]['name'] = 'n' * 10000
    for instruction in artifact['functions'][0]['code']:
        instruction['source']['filename'] = 'f' * 10000
    traced = run(artifact, trace_limit=120)
    event = traced['trace']['events'][0]
    assert len(event['function']) == 81
    assert len(event['source']['filename']) == 256
    assert event['source']['end_column'] == artifact['functions'][0]['code'][0]['source']['end_column']
    assert len(json.dumps(traced['trace'])) < 10000
    assert traced['output'] == '1\n'
