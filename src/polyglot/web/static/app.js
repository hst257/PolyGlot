"use strict";
// Visual tokenization only. It never decides whether source can compile or execute.
const PolyglotHighlight = (() => {
  const keywords = new Set(["def", "return", "if", "elif", "else", "for", "while", "break", "continue",
    "function", "let", "const", "LET", "in", "new", "THEN", "GOTO"]);
  const types = new Set(["int", "float", "double", "bool", "boolean", "str", "string", "String", "void"]);
  const constants = new Set(["True", "False", "true", "false"]);
  const builtins = new Set(["print", "printf", "cout", "endl", "range", "len", "PRINT"]);
  const wordOperators = new Set(["and", "or", "not"]);
  const operators = ["::", "<<", "->", "+=", "-=", "++", "--", "==", "!=", "<=", ">=", "&&", "||"];
  const qualifiedBuiltins = [["System", ".", "out", ".", "println"], ["console", ".", "log"], ["std", "::", "cout"], ["std", "::", "endl"]];
  const isNameStart = c => c !== undefined && /[A-Za-z_]/.test(c);
  const isNamePart = c => c !== undefined && /[A-Za-z_0-9]/.test(c);

  function tokenize(source) {
    const tokens = [];
    let i = 0;
    const emit = (kind, start) => tokens.push({kind, start, end: i});
    while (i < source.length) {
      const start = i, c = source[i];
      if (/\s/.test(c)) {
        while (i < source.length && /\s/.test(source[i])) i++;
        emit("plain", start);
      } else if (c === "#" || source.startsWith("//", i)) {
        while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i++;
        emit("comment", start);
      } else if (source.startsWith("/*", i)) {
        const end = source.indexOf("*/", i + 2);
        i = end < 0 ? source.length : end + 2;
        emit("comment", start);
      } else if (c === '"' || c === "'") {
        const quote = c;
        i++;
        while (i < source.length && source[i] !== "\n" && source[i] !== "\r") {
          if (source[i] === quote) { i++; break; }
          if (source[i] === "\\" && i + 1 < source.length && !/[\r\n]/.test(source[i + 1])) i += 2;
          else i++;
        }
        emit("string", start);
      } else if (isNameStart(c)) {
        while (isNamePart(source[i])) i++;
        const name = source.slice(start, i);
        emit(keywords.has(name) ? "keyword" : types.has(name) ? "type" : constants.has(name) ? "constant" :
          wordOperators.has(name) ? "operator" : builtins.has(name) ? "builtin" : "identifier", start);
      } else if (/[0-9]/.test(c)) {
        while (i < source.length && /[0-9]/.test(source[i])) i++;
        if (source[i] === "." && /[0-9]/.test(source[i + 1] || "")) {
          i++;
          while (i < source.length && /[0-9]/.test(source[i])) i++;
        }
        if (source[i] === "e" || source[i] === "E") {
          i++;
          if (source[i] === "+" || source[i] === "-") i++;
          while (i < source.length && /[0-9]/.test(source[i])) i++;
        }
        emit("number", start);
      } else {
        const op = operators.find(value => source.startsWith(value, i));
        if (op) i += op.length;
        else i++;
        emit(op || "+-*/%<>=!".includes(c) ? "operator" : "()[]{}:;,.".includes(c) ? "punctuation" : "plain", start);
      }
    }
    // Use token context, not capitalization, to recognize declarations/calls and exact APIs.
    const code = tokens.filter(t => t.kind !== "comment" && t.kind !== "plain");
    const text = t => t ? source.slice(t.start, t.end) : "";
    for (let n = 0; n < code.length; n++) {
      const token = code[n];
      if (token.kind === "identifier" && (text(code[n + 1]) === "(" || ["def", "function"].includes(text(code[n - 1]))))
        token.kind = "function";
      for (const pattern of qualifiedBuiltins) {
        if (pattern.every((part, offset) => text(code[n + offset]) === part)) {
          pattern.forEach((part, offset) => { if (isNameStart(part[0])) code[n + offset].kind = "builtin"; });
        }
      }
    }
    return tokens;
  }

  function bracketPairs(source, tokens) {
    const pairs = new Map(), stack = [], closes = {")": "(", "]": "[", "}": "{"};
    for (const token of tokens) {
      if (token.kind !== "punctuation") continue;
      const c = source.slice(token.start, token.end);
      if ("([{".includes(c)) stack.push({c, offset: token.start});
      else if (closes[c]) {
        const opening = stack.pop();
        if (opening?.c === closes[c]) { pairs.set(opening.offset, token.start); pairs.set(token.start, opening.offset); }
        else stack.length = 0;
      }
    }
    return pairs;
  }
  return Object.freeze({tokenize, bracketPairs});
})();
if (typeof module !== "undefined" && module.exports) module.exports = PolyglotHighlight;
if (typeof document !== "undefined") {
const $ = id => document.getElementById(id);
const editor = $("editor");
const highlight = $("highlight-layer"), sourcePane = $("source-pane");
let editorSource = null, lineStarts = [0], highlightTimer, bracketNodes = new Map(), pairs = new Map(), markedBrackets = [];

function syncEditorScroll() {
  $("lines").scrollTop = editor.scrollTop;
  highlight.style.width = editor.clientWidth + "px";
  highlight.style.height = editor.clientHeight + "px";
  highlight.scrollTop = editor.scrollTop;
  highlight.scrollLeft = editor.scrollLeft;
}
function updateCursorDecoration(line) {
  $("active-line").style.top = (20 + line * 24 - editor.scrollTop) + "px";
  markedBrackets.forEach(node => node.classList.remove("matching-bracket"));
  markedBrackets = [];
  if (editor.selectionStart !== editor.selectionEnd || highlightTimer || !sourcePane.classList.contains("highlight-ready")) return;
  const position = pairs.has(editor.selectionStart - 1) ? editor.selectionStart - 1 : editor.selectionStart;
  if (!pairs.has(position)) return;
  for (const offset of [position, pairs.get(position)]) {
    const node = bracketNodes.get(offset);
    if (node) { node.classList.add("matching-bracket"); markedBrackets.push(node); }
  }
}
function renderHighlight() {
  highlightTimer = undefined;
  const source = editor.value;
  if (source.length > 262144) {
    sourcePane.classList.remove("highlight-ready");
    pairs = new Map(); bracketNodes = new Map();
    return; // Above the compiler's source limit, retain responsive plain-text editing.
  }
  try {
    const tokens = PolyglotHighlight.tokenize(source), fragment = document.createDocumentFragment();
    bracketNodes = new Map();
    for (const token of tokens) {
      const value = source.slice(token.start, token.end);
      if (token.kind === "plain" || token.kind === "identifier") fragment.append(document.createTextNode(value));
      else {
        const span = document.createElement("span");
        span.className = `syntax-${token.kind}`;
        span.textContent = value; // Source is never parsed as HTML.
        fragment.append(span);
        if (token.kind === "punctuation" && "()[]{}".includes(value)) bracketNodes.set(token.start, span);
      }
    }
    const tail = document.createElement("span");
    tail.className = "highlight-tail";
    tail.textContent = "\u200b"; // Keep a final empty line measurable without changing editable source.
    fragment.append(tail);
    highlight.replaceChildren(fragment);
    pairs = PolyglotHighlight.bracketPairs(source, tokens);
    sourcePane.classList.add("highlight-ready");
    syncEditorScroll();
  } catch {
    sourcePane.classList.remove("highlight-ready"); // Plain text stays readable if highlighting fails.
    pairs = new Map(); bracketNodes = new Map();
  }
}
function scheduleHighlight() {
  clearTimeout(highlightTimer);
  if (editor.value.length > 16000) {
    sourcePane.classList.remove("highlight-ready");
    highlightTimer = setTimeout(() => { renderHighlight(); updateEditor(); }, 70);
  } else renderHighlight();
}

// Browser editing commands preserve native undo history for custom indentation/newlines.
function replaceEditorText(text, from, to, selection = "end") {
  editor.focus(); editor.setSelectionRange(from, to);
  let inserted = false;
  try { inserted = document.execCommand(text ? "insertText" : "delete", false, text); } catch { /* Compatibility fallback. */ }
  if (!inserted) editor.setRangeText(text, from, to, "end");
  const end = from + text.length;
  editor.setSelectionRange(selection === "select" ? from : end, end);
}
let stages = {}, selectedStage = "recognition", busy = false, examples = {};
const stageTitles = {recognition: "Syntax recognition", tokens: "Lexer tokens", ast: "Abstract syntax tree",
  symbols: "Symbols and types", ir: "Typed intermediate representation", bytecode: "VM bytecode"};
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
try {
  const savedTheme = localStorage.getItem("polyglot-theme");
  if (savedTheme === "light" || savedTheme === "dark") document.documentElement.dataset.theme = savedTheme;
} catch { /* System theme still works if local storage is unavailable. */ }
function isDarkTheme() {
  return document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && systemTheme.matches);
}
function updateThemeButton() {
  const dark = isDarkTheme();
  $("theme-toggle").setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
  $("theme-icon").setAttribute("href", dark ? "#ph-sun" : "#ph-moon");
}
$("theme-toggle").addEventListener("click", () => {
  const theme = isDarkTheme() ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("polyglot-theme", theme); } catch { /* Keep the session theme. */ }
  updateThemeButton();
});
systemTheme.addEventListener("change", updateThemeButton);
updateThemeButton();
function setStatus(text, state = "ready") {
  $("status").textContent = text;
  $("status").dataset.state = state;
}

