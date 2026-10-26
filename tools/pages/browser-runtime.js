"use strict";
// Static-host adapter. The local IDE continues to use its Python HTTP API.
(() => {
  let worker = null, initializing = null, pending = null, sequence = 0, running = false;
  const readyTimeout = 120000, executionTimeout = 8000;
  function stop(error) {
    worker?.terminate(); worker = null; initializing = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; }
  }
  function send(operation, payload, timeout) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => stop(new Error(operation === "initialize"
        ? "The browser compiler could not load. Check your connection and try again."
        : "Compiler worker timeout exceeded. Try a smaller program or run locally.")), timeout);
      pending = {id, resolve, reject, timer};
      worker.postMessage({id, operation, payload});
    });
  }
  async function ready() {
    if (!initializing) {
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
        throw new Error("This browser needs WebAssembly and Web Workers to run Polyglot.");
      }
      const summary = document.getElementById("pipeline-summary");
      if (summary) summary.textContent = "Loading browser compiler… First use needs a runtime download.";
      worker = new Worker(new URL("compiler-worker.mjs", document.baseURI), {type: "module"});
      worker.onmessage = ({data}) => {
        if (!pending || pending.id !== data.id) return;
        const job = pending; pending = null; clearTimeout(job.timer);
        if (data.error) job.reject(new Error(data.error));
        else job.resolve(data.result);
      };
      worker.onerror = event => { event.preventDefault(); stop(new Error("Browser compiler could not load. Check your connection and try again.")); };
      initializing = send("initialize", {}, readyTimeout).catch(error => { stop(error); throw error; });
    }
    await initializing;
  }
  async function request(url, options = {}) {
    if (url === "/api/examples") return fetch(new URL("examples.json", document.baseURI));
    const match = /^\/api\/(check|run|build|exec|inspect)$/.exec(url);
    if (!match || options.method !== "POST") throw new Error("Unknown compiler request.");
    if (running) throw new Error("A compiler operation is already running.");
    const payload = JSON.parse(options.body);
    running = true;
    try {
      await ready();
      const summary = document.getElementById("pipeline-summary");
      if (summary) summary.textContent = "Compiling in your browser…";
      const result = await send(match[1], payload, executionTimeout);
      return {ok: true, json: async () => result};
    } finally { running = false; }
  }
  globalThis.PolyglotTransport = {request};
})();
