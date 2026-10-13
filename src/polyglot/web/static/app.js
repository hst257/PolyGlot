"use strict";
const $ = id => document.getElementById(id);
const editor = $("editor");
let stages = {}, selectedStage = "recognition", busy = false, examples = {};

function updateEditor() {
  $("lines").textContent = Array.from({length: editor.value.split("\n").length}, (_, i) => i + 1).join("\n");
  const prefix = editor.value.slice(0, editor.selectionStart).split("\n");
  $("position").textContent = `Line ${prefix.length}, column ${prefix.at(-1).length + 1}`;
}
function showStage() {
  $("stage-data").textContent = stages[selectedStage] === undefined ? "This stage is not available. Compile valid source to inspect it." : JSON.stringify(stages[selectedStage], null, 2);
}
function dirty() {
  stages = {};
  showStage();
  $("status").textContent = "Source changed";
  updateEditor();
}
function diagnosticText(d) {
  const p = d.location || {};
  return `${p.filename || "program.poly"}:${p.line || 1}:${p.column || 1} · ${d.code}\n${d.message}${p.excerpt ? "\n" + p.excerpt : ""}${d.suggestion ? "\nHelp: " + d.suggestion : ""}${(d.stack || []).map(s => `\n  at ${s.function} (${s.filename}:${s.line})`).join("")}`;
}
async function action(operation, extra = {}) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach(b => b.disabled = true);
  $("status").textContent = operation === "run" || operation === "exec" ? "Running…" : "Compiling…";
  $("diagnostics").replaceChildren();
  const sourceAtStart = editor.value;
  try {
    const response = await fetch(`/api/${operation}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({source:sourceAtStart, filename:$("filename").value, ...extra})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    stages = sourceAtStart === editor.value ? result.stages || {} : {};
    showStage();
    $("status").textContent = sourceAtStart !== editor.value ? "Source changed during compilation" : result.ok ? "Successful" : "Stopped with an error";
    $("output").textContent = result.output || (result.ok ? operation === "run" || operation === "exec" ? "Program finished with no output." : "Compilation successful." : "Execution stopped.");
    $("execution-info").textContent = result.steps ? `${result.steps.toLocaleString()} VM instructions` : "";
    for (const d of result.diagnostics || []) {
      const item = document.createElement("button");
      item.className = "diagnostic";
      item.textContent = diagnosticText(d);
      item.addEventListener("click", () => {
        if (operation === "exec") return;
        const line = d.location?.line || 1, column = d.location?.column || 1;
        const offset = editor.value.split("\n").slice(0, line - 1).reduce((n, s) => n + s.length + 1, 0) + column - 1;
        editor.focus(); editor.setSelectionRange(offset, offset + 1);
        editor.scrollTop = Math.max(0, (line - 3) * 24); updateEditor();
      });
      $("diagnostics").append(item);
    }
    if (operation === "build" && result.ok) download(result.artifact_text, $("filename").value.replace(/\.[^.]*$/, "") + ".pbc", "application/json");
  } catch (error) {
    $("status").textContent = "Connection error";
    $("output").textContent = error.message;
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach(b => b.disabled = false);
  }
}
function download(text, name, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
editor.addEventListener("input", dirty);
editor.addEventListener("click", updateEditor);
editor.addEventListener("keyup", updateEditor);
editor.addEventListener("scroll", () => { $("lines").scrollTop = editor.scrollTop; });
editor.addEventListener("keydown", event => {
  if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
    const indentation = editor.value.slice(lineStart, start);
    if (start === editor.selectionEnd && /^ +$/.test(indentation) && indentation.length % 4 === 0) {
      event.preventDefault();
      editor.setRangeText("", start - 4, start, "end");
      dirty();
    }
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const start = editor.selectionStart, end = editor.selectionEnd;
    if (start !== end || event.shiftKey) {
      const from = editor.value.lastIndexOf("\n", start - 1) + 1;
      const nextNewline = editor.value.indexOf("\n", end > start && editor.value[end - 1] === "\n" ? end - 1 : end);
      const to = nextNewline < 0 ? editor.value.length : nextNewline;
      const original = editor.value.slice(from, to);
      const changed = original.split("\n").map(line => event.shiftKey ? line.replace(/^ {1,4}/, "") : "    " + line).join("\n");
      editor.setRangeText(changed, from, to, "select");
      if (start === end) editor.setSelectionRange(Math.max(from, start + changed.length - original.length), Math.max(from, start + changed.length - original.length));
    } else {
      editor.setRangeText("    ", start, end, "end");
    }
    dirty();
  }
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const line = editor.value.slice(0, editor.selectionStart).split("\n").at(-1);
    const indentation = line.match(/^ */)[0] + (/[:{]\s*$/.test(line) ? "    " : "");
    editor.setRangeText("\n" + indentation, editor.selectionStart, editor.selectionEnd, "end"); dirty();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); action("run"); }
});
for (const name of ["check", "run", "build", "inspect"]) $(name).addEventListener("click", () => action(name));
document.querySelectorAll("[data-stage]").forEach(button => button.addEventListener("click", () => {
  selectedStage = button.dataset.stage;
  document.querySelectorAll("[data-stage]").forEach(b => b.setAttribute("aria-selected", String(b === button)));
  showStage();
}));
$("upload-source").addEventListener("click", () => $("source-file").click());
$("upload-artifact").addEventListener("click", () => $("artifact-file").click());
$("download-source").addEventListener("click", () => download(editor.value, $("filename").value || "program.poly"));
$("source-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 131072) { $("status").textContent = "Source exceeds 128 KiB"; return; }
  editor.value = await file.text(); $("filename").value = file.name; dirty(); event.target.value = "";
});
$("artifact-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5000000) { $("status").textContent = "Artifact exceeds 5 MB"; return; }
  await action("exec", {artifact:await file.text(), filename:file.name}); event.target.value = "";
});
$("examples").addEventListener("change", () => {
  editor.value = examples[$("examples").value]; $("filename").value = $("examples").value; dirty();
});
fetch("/api/examples").then(r => r.json()).then(data => {
  examples = data;
  for (const name of Object.keys(data)) { const option = document.createElement("option"); option.value = name; option.textContent = name; $("examples").append(option); }
  const first = Object.keys(data)[0]; editor.value = data[first]; $("filename").value = first; updateEditor();
}).catch(error => { $("status").textContent = error.message; });
