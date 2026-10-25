const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'src/polyglot/web/static/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'src/polyglot/web/static/app.js'), 'utf8');
const examples = JSON.parse(fs.readFileSync(path.join(root, 'src/polyglot/web/static/examples.json'), 'utf8'));
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const turn = () => new Promise(resolve => setImmediate(resolve));
const compiler = `import sys,json; sys.path.insert(0,'src'); from polyglot.web.worker import execute_job; p=json.load(sys.stdin); print(json.dumps(execute_job(p['operation'],p['payload'])))`;
function compile(operation, payload) {
  const result = spawnSync(python, ['-c', compiler], {cwd: root, encoding: 'utf8', input: JSON.stringify({operation, payload})});
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
async function workspace(options = {}) {
  let resolveExamples, resolveOperation;
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8765', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = () => ({matches: false, addEventListener() {}});
      window.scrollTo = () => {};
      if (options.layout) window.localStorage.setItem('polyglot-layout-v1', options.layout);
      if (options.theme) window.localStorage.setItem('polyglot-theme', options.theme);
      if (options.draft) window.localStorage.setItem('polyglot-draft-v1', options.draft);
      if (options.blockedStorage) Object.defineProperty(window, 'localStorage', {get() { throw new Error('Storage disabled'); }});
      window.fetch = async (url, init) => {
        if (url === '/api/examples') {
          if (options.delayExamples) await new Promise(resolve => { resolveExamples = resolve; });
          return {ok: true, json: async () => examples};
        }
        const result = compile(url.split('/').at(-1), JSON.parse(init.body));
        if (options.delayOperation) await new Promise(resolve => { resolveOperation = resolve; });
        return {ok: true, json: async () => result};
      };
    }
  });
  const {window} = dom, document = window.document;
  const app = document.createElement('script'); app.textContent = script; document.body.append(app);
  await turn();
  const get = id => document.getElementById(id);
  const input = (id, value) => { get(id).value = value; get(id).dispatchEvent(new window.Event('input', {bubbles:true})); };
  const select = name => { get('examples').value = name; get('examples').dispatchEvent(new window.Event('change', {bubbles:true})); };
  return {window, document, get, input, select, close: () => window.close(),
    resolveExamples: () => resolveExamples(), resolveOperation: () => resolveOperation()};
}

test('real editor restores source and filename, including an intentionally empty draft', async () => {
  for (const source of ['', 'print("draft 😀")\n']) {
    const first = await workspace();
    first.input('editor', source); first.input('filename', 'recovered.poly');
    first.window.dispatchEvent(new first.window.Event('pagehide'));
    const draft = first.window.localStorage.getItem('polyglot-draft-v1'); first.close();
    const second = await workspace({draft});
    assert.equal(second.get('editor').value, source);
    assert.equal(second.get('filename').value, 'recovered.poly');
    assert.match(second.get('draft-status').textContent, /restored/); second.close();
  }
});

test('switching examples keeps edited code until explicit replacement; Escape cancels', async () => {
  const ui = await workspace();
  ui.input('editor', 'print("keep this")\n');
  ui.select('p1_mixed.poly');
  assert.equal(ui.get('replace-source-dialog').hidden, false);
  ui.get('keep-source').click(); await turn();
  assert.equal(ui.get('editor').value, 'print("keep this")\n');
  assert.equal(ui.get('examples').value, 'mixed_demo.poly');
  ui.select('p1_mixed.poly');
  ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', {key:'Escape', bubbles:true})); await turn();
  assert.equal(ui.get('replace-source-dialog').hidden, true);
  assert.equal(ui.get('editor').value, 'print("keep this")\n');
  ui.select('p1_mixed.poly'); ui.get('replace-source').click(); await turn();
  assert.equal(ui.get('editor').value, examples['p1_mixed.poly']);
  assert.equal(ui.get('filename').value, 'p1_mixed.poly'); ui.close();
});

test('a delayed example catalog never overwrites code typed during startup', async () => {
  const ui = await workspace({delayExamples:true});
  ui.input('editor', 'print("started typing")\n');
  ui.resolveExamples(); await turn();
  assert.equal(ui.get('editor').value, 'print("started typing")\n'); ui.close();
});

