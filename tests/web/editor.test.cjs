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
  ui.get('tab-ast').click(); assert.ok(ui.get('stage-data').querySelector('details'));
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
