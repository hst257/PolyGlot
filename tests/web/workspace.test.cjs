const test = require('node:test');
const assert = require('node:assert/strict');
const {Workspace: {readDraft, saveDraft, sourceRange, tableData, astIndex, astLayout, astLabel}} = require('../../src/polyglot/web/static/app.js');

function memoryStorage() {
  const data = new Map();
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)};
}

test('draft recovery preserves empty source, filenames and Unicode exactly', () => {
  for (const source of ['', 'print("😀")\n', 'int[] values = {1, 2};\n']) {
    const storage = memoryStorage();
    assert.equal(saveDraft(storage, source, 'my program.poly'), true);
    const draft = readDraft(storage);
    assert.equal(draft.source, source);
    assert.equal(draft.filename, 'my program.poly');
    assert.equal(typeof draft.savedAt, 'number');
  }
});

test('missing, corrupted, obsolete and oversized drafts are ignored', () => {
  assert.equal(readDraft(memoryStorage()), null);
  for (const value of ['{broken', 'null', '[]', '{"version":2,"source":"x","filename":"x"}',
    JSON.stringify({version: 1, source: 12, filename: 'x'}),
    JSON.stringify({version: 1, source: 'x'.repeat(262145), filename: 'x'}),
    JSON.stringify({version: 1, source: '', filename: 'x'.repeat(257)})]) {
    assert.equal(readDraft({getItem: () => value}), null);
  }
});

test('blocked storage and quota exhaustion do not throw or report success', () => {
  const blocked = {getItem() {throw new Error('blocked');}, setItem() {throw new Error('quota');}};
  assert.equal(readDraft(blocked), null);
  assert.equal(saveDraft(blocked, 'work', 'test.poly'), false);
  assert.equal(saveDraft(memoryStorage(), 'x'.repeat(262145), 'test.poly'), false);
});

test('latest successful draft replaces the previous draft', () => {
  const storage = memoryStorage();
  saveDraft(storage, 'old', 'old.poly');
  saveDraft(storage, 'new', 'new.poly');
  assert.equal(readDraft(storage).source, 'new');
  assert.equal(readDraft(storage).filename, 'new.poly');
});

test('diagnostic selection spans the actual error after non-BMP characters', () => {
  const source = 'print("😀"); missing\nnext';
  const range = sourceRange(source, {line: 1, column: 13, end_line: 1, end_column: 20});
  assert.equal(source.slice(range.start, range.end), 'missing');
});

test('diagnostic selection handles multiple lines, EOF and clamped locations', () => {
  const source = 'first\nname = 2\n';
  const range = sourceRange(source, {line: 2, column: 1, end_line: 2, end_column: 5});
  assert.equal(source.slice(range.start, range.end), 'name');
  assert.deepEqual(sourceRange('', {line: 4, column: 9}), {start: 0, end: 0, line: 1});
  assert.deepEqual(sourceRange(source, {line: 1000, column: 1000}), {start: source.length, end: source.length, line: 3});
});

test('recognition retains ambiguous syntax families rather than inventing attribution', () => {
  const result = tableData('recognition', [{family: 'shared-c', candidates: ['C', 'C++', 'Java'], grammar_rule: 'declaration', span: {line: 2, column: 1}}]);
  assert.deepEqual(result.rows[0], ['C / C++ / Java', 'declaration', '2:1']);
});

test('inspector preserves literal values and distinguishes function and const bindings', () => {
  const tokens = tableData('tokens', [{kind: 'STRING', text: '"<img src=x>"', span: {line: 1, column: 1}}]);
  assert.equal(tokens.rows[0][1], JSON.stringify('"<img src=x>"'));
  const symbols = tableData('symbols', [
    {name: 'sum', storage: 'function', type: 'int', params: ['int[]'], mutable: false, slot: 1, scope: 0},
    {name: 'bonus', storage: 'global', type: 'int', params: [], mutable: false, slot: 0, scope: 0}
  ]);
  assert.equal(symbols.rows[0][1], '(int[]) → int');
  assert.equal(symbols.rows[0][2], 'function');
  assert.equal(symbols.rows[1][2], 'constant');
});

test('source navigation preserves complete multiline spans and Unicode end columns', () => {
  const source = 'def f():\n    print("😀")\n    return 1\n';
  const range = sourceRange(source, {line:1,column:1,end_line:3,end_column:13});
  assert.equal(source.slice(range.start,range.end), 'def f():\n    print("😀")\n    return 1');
});

function astNode(kind, data = {}, extra = {}) { return {kind, data, ...extra}; }
const expressionTree = () => astNode('Program', {body:[astNode('Assign', {name:'x', value:astNode('Binary', {op:'+', left:astNode('Literal',{value:1}), right:astNode('Literal',{value:2})})})]});

test('AST indexing follows actual semantic children and excludes metadata', () => {
  const tree = expressionTree(); tree.meta = {fake:astNode('NotAChild')};
  const index = astIndex(tree);
  assert.deepEqual(index.map(item => item.node.kind), ['Program','Assign','Binary','Literal','Literal']);
  assert.deepEqual(index[2].children, [3,4]);
  assert.equal(index[3].field, 'left'); assert.equal(index[4].field, 'right');
  assert.equal(astLabel(index[2].node), '+'); assert.equal(astLabel(index[3].node), '1');
  assert.equal(tree.data.body[0].data.value.data.left.data.value, 1);
});

test('branch wrapper objects preserve genuine AST relationships and field labels', () => {
  const tree = astNode('If',{branches:[{condition:astNode('Name',{name:'ready'}),body:astNode('Block',{body:[]})}],else_body:astNode('Block',{body:[]})});
  const index = astIndex(tree);
  assert.deepEqual(index[0].children, [1,2,3]);
  assert.equal(index[1].field, 'branches[0].condition');
  assert.equal(index[2].field, 'branches[0].body');
});

test('tree layout has one parent edge per visible child and no overlapping cards', () => {
  const index = astIndex(expressionTree());
  for (const vertical of [false,true]) {
    const layout = astLayout(index,0,new Set(index.map(item => item.id)),vertical);
    assert.equal(layout.edges.length,layout.nodes.length-1);
    assert.deepEqual(layout.edges.map(edge=>[edge.from,edge.to]),[[0,1],[1,2],[2,3],[2,4]]);
    for (let a=0;a<layout.nodes.length;a++) for(let b=a+1;b<layout.nodes.length;b++) {
      const x=layout.nodes[a],y=layout.nodes[b];
      assert.ok(x.x+layout.cardWidth<=y.x || y.x+layout.cardWidth<=x.x || x.y+layout.cardHeight<=y.y || y.y+layout.cardHeight<=x.y);
    }
  }
});

test('collapsed branches and rendering limits never invent or orphan nodes', () => {
  const index = astIndex(expressionTree());
  const collapsed=astLayout(index,0,new Set([0]));
  assert.deepEqual(collapsed.nodes.map(n=>n.id),[0,1]);
  const limited=astLayout(index,0,new Set(index.map(n=>n.id)),false,3);
  assert.equal(limited.truncated,true); assert.equal(limited.nodes.length,3);
  const visible=new Set(limited.nodes.map(n=>n.id));
  assert.ok(limited.edges.every(edge=>visible.has(edge.from)&&visible.has(edge.to)));
});
