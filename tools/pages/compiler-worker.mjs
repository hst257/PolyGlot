// Only this trusted bootstrap runs as Python. User source goes through execute_job.
import {loadPyodide} from "./runtime/pyodide.mjs";

let initialize;
let execute;
async function ready() {
  if (!initialize) initialize = (async () => {
    const pyodide = await loadPyodide({indexURL: new URL("./runtime/", import.meta.url).href});
    const response = await fetch(new URL("compiler-package.json", import.meta.url));
    if (!response.ok) throw new Error("Compiler files could not be downloaded.");
    const files = await response.json();
    const root = "/home/pyodide";
    for (const [name, source] of Object.entries(files)) {
      if (!/^polyglot\/(?:[a-z_]+\/)*[a-z_]+\.py$/.test(name) || typeof source !== "string") {
        throw new Error("Invalid compiler package.");
      }
      const filename = `${root}/${name}`;
      pyodide.FS.mkdirTree(filename.slice(0, filename.lastIndexOf("/")));
      pyodide.FS.writeFile(filename, source);
    }
    await pyodide.runPythonAsync(`
import json
import sys
sys.path.insert(0, "/home/pyodide")
from polyglot.web.worker import execute_job

def _polyglot_execute(operation, payload_json):
    return json.dumps(execute_job(operation, json.loads(payload_json)), ensure_ascii=False)
`);
    execute = pyodide.globals.get("_polyglot_execute");
  })();
  return initialize;
}
self.onmessage = async ({data}) => {
  const {id, operation, payload} = data;
  try {
    await ready();
    if (operation === "initialize") self.postMessage({id, ready: true});
    else if (["check", "run", "build", "exec", "inspect"].includes(operation)) {
      self.postMessage({id, result: JSON.parse(execute(operation, JSON.stringify(payload)))});
    } else throw new Error("Unknown compiler operation.");
  } catch (error) {
    self.postMessage({id, error: error.message || "Browser compiler failed."});
  }
};
