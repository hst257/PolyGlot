"use strict";
// Workspace helpers are shared with the dependency-free Node regression tests.
const PolyglotWorkspace = (() => {
  const DRAFT_KEY = "polyglot-draft-v1";
  function readDraft(storage) {
    try {
      const draft = JSON.parse(storage.getItem(DRAFT_KEY));
      if (draft?.version !== 1 || typeof draft.source !== "string" || draft.source.length > 262144 ||
          typeof draft.filename !== "string" || draft.filename.length > 256) return null;
      return draft;
    } catch { return null; }
  }
  function saveDraft(storage, source, filename) {
    try {
      if (source.length > 262144 || filename.length > 256) return false;
      storage.setItem(DRAFT_KEY, JSON.stringify({version: 1, source, filename, savedAt: Date.now()}));
      return true;
    } catch { return false; }
  }
  function sourceRange(source, location = {}) {
    // Compiler columns count Unicode code points; textarea offsets count UTF-16 units.
    const lines = source.split("\n");
    const line = Math.max(1, Math.min(lines.length, location.line || 1));
    const offset = lines.slice(0, line - 1).reduce((n, text) => n + text.length + 1, 0);
    const column = Math.max(0, (location.column || 1) - 1);
    const text = lines[line - 1];
    const start = offset + Array.from(text).slice(0, column).join("").length;
    const endColumn = location.end_line === line ? Math.max(column + 1, (location.end_column || column + 2) - 1) : column + 1;
    const end = offset + Array.from(text).slice(0, endColumn).join("").length;
    return {start, end: Math.max(start, end), line};
  }
  const valueText = value => typeof value === "string" ? value : JSON.stringify(value) ?? "—";
  const at = location => location ? `${location.line}:${location.column}` : "—";
  function tableData(stage, data) {
    if (stage === "tokens") return {
      headers: ["Token", "Text", "Position"],
      rows: data.map(t => [t.kind, JSON.stringify(t.text), at(t.span)])
    };
    if (stage === "recognition") return {
      headers: ["Syntax", "Rule", "Position"],
      rows: data.map(r => [r.candidates?.length ? r.candidates.join(" / ") : r.family,
        r.grammar_rule, at(r.span)])
    };
    if (stage === "symbols") return {
      headers: ["Name", "Type", "Binding", "Scope", "Storage"],
      rows: data.map(s => [s.name, s.storage === "function" ? `(${s.params.join(", ")}) → ${s.type}` : s.type,
        s.mutable ? "variable" : s.storage === "function" ? "function" : "constant", s.scope,
        `${s.storage} ${s.slot}`])
    };
    return null;
  }
  return Object.freeze({readDraft, saveDraft, sourceRange, tableData, valueText});
})();
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
if (typeof module !== "undefined" && module.exports) module.exports = {...PolyglotHighlight, Workspace: PolyglotWorkspace};
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
let revision = 0, draftTimer, initialized = false, baselineSource = "", baselineFilename = "program.poly";
let selectedExample = "", rawStage = false, draftNeedsSave = false, draftSaved = true;
function saveDraftNow() {
  clearTimeout(draftTimer);
  if (!draftNeedsSave) return draftSaved;
  let saved = false;
  try { saved = PolyglotWorkspace.saveDraft(localStorage, editor.value, $("filename").value); } catch { /* Storage may be disabled. */ }
  draftSaved = saved;
  if (saved) draftNeedsSave = false;
  $("draft-status").textContent = saved ? "Draft saved on this browser" : "Draft not saved · use Save source";
  return saved;
}
function scheduleDraft() {
  draftNeedsSave = true;
  $("draft-status").textContent = "Saving draft…";
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 250);
}
function hasEdits() { return editor.value !== baselineSource || $("filename").value !== baselineFilename; }
let pendingReplacement = null;
function finishReplacement(replace) {
  $("replace-source-dialog").hidden = true;
  const resolve = pendingReplacement; pendingReplacement = null;
  if (resolve) resolve(replace);
}
function canReplaceSource() {
  if (!hasEdits()) return Promise.resolve(true);
  if (pendingReplacement) finishReplacement(false);
  return new Promise(resolve => {
    pendingReplacement = resolve;
    $("replace-source-dialog").hidden = false;
    $("keep-source").focus();
  });
}
$("keep-source").addEventListener("click", () => finishReplacement(false));
$("replace-source").addEventListener("click", () => finishReplacement(true));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && pendingReplacement) { event.preventDefault(); finishReplacement(false); }
});
function loadSource(source, filename) {
  editor.value = source;
  $("filename").value = filename;
  baselineSource = source; baselineFilename = filename;
  initialized = true;
  dirty();
}
window.addEventListener("pagehide", () => { if (initialized) saveDraftNow(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && initialized) saveDraftNow(); });
window.addEventListener("beforeunload", event => {
  if (initialized && !saveDraftNow() && hasEdits()) { event.preventDefault(); event.returnValue = ""; }
});
$("filename").addEventListener("input", dirty);
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
  for (const id of ["status", "workspace-status"]) {
    $(id).textContent = text;
    $(id).dataset.state = state;
  }
}