test('real compiler diagnostics select the error and disappear after source or filename edits', async () => {
  const ui = await workspace();
  ui.input('editor', 'print("😀", missing)\n');
  ui.get('check').click(); await turn();
  const diagnostic = ui.get('diagnostics').querySelector('button'); assert.ok(diagnostic);
  diagnostic.click();
  const editor = ui.get('editor');
  assert.equal(editor.value.slice(editor.selectionStart, editor.selectionEnd), 'missing');
  ui.input('filename', 'renamed.poly'); assert.equal(ui.get('diagnostics').children.length, 0);
  ui.get('check').click(); await turn(); assert.equal(ui.get('diagnostics').children.length, 1);
  ui.input('editor', 'print(1)\n'); assert.equal(ui.get('diagnostics').children.length, 0);
  assert.equal(ui.get('stage-data').dataset.empty, 'true'); ui.close();
});

test('a response for an old revision cannot attach diagnostics to newly edited source', async () => {
  const ui = await workspace({delayOperation:true});
  ui.input('editor', 'print(missing)\n'); ui.get('check').click();
  ui.input('editor', 'print(42)\n'); ui.resolveOperation(); await turn();
  assert.equal(ui.get('diagnostics').children.length, 0);
  assert.equal(ui.get('stage-data').dataset.empty, 'true');
  assert.equal(ui.get('status').textContent, 'Source changed during compilation'); ui.close();
});

test('all readable views and raw JSON use actual compiler data and safe text nodes', async () => {
  const ui = await workspace();
  ui.select('p1_mixed.poly'); await turn(); ui.get('run').click(); await turn();
  assert.equal(ui.get('output').textContent, 'total 8\nformatted: 8, 2.500000, ready\nBASIC output\n8\ndone\n');
  for (const stage of ['recognition', 'tokens', 'symbols', 'ir', 'bytecode']) {
    ui.get('tab-'+stage).click(); assert.ok(ui.get('stage-data').querySelector('table'), stage);
    ui.get('stage-format').click(); assert.ok(JSON.parse(ui.get('stage-data').textContent));
    ui.get('stage-format').click(); assert.ok(ui.get('stage-data').querySelector('table'));
  }
  ui.get('tab-ast').click(); assert.ok(ui.get('stage-data').querySelector('.ast-edges path'));
  ui.input('editor', 'print("<img src=x onerror=alert(1)>")\n'); ui.get('run').click(); await turn();
  ui.get('tab-tokens').click(); assert.equal(ui.document.querySelectorAll('img').length, 0);
  assert.match(ui.get('stage-data').textContent, /<img src=x/); ui.close();
});

test('large token tables reveal additional rows without losing compiler entries', async () => {
  const ui = await workspace();
  ui.input('editor', 'print(1)\n'.repeat(100)); ui.get('check').click(); await turn(); ui.get('tab-tokens').click();
  assert.equal(ui.get('stage-data').querySelectorAll('tbody tr').length, 200);
  const more = ui.get('stage-data').querySelector('.stage-more'); assert.equal(more.hidden, false);
  more.click(); assert.equal(ui.get('stage-data').querySelectorAll('tbody tr').length, 400);
  more.click(); assert.equal(ui.get('stage-data').querySelectorAll('tbody tr').length, 501);
  assert.equal(more.hidden, true); ui.close();
});

test('disabled browser storage remains visible and does not prevent compilation', async () => {
  const ui = await workspace({blockedStorage:true});
  ui.input('editor', 'print(42)\n'); ui.window.dispatchEvent(new ui.window.Event('pagehide'));
  assert.match(ui.get('draft-status').textContent, /Draft not saved/);
  ui.get('run').click(); await turn(); assert.equal(ui.get('output').textContent, '42\n'); ui.close();
});

test('an unchanged older tab does not overwrite a newer draft on page exit', async () => {
  const ui = await workspace();
  ui.window.dispatchEvent(new ui.window.Event('pagehide'));
  const latest = JSON.stringify({version:1, source:'newer tab', filename:'new.poly'});
  ui.window.localStorage.setItem('polyglot-draft-v1', latest);
  ui.window.dispatchEvent(new ui.window.Event('pagehide'));
  assert.equal(ui.window.localStorage.getItem('polyglot-draft-v1'), latest); ui.close();
});

test('file search filters real examples and selecting a file updates the editor', async () => {
  const ui = await workspace();
  ui.input('file-search', 'array');
  const names = [...ui.get('file-list').querySelectorAll('button')].map(button => button.dataset.example);
  assert.deepEqual(names, ['array_iteration.poly', 'arrays_mixed.poly']);
  ui.get('file-list').querySelector('button').click(); await turn();
  assert.equal(ui.get('filename').value, 'array_iteration.poly');
  assert.equal(ui.get('editor').value, examples['array_iteration.poly']);
  assert.equal(ui.get('file-list').querySelector('[aria-current="true"]').dataset.example, 'array_iteration.poly');
  ui.input('file-search', 'no-matching-file'); assert.match(ui.get('file-list').textContent, /No matching/); ui.close();
});