function updateEditor() {
  if (editorSource !== editor.value) {
    editorSource = editor.value;
    lineStarts = [0];
    for (let i = 0; i < editorSource.length; i++) if (editorSource[i] === "\n") lineStarts.push(i + 1);
    $("lines").textContent = lineStarts.map((_, i) => i + 1).join("\n");
    scheduleHighlight();
  }
  const cursor = editor.selectionDirection === "backward" ? editor.selectionStart : editor.selectionEnd;
  let low = 0, high = lineStarts.length;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (lineStarts[middle] <= cursor) low = middle; else high = middle;
  }
  $("position").textContent = `Line ${low + 1}, column ${cursor - lineStarts[low] + 1}`;
  updateCursorDecoration(low);
  syncEditorScroll();
}
function showStage() {
  const available = stages[selectedStage] !== undefined;
  const compiled = Object.keys(stages).length > 0;
  $("stage-data").textContent = available ? JSON.stringify(stages[selectedStage], null, 2) : compiled ?
    "This stage is not available. Compile valid source to inspect it." : "Check or run a program to inspect its stages.";
  $("stage-data").dataset.empty = String(!available);
  $("stage-data").setAttribute("aria-labelledby", `tab-${selectedStage}`);
  $("stage-title").textContent = stageTitles[selectedStage];
  $("stage-state").textContent = available ? "Available" : compiled ? "Not available" : "Awaiting compilation";
}
function dirty() {
  sourcePane.classList.remove("compiler-error");
  stages = {};
  showStage();
  setStatus("Source changed", "changed");
  updateEditor();
}
function diagnosticText(d) {
  const p = d.location || {};
  return `${p.filename || "program.poly"}:${p.line || 1}:${p.column || 1} · ${d.code}\n${d.message}${p.excerpt ? "\n" + p.excerpt : ""}${d.suggestion ? "\nHelp: " + d.suggestion : ""}${(d.stack || []).map(s => `\n  at ${s.function} (${s.filename}:${s.line})`).join("")}`;
}
async function action(operation, extra = {}) {
  if (busy) return;
  busy = true;
  sourcePane.classList.remove("compiler-error");
  document.querySelectorAll("[data-operation], #upload-artifact").forEach(b => b.disabled = true);
  $("workbench").setAttribute("aria-busy", "true");
  setStatus(operation === "run" || operation === "exec" ? "Running…" : "Compiling…", "busy");
  $("diagnostics").replaceChildren();
  const sourceAtStart = editor.value;
  try {
    const response = await fetch(`/api/${operation}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({source:sourceAtStart, filename:$("filename").value, ...extra})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    stages = sourceAtStart === editor.value ? result.stages || {} : {};
    sourcePane.classList.toggle("compiler-error", operation !== "exec" && sourceAtStart === editor.value && !result.ok);
    showStage();
    setStatus(sourceAtStart !== editor.value ? "Source changed during compilation" : result.ok ? "Successful" : "Stopped with an error",
      sourceAtStart !== editor.value ? "changed" : result.ok ? "success" : "error");
    $("output").textContent = result.output || (result.ok ? operation === "run" || operation === "exec" ? "Program finished with no output." : "Compilation successful." : "Execution stopped.");
    $("output").dataset.empty = String(!result.output);
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
    setStatus("Connection error", "error");
    $("output").textContent = error.message;
    $("output").dataset.empty = "false";
  } finally {
    busy = false;
    $("workbench").setAttribute("aria-busy", "false");
    document.querySelectorAll("[data-operation], #upload-artifact").forEach(b => b.disabled = false);
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
editor.addEventListener("select", updateEditor);
editor.addEventListener("focus", updateEditor);
editor.addEventListener("scroll", updateEditor);
document.addEventListener("selectionchange", () => { if (document.activeElement === editor) updateEditor(); });
if (typeof ResizeObserver !== "undefined") new ResizeObserver(updateEditor).observe(editor);
editor.addEventListener("keydown", event => {
  if (event.key === "Backspace" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;
    const indentation = editor.value.slice(lineStart, start);
    if (start === editor.selectionEnd && /^ +$/.test(indentation) && indentation.length % 4 === 0) {
      event.preventDefault();
      replaceEditorText("", start - 4, start);
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
      replaceEditorText(changed, from, to, "select");
      if (start === end) editor.setSelectionRange(Math.max(from, start + changed.length - original.length), Math.max(from, start + changed.length - original.length));
    } else {
      replaceEditorText("    ", start, end);
    }
    dirty();
  }
  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const line = editor.value.slice(0, editor.selectionStart).split("\n").at(-1);
    const indentation = line.match(/^ */)[0] + (/[:{]\s*$/.test(line) ? "    " : "");
    replaceEditorText("\n" + indentation, editor.selectionStart, editor.selectionEnd); dirty();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); action("run"); }
});
for (const name of ["check", "run", "build", "inspect"]) $(name).addEventListener("click", () => action(name));
const stageTabs = [...document.querySelectorAll("[data-stage]")];
function selectStage(button) {
  selectedStage = button.dataset.stage;
  stageTabs.forEach(b => {
    b.setAttribute("aria-selected", String(b === button));
    b.tabIndex = b === button ? 0 : -1;
  });
  showStage();
}
stageTabs.forEach((button, index) => {
  button.addEventListener("click", () => selectStage(button));
  button.addEventListener("keydown", event => {
    let target;
    if (event.key === "ArrowRight") target = stageTabs[(index + 1) % stageTabs.length];
    if (event.key === "ArrowLeft") target = stageTabs[(index + stageTabs.length - 1) % stageTabs.length];
    if (event.key === "Home") target = stageTabs[0];
    if (event.key === "End") target = stageTabs.at(-1);
    if (target) { event.preventDefault(); selectStage(target); target.focus(); }
  });
});
$("upload-source").addEventListener("click", () => $("source-file").click());
$("upload-artifact").addEventListener("click", () => $("artifact-file").click());
$("download-source").addEventListener("click", () => download(editor.value, $("filename").value || "program.poly"));
$("source-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 131072) { setStatus("Source exceeds 128 KiB", "error"); return; }
  editor.value = await file.text(); $("filename").value = file.name; dirty(); event.target.value = "";
});
$("artifact-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5000000) { setStatus("Artifact exceeds 5 MB", "error"); return; }
  await action("exec", {artifact:await file.text(), filename:file.name}); event.target.value = "";
});
$("examples").addEventListener("change", () => {
  editor.value = examples[$("examples").value]; $("filename").value = $("examples").value; dirty();
});
fetch("/api/examples").then(r => r.json()).then(data => {
  examples = data;
  for (const name of Object.keys(data)) { const option = document.createElement("option"); option.value = name; option.textContent = name; $("examples").append(option); }
  const first = Object.keys(data)[0]; editor.value = data[first]; $("filename").value = first; updateEditor();
}).catch(error => { setStatus(error.message, "error"); });
}