const workbench = $("workbench"), resizer = $("output-resizer"), maximizeButton = $("maximize-editor");
let maximized = false, outputHeight = 220, workspaceScroll = 0, resizeDrag = null;
function outputBounds() {
  const available = Math.max(0, workbench.clientHeight - workbench.querySelector(".toolbar").offsetHeight - resizer.offsetHeight);
  // Keep both panes usable, including short landscape viewports.
  const min = Math.min(96, Math.floor(available / 2));
  const max = Math.max(min, available - Math.min(120, Math.floor(available / 2)));
  return {min, max};
}
function resizeOutput(height) {
  if (!maximized) return;
  const {min, max} = outputBounds();
  outputHeight = Math.round(Math.max(min, Math.min(max, height)));
  workbench.style.setProperty("--output-height", `${outputHeight}px`);
  resizer.setAttribute("aria-valuemin", String(min));
  resizer.setAttribute("aria-valuemax", String(max));
  resizer.setAttribute("aria-valuenow", String(outputHeight));
  resizer.setAttribute("aria-valuetext", `Output height ${outputHeight} pixels`);
}
function finishOutputResize(event) {
  if (resizeDrag && event?.pointerId !== undefined && event.pointerId !== resizeDrag.pointerId) return;
  const drag = resizeDrag;
  resizeDrag = null;
  document.body.classList.remove("resizing-output");
  if (drag && resizer.hasPointerCapture(drag.pointerId)) resizer.releasePointerCapture(drag.pointerId);
}
function setMaximized(next) {
  finishOutputResize();
  if (next) workspaceScroll = window.scrollY;
  maximized = next;
  document.body.classList.toggle("editor-maximized", next);
  resizer.hidden = !next;
  $("resize-help").hidden = !next;
  const label = next ? "Restore editor" : "Maximize editor";
  maximizeButton.setAttribute("aria-label", label);
  maximizeButton.setAttribute("title", next ? "Restore editor (Esc)" : label);
  maximizeButton.setAttribute("aria-pressed", String(next));
  $("maximize-icon").setAttribute("href", next ? "#ph-arrows-in" : "#ph-arrows-out");
  if (next) resizeOutput(outputHeight);
  else window.scrollTo(0, workspaceScroll);
  // Reuse the same textarea, preserving source, selection and native undo history.
  editor.focus({preventScroll: true});
  updateEditor();
}
maximizeButton.addEventListener("click", () => setMaximized(!maximized));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && maximized && !event.isComposing) {
    event.preventDefault(); setMaximized(false);
    maximizeButton.focus({preventScroll: true});
  }
});
resizer.addEventListener("pointerdown", event => {
  if (!maximized || event.button !== 0 || resizeDrag) return;
  event.preventDefault();
  resizer.focus({preventScroll: true});
  resizeDrag = {pointerId: event.pointerId, y: event.clientY, height: outputHeight};
  resizer.setPointerCapture(event.pointerId);
  document.body.classList.add("resizing-output");
});
resizer.addEventListener("pointermove", event => {
  if (resizeDrag?.pointerId === event.pointerId) resizeOutput(resizeDrag.height + resizeDrag.y - event.clientY);
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) resizer.addEventListener(name, finishOutputResize);
window.addEventListener("blur", finishOutputResize);
resizer.addEventListener("keydown", event => {
  const {min, max} = outputBounds();
  const increment = event.shiftKey ? 48 : 16;
  const height = {ArrowUp: outputHeight + increment, ArrowDown: outputHeight - increment, Home: min, End: max}[event.key];
  if (height !== undefined) { event.preventDefault(); resizeOutput(height); }
});
if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => resizeOutput(outputHeight)).observe(workbench);
window.addEventListener("resize", () => { finishOutputResize(); resizeOutput(outputHeight); });

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
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function renderTable(parent, headers, rows) {
  const table = element("table", undefined, "stage-table");
  const caption = element("caption", `${rows.length.toLocaleString()} ${rows.length === 1 ? "entry" : "entries"}`);
  table.append(caption);
  const head = element("thead"), heading = element("tr"), body = element("tbody");
  headers.forEach(label => { const cell = element("th", label); cell.scope = "col"; heading.append(cell); });
  head.append(heading); table.append(head, body); parent.append(table);
  let shown = 0;
  const more = element("button", "Show more", "stage-more");
  const appendPage = () => {
    const end = Math.min(shown + 200, rows.length);
    for (; shown < end; shown++) {
      const row = element("tr");
      rows[shown].forEach(value => row.append(element("td", PolyglotWorkspace.valueText(value))));
      body.append(row);
    }
    more.textContent = `Show next ${Math.min(200, rows.length - shown)} (${shown} of ${rows.length})`;
    more.hidden = shown >= rows.length;
  };
  more.addEventListener("click", appendPage); parent.append(more); appendPage();
}
function renderTree(parent, key, value, depth = 0) {
  if (value === null || typeof value !== "object") {
    parent.append(element("div", `${key}: ${PolyglotWorkspace.valueText(value)}`, "tree-value")); return;
  }
  const details = element("details", undefined, "tree-node");
  const label = value.kind || (Array.isArray(value) ? `${value.length} items` : "fields");
  details.append(element("summary", `${key} · ${label}${value.meta?.type ? ` : ${value.meta.type}` : ""}`));
  const children = element("div", undefined, "tree-children"); details.append(children); parent.append(details);
  let populated = false;
  const populate = () => {
    if (populated || !details.open) return;
    populated = true;
    const entries = Object.entries(value);
    let shown = 0;
    const more = element("button", "Show more", "stage-more");
    const page = () => {
      const end = Math.min(shown + 100, entries.length);
      for (; shown < end; shown++) renderTree(children, ...entries[shown], depth + 1);
      more.hidden = shown >= entries.length;
      children.append(more);
    };
    more.addEventListener("click", page); page();
  };
  details.addEventListener("toggle", populate);
  if ((depth < 2 && !["span", "meta"].includes(key)) || (key === "body" && depth < 3)) { details.open = true; populate(); }
}
function renderStage(parent, stage, data) {
  const table = PolyglotWorkspace.tableData(stage, data);
  if (table) { renderTable(parent, table.headers, table.rows); return; }
  if (stage === "ast") { renderTree(parent, "Program", data); return; }
  if (stage === "ir" || stage === "bytecode") {
    const functions = stage === "ir" ? data : data.functions;
    if (stage === "bytecode") {
      parent.append(element("p", `Bytecode v${data.version} · entry ${data.entry} · ${data.global_count} global slots`, "stage-explanation"));
      const constants = element("details", undefined, "tree-node");
      constants.append(element("summary", `Constants · ${data.constants.length}`));
      let loaded = false;
      constants.addEventListener("toggle", () => {
        if (!constants.open || loaded) return;
        loaded = true;
        renderTable(constants, ["Index", "Type", "Value"], data.constants.map((c, i) => [i, c.type, JSON.stringify(c.value)]));
      });
      parent.append(constants);
    }
    for (const fn of functions) {
      const details = element("details", undefined, "function-view");
      details.append(element("summary", `${fn.name}(${fn.params.join(", ")}) → ${fn.return_type}`));
      let loaded = false;
      const populate = () => {
        if (loaded || !details.open) return;
        loaded = true;
        const instructions = stage === "ir" ? fn.instructions : fn.code;
        const rows = instructions.map((instruction, i) => [i, instruction.op,
          stage === "ir" ? Object.entries(instruction).filter(([k]) => !["op", "source"].includes(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" · ") : instruction.args.map(PolyglotWorkspace.valueText).join(", "),
          instruction.source ? `${instruction.source.line}:${instruction.source.column}` : "—"]);
        renderTable(details, ["#", "Instruction", "Operands", "Position"], rows);
      };
      details.addEventListener("toggle", populate); parent.append(details);
      if (fn === functions[0]) { details.open = true; populate(); }
    }
  }
}
function showStage() {
  const available = stages[selectedStage] !== undefined;
  const compiled = Object.keys(stages).length > 0;
  const panel = $("stage-data"); panel.replaceChildren();
  panel.dataset.raw = String(rawStage);
  if (available) {
    if (rawStage) panel.append(element("pre", JSON.stringify(stages[selectedStage], null, 2), "stage-json"));
    else renderStage(panel, selectedStage, stages[selectedStage]);
  } else panel.textContent = compiled ? "This stage is not available. Fix the reported error to continue." : "Check or run a program to inspect its stages.";
  panel.dataset.empty = String(!available);
  panel.setAttribute("aria-labelledby", `tab-${selectedStage}`);
  $("stage-title").textContent = stageTitles[selectedStage];
  $("stage-state").textContent = available ? "Available" : compiled ? "Not available" : "Awaiting compilation";
  $("stage-format").disabled = !available;
  $("stage-format").textContent = rawStage ? "Readable view" : "Raw JSON";
  $("stage-format").setAttribute("aria-pressed", String(rawStage));
}
$("stage-format").addEventListener("click", () => { rawStage = !rawStage; showStage(); });
function dirty() {
  initialized = true; revision++;
  sourcePane.classList.remove("compiler-error");
  $("diagnostics").replaceChildren();
  $("execution-info").textContent = "";
  stages = {};
  showStage();
  setStatus("Source changed", "changed");
  updateEditor();
  scheduleDraft();
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
  const sourceAtStart = editor.value, filenameAtStart = $("filename").value, revisionAtStart = revision;
  try {
    const response = await fetch(`/api/${operation}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({source:sourceAtStart, filename:filenameAtStart, ...extra})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    stages = revisionAtStart === revision ? result.stages || {} : {};
    sourcePane.classList.toggle("compiler-error", operation !== "exec" && revisionAtStart === revision && !result.ok);
    showStage();
    setStatus(revisionAtStart !== revision ? "Source changed during compilation" : result.ok ? "Successful" : "Stopped with an error",
      revisionAtStart !== revision ? "changed" : result.ok ? "success" : "error");
    $("output").textContent = result.output || (result.ok ? operation === "run" || operation === "exec" ? "Program finished with no output." : "Compilation successful." : "Execution stopped.");
    $("output").dataset.empty = String(!result.output);
    $("execution-info").textContent = result.steps ? `${result.steps.toLocaleString()} VM instructions` : "";
    for (const d of revisionAtStart === revision ? result.diagnostics || [] : []) {
      const item = document.createElement("button");
      item.className = "diagnostic";
      item.textContent = diagnosticText(d);
      item.disabled = operation === "exec";
      item.addEventListener("click", () => {
        if (operation === "exec" || revisionAtStart !== revision) return;
        const range = PolyglotWorkspace.sourceRange(editor.value, d.location);
        editor.focus(); editor.setSelectionRange(range.start, range.end);
        editor.scrollTop = Math.max(0, (range.line - 3) * 24); updateEditor();
      });
      $("diagnostics").append(item);
    }
    if (operation === "build" && result.ok) download(result.artifact_text, filenameAtStart.replace(/\.[^.]*$/, "") + ".pbc", "application/json");
  } catch (error) {
    setStatus("Connection error", "error");
    $("output").textContent = error.message;
    $("output").dataset.empty = "false";
  } finally {
    workbench.querySelector(".console-content").scrollTop = 0;
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
$("download-source").addEventListener("click", () => {
  download(editor.value, $("filename").value || "program.poly");
  baselineSource = editor.value; baselineFilename = $("filename").value;
  saveDraftNow();
});
$("source-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 131072) { setStatus("Source exceeds 128 KiB", "error"); return; }
  const source = await file.text();
  event.target.value = "";
  if (await canReplaceSource()) loadSource(source, file.name);
});
$("artifact-file").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 5000000) { setStatus("Artifact exceeds 5 MB", "error"); return; }
  await action("exec", {artifact:await file.text(), filename:file.name}); event.target.value = "";
});
$("examples").addEventListener("change", async () => {
  const requestedExample = $("examples").value;
  if (!await canReplaceSource()) { $("examples").value = selectedExample; return; }
  selectedExample = requestedExample; $("examples").value = requestedExample;
  loadSource(examples[selectedExample], selectedExample);
});
let restored = null;
try { restored = PolyglotWorkspace.readDraft(localStorage); } catch { /* The editor works without storage. */ }
if (restored) {
  editor.value = restored.source; $("filename").value = restored.filename;
  initialized = true;
  // Restored work is treated as edited until downloaded or explicitly replaced.
  baselineSource = ""; baselineFilename = "";
  updateEditor();
  $("draft-status").textContent = "Draft restored from this browser";
  setStatus("Draft restored", "ready");
}
fetch("/api/examples").then(r => { if (!r.ok) throw new Error("Examples could not be loaded."); return r.json(); }).then(data => {
  examples = data;
  for (const name of Object.keys(data)) { const option = document.createElement("option"); option.value = name; option.textContent = name; $("examples").append(option); }
  if (!initialized) {
    const first = Object.keys(data)[0];
    if (first) { loadSource(data[first], first); selectedExample = first; setStatus("Ready"); }
  } else {
    $("examples").selectedIndex = -1;
    if (Object.hasOwn(examples, $("filename").value) && editor.value === examples[$("filename").value]) {
      selectedExample = $("filename").value; $("examples").value = selectedExample;
      baselineSource = editor.value; baselineFilename = selectedExample;
    }
  }
}).catch(error => { setStatus(error.message, "error"); });
showStage();
}