test('collapsing programs preserves source and persists the layout', async () => {
  const ui = await workspace();
  const source = ui.get('editor').value;
  ui.get('sidebar-toggle').click();
  assert.equal(ui.get('program-sidebar').hidden, true);
  assert.equal(ui.get('sidebar-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(ui.get('editor').value, source);
  const layout = ui.window.localStorage.getItem('polyglot-layout-v1'); ui.close();
  const restored = await workspace({layout}); assert.equal(restored.get('program-sidebar').hidden, true);
  restored.get('sidebar-toggle').click(); assert.equal(restored.get('program-sidebar').hidden, false); restored.close();
});

test('both pane separators support keyboard resizing and size limits', async () => {
  const ui = await workspace();
  Object.defineProperty(ui.get('workbench'), 'clientHeight', {value:700});
  const output = ui.get('output-resizer'), inspector = ui.get('workspace-resizer');
  const before = Number(output.getAttribute('aria-valuenow'));
  output.dispatchEvent(new ui.window.KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true}));
  assert.equal(Number(output.getAttribute('aria-valuenow')), before + 16);
  output.dispatchEvent(new ui.window.KeyboardEvent('keydown', {key:'Home', bubbles:true}));
  assert.equal(output.getAttribute('aria-valuenow'), output.getAttribute('aria-valuemin'));
  inspector.dispatchEvent(new ui.window.KeyboardEvent('keydown', {key:'End', bubbles:true}));
  assert.equal(inspector.getAttribute('aria-valuenow'), inspector.getAttribute('aria-valuemax'));
  const layout = JSON.parse(ui.window.localStorage.getItem('polyglot-layout-v1'));
  assert.equal(layout.outputHeight, Number(output.getAttribute('aria-valuenow'))); ui.close();
});

test('compiler records navigate to source and source selection highlights matching tokens', async () => {
  const ui = await workspace();
  ui.get('check').click(); await turn(); ui.get('tab-tokens').click();
  const links = [...ui.get('stage-data').querySelectorAll('.source-link')];
  const link = links.find(button => button.getAttribute('aria-label') === 'Go to source line 1, column 1');
  assert.ok(link); link.click();
  assert.equal(ui.get('editor').value.slice(ui.get('editor').selectionStart, ui.get('editor').selectionEnd), 'total');
  assert.equal(ui.get('stage-data').querySelectorAll('.source-match').length, 1);
  ui.get('tab-ast').click();
  assert.equal(ui.get('stage-data').querySelector('.ast-node-kind').textContent, 'Program');
  const functionLink = [...ui.get('stage-data').querySelectorAll('.ast-select')].find(button => button.getAttribute('aria-label') === 'Function add, source line 3');
  assert.ok(functionLink);
  ui.get('stage-data').querySelector('button[aria-label="Expand tree view"]').click();
  functionLink.click(); assert.equal(ui.document.body.classList.contains('ast-expanded'),false);
  const selected = ui.get('editor').value.slice(ui.get('editor').selectionStart, ui.get('editor').selectionEnd);
  assert.match(selected, /^int add/); assert.match(selected, /return a \+ b/); ui.close();
});

test('uploaded bytecode cannot link compiler locations into unrelated editor source', async () => {
  const ui = await workspace();
  const artifact = compile('build', {source:'print(99)\n', filename:'other.poly'}).artifact_text;
  Object.defineProperty(ui.get('artifact-file'), 'files', {value:[{size:artifact.length, text:async () => artifact}]});
  ui.get('artifact-file').dispatchEvent(new ui.window.Event('change', {bubbles:true})); await turn();
  assert.equal(ui.get('output').textContent, '99\n');
  ui.get('tab-bytecode').click();
  assert.equal(ui.get('stage-data').querySelectorAll('button.source-link').length, 0); ui.close();
});

test('clearing docked output keeps source and compiler inspection data', async () => {
  const ui = await workspace(); ui.get('run').click(); await turn();
  assert.equal(ui.get('output-count').textContent, '6');
  ui.get('clear-output').click(); assert.equal(ui.get('output-count').textContent, '0');
  assert.equal(ui.get('stage-data').dataset.empty, 'false');
  assert.equal(ui.get('editor').value, examples['mixed_demo.poly']); ui.close();
});

