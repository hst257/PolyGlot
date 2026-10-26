const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('tools/pages/browser-runtime.js', 'utf8');
function setup() {
  const workers = [], timers = new Map(); let clock = 0;
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; workers.push(this); }
    postMessage(message) { this.last = message; }
    terminate() { this.terminated = true; }
    reply(result) { this.onmessage({data: {id: this.last.id, result}}); }
  }
  const context = vm.createContext({Worker, WebAssembly: {}, URL,
    document: {baseURI: 'https://hst257.github.io/PolyGlot/', getElementById: () => ({textContent:''})},
    fetch: async url => ({url: String(url)}),
    setTimeout: (fn, delay) => { timers.set(++clock, {fn, delay}); return clock; },
    clearTimeout: id => timers.delete(id)});
  vm.runInContext(source, context);
  return {request: context.PolyglotTransport.request, workers, timers};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('Pages uses project-relative example and module worker URLs', async () => {
  const {request,workers} = setup();
  assert.equal((await request('/api/examples')).url, 'https://hst257.github.io/PolyGlot/examples.json');
  const job = request('/api/run', {method:'POST',body:JSON.stringify({source:'print(20)'})});
  const worker = workers[0];
  assert.equal(worker.url.href, 'https://hst257.github.io/PolyGlot/compiler-worker.mjs');
  assert.equal(worker.options.type, 'module');
  worker.reply(); await tick();
  assert.equal(worker.last.operation, 'run');
  assert.equal(worker.last.payload.source, 'print(20)');
  worker.reply({ok:true,output:'20\n'});
  assert.equal((await (await job).json()).output, '20\n');
});
test('execution timeout terminates worker and a later run creates a fresh worker', async () => {
  const {request,workers,timers} = setup();
  const job = request('/api/run',{method:'POST',body:'{}'});
  workers[0].reply(); await tick();
  [...timers.values()].find(t=>t.delay===8000).fn();
  await assert.rejects(job,/timeout/);
  assert.equal(workers[0].terminated,true);
  const retry = request('/api/check',{method:'POST',body:'{}'});
  assert.equal(workers.length,2);
  workers[1].reply(); await tick(); workers[1].reply({ok:true});
  assert.equal((await (await retry).json()).ok,true);
});
test('failed initialization can retry and overlapping jobs are rejected', async () => {
  const {request,workers} = setup();
  const job = request('/api/run',{method:'POST',body:'{}'});
  await assert.rejects(request('/api/check',{method:'POST',body:'{}'}),/already running/);
  workers[0].onerror({preventDefault(){}});
  await assert.rejects(job,/could not load/);
  const retry = request('/api/build',{method:'POST',body:'{}'});
  workers[1].reply(); await tick(); workers[1].reply({ok:true,artifact_text:'artifact'});
  assert.equal((await (await retry).json()).artifact_text,'artifact');
});