test('light and dark theme selection survives reload without changing source', async () => {
  const ui = await workspace(); const source = ui.get('editor').value;
  ui.get('theme-toggle').click(); assert.equal(ui.document.documentElement.dataset.theme, 'dark');
  assert.equal(ui.get('editor').value, source);
  const theme = ui.window.localStorage.getItem('polyglot-theme'); ui.close();
  const restored = await workspace({theme}); assert.equal(restored.document.documentElement.dataset.theme, 'dark');
  restored.get('theme-toggle').click(); assert.equal(restored.document.documentElement.dataset.theme, 'light'); restored.close();
});

test('focus mode restores source, selection and docked output without recreating the editor', async () => {
  const ui = await workspace(); const editor = ui.get('editor');
  editor.setSelectionRange(3, 12); const source = editor.value;
  ui.get('maximize-editor').click();
  assert.equal(ui.document.body.classList.contains('editor-maximized'), true);
  assert.equal(ui.get('maximize-editor').getAttribute('aria-pressed'), 'true');
  assert.equal(ui.get('output-resizer').hidden, false);
  editor.dispatchEvent(new ui.window.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  assert.equal(ui.document.body.classList.contains('editor-maximized'), false);
  assert.equal(ui.get('editor'), editor); assert.equal(editor.value, source);
  assert.equal(editor.selectionStart, 3); assert.equal(editor.selectionEnd, 12); ui.close();
});

test('AST defaults to connected nodes and expansion matches the real compiler tree', async () => {
  const ui=await workspace(); ui.get('check').click(); await turn(); ui.get('tab-ast').click();
  const panel=ui.get('stage-data');
  const cards=()=>[...panel.querySelectorAll('.ast-node-card')];
  assert.equal(cards()[0].querySelector('.ast-node-kind').textContent,'Program');
  assert.equal(panel.querySelectorAll('.ast-edges path').length,cards().length-1);
  const initial=cards().length;
  [...panel.querySelectorAll('button')].find(b=>b.textContent==='Expand all').click();
  assert.ok(cards().length>initial);
  assert.equal(panel.querySelectorAll('.ast-edges path').length,cards().length-1);
  assert.ok(cards().some(card=>card.dataset.kind==='Binary'));
  [...panel.querySelectorAll('button')].find(b=>b.textContent==='Collapse all').click();
  assert.equal(cards().length,initial); ui.close();
});

test('AST focus, branch controls and orientation preserve real node data', async () => {
  const ui=await workspace(); ui.input('editor','x = 1 + 2\n'); ui.get('check').click(); await turn(); ui.get('tab-ast').click();
  const panel=ui.get('stage-data');
  panel.querySelector('button[aria-label="Expand children of Assign x"]').click();
  assert.ok(panel.querySelector('[data-kind="Binary"]'));
  panel.querySelector('button[aria-label="Expand children of Binary +"]').click();
  assert.equal(panel.querySelectorAll('[data-kind="Literal"]').length,2);
  panel.querySelector('button[aria-label="Use top-to-bottom tree layout"]').click();
  assert.ok(panel.querySelector('button[aria-label="Use left-to-right tree layout"]'));
  const focus=panel.querySelector('select'); focus.value='1'; focus.dispatchEvent(new ui.window.Event('change'));
  assert.equal(panel.querySelector('.ast-node-kind').textContent,'Assign');
  assert.equal(ui.get('editor').value,'x = 1 + 2\n'); ui.close();
});

test('AST zoom, expanded canvas, outline and raw JSON retain their controls and clean up', async () => {
  const ui=await workspace(); ui.get('check').click(); await turn(); ui.get('tab-ast').click();
  const panel=ui.get('stage-data');
  panel.querySelector('button[aria-label="Zoom out syntax tree"]').click();
  assert.equal(panel.querySelector('.ast-zoom').textContent,'85%');
  panel.querySelector('button[aria-label="Expand tree view"]').click();
  assert.ok(ui.document.body.classList.contains('ast-expanded'));
  ui.document.dispatchEvent(new ui.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(ui.document.body.classList.contains('ast-expanded'),false);
  [...panel.querySelectorAll('button')].find(b=>b.textContent==='Outline').click();
  assert.ok(panel.querySelector('details'));
  [...panel.querySelectorAll('button')].find(b=>b.textContent==='Show connected tree').click();
  assert.ok(panel.querySelector('.ast-edges path'));
  ui.get('stage-format').click(); const raw=JSON.parse(panel.textContent); assert.equal(raw.kind,'Program');
  ui.get('stage-format').click(); assert.ok(panel.querySelector('.ast-edges path'));
  panel.querySelector('button[aria-label="Expand tree view"]').click(); ui.get('tab-tokens').click();
  assert.equal(ui.document.body.classList.contains('ast-expanded'),false); ui.close();
});
