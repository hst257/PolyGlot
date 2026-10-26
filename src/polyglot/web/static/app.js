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
    const endLine = Math.max(line, Math.min(lines.length, location.end_line || line));
    const endColumn = endLine === line ? Math.max(column + 1, (location.end_column || column + 2) - 1) : Math.max(0, (location.end_column || 1) - 1);
    const endOffset = lines.slice(0, endLine - 1).reduce((n, value) => n + value.length + 1, 0);
    const end = endOffset + Array.from(lines[endLine - 1]).slice(0, endColumn).join("").length;
    return {start, end: Math.max(start, end), line};
  }
  const valueText = value => typeof value === "string" ? value : JSON.stringify(value) ?? "—";
  const at = location => location ? `${location.line}:${location.column}` : "—";
  function tableData(stage, data) {
    if (stage === "tokens") return {
      headers: ["Token", "Text", "Position"],
      locations: data.map(t => t.span),
      rows: data.map(t => [t.kind, JSON.stringify(t.text), at(t.span)])
    };
    if (stage === "recognition") return {
      headers: ["Syntax", "Rule", "AST node", "Position"],
      locations: data.map(r => r.span),
      rows: data.map(r => [r.candidates?.length ? r.candidates.join(" / ") : r.family,
        r.grammar_rule, r.kind || "—", at(r.span)])
    };
    if (stage === "symbols") return {
      headers: ["Name", "Type", "Binding", "Scope", "Storage", "Source"],
      locations: data.map(s => s.location),
      rows: data.map(s => [s.name, s.storage === "function" ? `(${s.params.join(", ")}) → ${s.type}` : s.type,
        s.mutable ? "variable" : s.storage === "function" ? "function" : "constant", s.scope,
        `${s.storage} ${s.slot}`, at(s.location)])
    };
    return null;
  }
  function astIndex(root) {
    const nodes = [], pending = [{node: root, parent: null, field: ""}], visited = new WeakSet();
    while (pending.length) {
      const item = pending.pop(), node = item.node;
      if (!node || typeof node !== "object" || typeof node.kind !== "string" || !node.data || visited.has(node)) continue;
      visited.add(node);
      const id = nodes.length, entry = {id, node, parent: item.parent, field: item.field, children: []};
      nodes.push(entry);
      if (item.parent !== null) nodes[item.parent].children.push(id);
      const children = [], fields = Object.entries(node.data).reverse().map(([field, value]) => ({field, value}));
      while (fields.length) {
        const {field, value} = fields.pop();
        if (!value || typeof value !== "object") continue;
        if (typeof value.kind === "string" && value.data) { children.push({node: value, parent: id, field}); continue; }
        const entries = Array.isArray(value) ? value.map((v, i) => [`${field}[${i}]`, v]) :
          Object.entries(value).filter(([key]) => !["span", "meta", "binding"].includes(key)).map(([key, v]) => [`${field}.${key}`, v]);
        for (let i = entries.length - 1; i >= 0; i--) fields.push({field: entries[i][0], value: entries[i][1]});
      }
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
    }
    for (let i = nodes.length - 1; i >= 0; i--) nodes[i].size = 1 + nodes[i].children.reduce((sum, child) => sum + nodes[child].size, 0);
    return nodes;
  }
  function astLabel(node) {
    const data = node.data || {};
    if (node.kind === "Literal") return JSON.stringify(data.value);
    return String(data.name ?? data.op ?? (node.kind === "Program" ? "Whole program" : node.kind === "Block" ? "Statements" : node.kind));
  }
  function astLayout(index, root, expanded, vertical = false, limit = 250) {
    if (!index[root]) return {nodes: [], edges: [], width: 0, height: 0, truncated: false};
    const nodes = [], pending = [{id: root, depth: 0, parent: null}];
    while (pending.length && nodes.length < limit) {
      const item = pending.pop(), position = nodes.length;
      nodes.push({...item, children: [], span: 1});
      if (item.parent !== null) nodes[item.parent].children.push(position);
      if (expanded.has(item.id)) {
        const children = index[item.id].children;
        for (let i = children.length - 1; i >= 0; i--) pending.push({id: children[i], depth: item.depth + 1, parent: position});
      }
    }
    const truncated = pending.length > 0;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].children.length) nodes[i].span = nodes[i].children.reduce((sum, child) => sum + nodes[child].span, 0);
    }
    nodes[0].offset = 0;
    const cardWidth = 164, cardHeight = 72, padding = 24;
    for (const node of nodes) {
      const center = node.offset + (node.span - 1) / 2;
      node.x = padding + (vertical ? center * 192 : node.depth * 236);
      node.y = padding + (vertical ? node.depth * 140 : center * 100);
      let offset = node.offset;
      for (const child of node.children) { nodes[child].offset = offset; offset += nodes[child].span; }
    }
    const edges = nodes.filter(n => n.parent !== null).map(n => ({from: nodes[n.parent].id, to: n.id}));
    return {nodes, edges, cardWidth, cardHeight, width: Math.max(...nodes.map(n => n.x)) + cardWidth + padding,
      height: Math.max(...nodes.map(n => n.y)) + cardHeight + padding, truncated};
  }
  const phaseOrder = ["tokens", "recognition", "ast", "symbols", "ir", "bytecode", "execution"];
  function pipelineStatus(stages, report) {
    const count = (n, unit) => `${n.toLocaleString()} ${unit}`;
    const metrics = {
      tokens: () => count(stages.tokens.length, "tokens"),
      recognition: () => count(stages.recognition.length, "constructs"),
      ast: () => count(astIndex(stages.ast).length, "nodes"),
      symbols: () => count(stages.symbols.length, "bindings"),
      ir: () => count(stages.ir.reduce((n, fn) => n + fn.instructions.length, 0), "operations"),
      bytecode: () => count(stages.bytecode.functions.reduce((n, fn) => n + fn.code.length, 0), "instructions")
    };
    const code = report?.diagnostics?.[0]?.code || "";
    let failed = null;
    if (report && !report.ok) {
      if (/^L/.test(code) && !stages.tokens) failed = "tokens";
      else if (/^P/.test(code) && !stages.ast) failed = "ast";
      else if (/^S/.test(code) && !stages.symbols) failed = "symbols";
      else if (/^R/.test(code) && stages.bytecode) failed = "execution";
      else if (code === "C002") failed = "bytecode";
    }
    return Object.fromEntries(phaseOrder.map(stage => {
      if (stage === failed) return [stage, {state: "failed", text: `Stopped · ${code}`}];
      if (stages[stage] !== undefined) return [stage, {state: "ready", text: metrics[stage]()}];
      if (stage === "execution" && stages.bytecode && report?.ok) return [stage,
        ["run", "exec"].includes(report.operation) ? {state: "ready", text: count(report.steps || 0, "steps run")} : {state: "waiting", text: "Not run"}];
      if (report?.operation === "exec") return [stage, {state: "unavailable", text: "Source not loaded"}];
      // Recognition is only published after the entire parser succeeds.
      if (stage === "recognition" && failed === "ast") return [stage, {state: "blocked", text: "Parser incomplete"}];
      if (failed && phaseOrder.indexOf(stage) > phaseOrder.indexOf(failed)) return [stage, {state: "blocked", text: "Blocked"}];
      return [stage, {state: report ? "unavailable" : "waiting", text: report ? "Unavailable" : "Not compiled"}];
    }));
  }
  function irText(i, functions = []) {
    const t = n => `t${n}`, args = (i.args || []).map(t).join(", ");
    const assign = value => `${t(i.dest)} = ${value}${i.type ? ` : ${i.type}` : ""}`;
    const slot = `${i.storage}[${i.slot}]`;
    switch (i.op) {
      case "CONST": return assign(JSON.stringify(i.value));
      case "LOAD": return assign(slot);
      case "STORE": return `${slot} = ${t(i.value)}`;
      case "MOVE": return assign(t(i.value));
      case "BINARY": return assign(`${t(i.left)} ${i.operator} ${t(i.right)}`);
      case "UNARY": return assign(`${i.operator} ${t(i.value)}`);
      case "WIDEN": return assign(`float(${t(i.value)})`);
      case "FORMAT": return assign(`format(${JSON.stringify(i.specifier)}, ${t(i.value)})`);
      case "LABEL": return `${i.label}:`;
      case "JUMP": return `goto ${i.target}`;
      case "BRANCH": return `if ${t(i.condition)} goto ${i.true} else ${i.false}`;
      case "CALL": {
        const call = `call ${functions.find(fn => fn.id === i.function)?.name ?? `fn[${i.function}]`}(${args})`;
        return i.dest === null ? call : assign(call);
      }
      case "RETURN_VALUE": return `return ${t(i.value)}`;
      case "RETURN_VOID": return "return";
      case "OUTPUT": return `output(${args}; sep=${JSON.stringify(i.separator)}, end=${JSON.stringify(i.ending)})`;
      case "ARRAY_BUILD": return assign(`[${args}]`);
      case "ARRAY_NEW": return assign(`new ${i.element_type}[${t(i.size)}]`);
      case "ARRAY_GET": return assign(`${t(i.array)}[${t(i.index)}]`);
      case "ARRAY_SET": return `${t(i.array)}[${t(i.index)}] = ${t(i.value)}`;
      case "ARRAY_LENGTH": return assign(`len(${t(i.array)})`);
      case "ARRAY_CHECK": return `check_bounds ${t(i.array)}[${t(i.index)}]`;
      case "ARRAY_SIZE_CHECK": return `check_size ${t(i.array)}, ${t(i.size)}`;
      case "ASSERT": return `assert ${t(i.condition)}, ${i.code}, ${JSON.stringify(i.message)}`;
      case "TRAP": return `trap ${i.code}, ${JSON.stringify(i.message)}`;
      default: return `${i.op} ${Object.entries(i).filter(([k]) => !["op", "source"].includes(k)).map(([k,v]) => `${k}=${valueText(v)}`).join(", ")}`;
    }
  }
  function bytecodeMeaning(i, artifact) {
    const a = i.args, quoted = value => JSON.stringify(value);
    switch (i.op) {
      case "CONST": return `Push ${quoted(artifact.constants[a[0]]?.value)} from constant #${a[0]}.`;
      case "LOAD_LOCAL": case "LOAD_GLOBAL": return `Push ${i.op === "LOAD_LOCAL" ? "local" : "global"} slot ${a[0]}.`;
      case "STORE_LOCAL": case "STORE_GLOBAL": return `Pop a value into ${i.op === "STORE_LOCAL" ? "local" : "global"} slot ${a[0]}.`;
      case "BINARY": return `Pop right, then left; push left ${a[0]} right.`;
      case "UNARY": return `Pop a value; apply ${a[0]}; push the result.`;
      case "JUMP": return `Continue at instruction #${a[0]} in this function.`;
      case "JUMP_IF_FALSE": return `Pop a Boolean; jump to #${a[0]} if false.`;
      case "CALL": return `Call ${artifact.functions.find(fn => fn.id === a[0])?.name ?? `function #${a[0]}`} with ${a[1]} stack arguments.`;
      case "RETURN_VALUE": return "Pop the return value; restore the caller’s frame and push the value.";
      case "RETURN_VOID": return "Return to the caller without a value; the entry frame finishes execution.";
      case "OUTPUT": return `Pop ${a[0]} values; print in source order with separator ${quoted(a[1])} and ending ${quoted(a[2])}.`;
      case "FORMAT": return `Pop a value; push its ${a[0]} formatted string.`;
      case "ARRAY_BUILD": return `Pop ${a[1]} values; push a ${a[0]} array.`;
      case "ARRAY_NEW": return `Pop a length; allocate a ${a[0]} array with default values.`;
      case "ARRAY_GET": return "Pop index and array; check bounds and push the element.";
      case "ARRAY_SET": return "Pop value, index and array; check bounds and store the element.";
      case "ARRAY_CHECK": return "Pop index and array; validate the index before assignment.";
      case "ARRAY_LENGTH": return "Pop an array; push its length.";
      case "ARRAY_SIZE_CHECK": return "Pop declared size and array; check their lengths match.";
      case "ASSERT": return `Pop a Boolean; stop with ${a[0]} if false: ${a[1]}`;
      case "TRAP": return `Stop with ${a[0]}: ${a[1]}`;
      case "POP": return "Discard the top stack value.";
      default: return "See the raw instruction and its operands.";
    }
  }
  return Object.freeze({readDraft, saveDraft, sourceRange, tableData, valueText, astIndex, astLabel, astLayout,
    phaseOrder, pipelineStatus, irText, bytecodeMeaning});
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
let stages = {}, selectedStage = "recognition", busy = false, examples = {}, inspectionMatchesSource = false;
let compilationReport = null, coursework = null;
let graphCleanup = null, astPresentation = "diagram";
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
  renderFileList();
  if (compactLayout()) setSidebar(true);
}
window.addEventListener("pagehide", () => { if (initialized) saveDraftNow(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && initialized) saveDraftNow(); });
window.addEventListener("beforeunload", event => {
  if (initialized && !saveDraftNow() && hasEdits()) { event.preventDefault(); event.returnValue = ""; }
});
$("filename").addEventListener("input", dirty);
const stageTitles = {recognition: "Syntax recognition", tokens: "Lexer tokens", ast: "Abstract syntax tree",
  symbols: "Symbols and types", ir: "Typed intermediate representation", bytecode: "VM bytecode", execution: "Virtual machine execution"};
const stageDescriptions = {
  recognition: "See which syntax each statement uses before it becomes one shared language.",
  tokens: "The lexer separates your source into names, values, operators and punctuation.",
  ast: "Explore the structure of your program, with syntax differences normalized away.",
  symbols: "See each name, its checked type and the scope where it belongs.",
  ir: "Follow typed operations and explicit control flow before bytecode generation.",
  bytecode: "Inspect the validated stack instructions executed by Polyglot’s virtual machine.",
  execution: "Run generated bytecode on Polyglot’s bounded stack machine and inspect its real output."
};
const phaseGuides = {
  tokens: ["Source characters → token stream", "The lexer is shared by every syntax family. NEWLINE tokens preserve layout; EOF marks the end of input."],
  recognition: ["Tokens → syntax-family dispatch", "Recognition and AST construction happen in the same parser pass. Shared C-style constructs retain candidate families instead of guessing a language."],
  ast: ["Tokens + block layout → shared AST", "An AST shows program structure, not every grammar rule. Different output spellings normalize into shared nodes; successful semantic analysis annotates them with types."],
  symbols: ["AST → checked names, types and scopes", "Every syntax family uses the same symbol table. Scope numbers distinguish bindings; storage slots describe where values will live."],
  ir: ["Checked AST → typed three-address code", "t0, t1, … are compiler temporaries within each function. Loops become labels, branches and jumps; explicit widening converts int values to float."],
  bytecode: ["Typed IR → validated stack bytecode", "Temporaries become local slots. Instructions push and pop values; jump targets are instruction offsets within a function. This is Polyglot VM code."],
  execution: ["Validated bytecode → output", "Execution creates call frames and an operand stack. Instruction, call-depth, output and time limits bound the run. This view is a run summary, not a live execution trace."]
};
const demoCases = {
  "p1_mixed.poly": {stage: "recognition", purpose: "Trace six syntax families into one program. Then inspect the shared Output nodes and generated instructions."},
  "mixed_nesting.poly": {stage: "ast", purpose: "Follow a braced loop containing indented branches. The real program prints 22."},
  "arrays_mixed.poly": {stage: "ir", purpose: "Pass an array into a shared function. Find indexing and bounds checks in the IR, then compare the VM instructions."},
  "error_type.poly": {stage: "symbols", purpose: "Show a semantic type error: parsing succeeds, but no executable bytecode is produced. Select the diagnostic to locate it."}
};
function updateDemoPurpose() { $("demo-purpose").textContent = demoCases[$("demo-case").value].purpose; }
$("demo-case").addEventListener("change", updateDemoPurpose);
$("load-demo").addEventListener("click", async () => {
  if (busy) return;
  const name = $("demo-case").value;
  if (!Object.hasOwn(examples, name) || !await canReplaceSource() || busy) return;
  selectedExample = name; $("examples").value = name;
  loadSource(examples[name], name);
  rawStage = false; selectStage($("tab-" + demoCases[name].stage));
  $("phase-guide").open = true;
  await action("run");
});
updateDemoPurpose();
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
const workspace = $("workspace"), inspectorResizer = $("workspace-resizer");
let maximized = false, outputHeight = 190, workspaceScroll = 0, resizeDrag = null, inspectorDrag = null;
let inspectorWidth = Math.min(600, Math.max(380, Math.round(window.innerWidth * .32))), sidebarCollapsed = false;
function compactLayout() { return window.matchMedia("(max-width: 1000px)").matches; }
function saveLayout() {
  try { localStorage.setItem("polyglot-layout-v1", JSON.stringify({inspectorWidth, outputHeight, sidebarCollapsed})); } catch { /* Layout remains usable without storage. */ }
}
function setSidebar(collapsed, persist = false) {
  sidebarCollapsed = collapsed;
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  const sidebar = $("program-sidebar");
  if (collapsed && sidebar.contains(document.activeElement)) $("sidebar-toggle").focus();
  sidebar.hidden = collapsed;
  $("sidebar-backdrop").hidden = collapsed || !compactLayout();
  $("sidebar-toggle").setAttribute("aria-expanded", String(!collapsed));
  $("sidebar-toggle").setAttribute("aria-label", collapsed ? "Show programs" : "Hide programs");
  resizeInspector(inspectorWidth);
  if (persist) saveLayout();
}
function inspectorBounds() {
  const width = workspace.clientWidth || window.innerWidth;
  const sidebar = sidebarCollapsed ? 0 : (width <= 1300 ? 200 : 216);
  const max = Math.max(300, Math.min(850, width - sidebar - 8 - 400));
  return {min: Math.min(340, max), max};
}
function resizeInspector(width) {
  if (compactLayout()) return;
  const bounds = inspectorBounds();
  inspectorWidth = Math.round(Math.max(bounds.min, Math.min(bounds.max, width)));
  workspace.style.setProperty("--inspector-width", `${inspectorWidth}px`);
  inspectorResizer.setAttribute("aria-valuemin", String(bounds.min));
  inspectorResizer.setAttribute("aria-valuemax", String(bounds.max));
  inspectorResizer.setAttribute("aria-valuenow", String(inspectorWidth));
  inspectorResizer.setAttribute("aria-valuetext", `Compiler inspector ${inspectorWidth} pixels wide`);
}
function outputBounds() {
  const available = Math.max(0, workbench.clientHeight - workbench.querySelector(".toolbar").offsetHeight - resizer.offsetHeight - (maximized ? 0 : $("editor-footer")?.offsetHeight || 0));
  const min = Math.min(96, Math.floor(available / 2));
  const max = Math.max(min, available - Math.min(140, Math.floor(available / 2)));
  return {min, max};
}
function resizeOutput(height) {
  // Layout-less DOM tests still retain the requested size for persistence checks.
  const bounds = workbench.clientHeight ? outputBounds() : {min: 96, max: 800};
  outputHeight = Math.round(Math.max(bounds.min, Math.min(bounds.max, height)));
  workbench.style.setProperty("--output-height", `${outputHeight}px`);
  resizer.setAttribute("aria-valuemin", String(bounds.min));
  resizer.setAttribute("aria-valuemax", String(bounds.max));
  resizer.setAttribute("aria-valuenow", String(outputHeight));
  resizer.setAttribute("aria-valuetext", `Output height ${outputHeight} pixels`);
}
function finishOutputResize(event) {
  if (resizeDrag && event?.pointerId !== undefined && event.pointerId !== resizeDrag.pointerId) return;
  const drag = resizeDrag; resizeDrag = null;
  document.body.classList.remove("resizing-output");
  if (drag && resizer.hasPointerCapture(drag.pointerId)) resizer.releasePointerCapture(drag.pointerId);
  if (drag) saveLayout();
}
function finishInspectorResize(event) {
  if (inspectorDrag && event?.pointerId !== undefined && event.pointerId !== inspectorDrag.pointerId) return;
  const drag = inspectorDrag; inspectorDrag = null;
  document.body.classList.remove("resizing-inspector");
  if (drag && inspectorResizer.hasPointerCapture(drag.pointerId)) inspectorResizer.releasePointerCapture(drag.pointerId);
  if (drag) saveLayout();
}
function setMaximized(next) {
  finishOutputResize(); finishInspectorResize();
  if (next) workspaceScroll = window.scrollY;
  maximized = next;
  document.body.classList.toggle("editor-maximized", next);
  const label = next ? "Restore editor" : "Maximize editor";
  maximizeButton.setAttribute("aria-label", label); maximizeButton.setAttribute("title", label);
  maximizeButton.setAttribute("aria-pressed", String(next));
  $("maximize-icon").setAttribute("href", next ? "#ph-arrows-in" : "#ph-arrows-out");
  resizeOutput(outputHeight);
  if (!next) window.scrollTo(0, workspaceScroll);
  editor.focus({preventScroll: true}); updateEditor();
}
$("sidebar-toggle").addEventListener("click", () => setSidebar(!sidebarCollapsed, true));
$("sidebar-backdrop").addEventListener("click", () => setSidebar(true, true));
maximizeButton.addEventListener("click", () => setMaximized(!maximized));
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || event.isComposing || pendingReplacement || document.body.classList.contains("ast-expanded")) return;
  if (maximized) { event.preventDefault(); setMaximized(false); maximizeButton.focus(); }
  else if (compactLayout() && !sidebarCollapsed) { event.preventDefault(); setSidebar(true); }
});
resizer.addEventListener("pointerdown", event => {
  if (event.button !== 0 || resizeDrag) return;
  event.preventDefault(); resizer.focus();
  resizeDrag = {pointerId: event.pointerId, y: event.clientY, height: outputHeight};
  resizer.setPointerCapture(event.pointerId); document.body.classList.add("resizing-output");
});
resizer.addEventListener("pointermove", event => {
  if (resizeDrag?.pointerId === event.pointerId) resizeOutput(resizeDrag.height + resizeDrag.y - event.clientY);
});
inspectorResizer.addEventListener("pointerdown", event => {
  if (event.button !== 0 || compactLayout() || inspectorDrag) return;
  event.preventDefault(); inspectorResizer.focus();
  inspectorDrag = {pointerId: event.pointerId, x: event.clientX, width: inspectorWidth};
  inspectorResizer.setPointerCapture(event.pointerId); document.body.classList.add("resizing-inspector");
});
inspectorResizer.addEventListener("pointermove", event => {
  if (inspectorDrag?.pointerId === event.pointerId) resizeInspector(inspectorDrag.width + inspectorDrag.x - event.clientX);
});
for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
  resizer.addEventListener(name, finishOutputResize); inspectorResizer.addEventListener(name, finishInspectorResize);
}
window.addEventListener("blur", () => { finishOutputResize(); finishInspectorResize(); });
resizer.addEventListener("keydown", event => {
  const {min, max} = outputBounds(), step = event.shiftKey ? 48 : 16;
  const value = {ArrowUp: outputHeight + step, ArrowDown: outputHeight - step, Home: min, End: max}[event.key];
  if (value !== undefined) { event.preventDefault(); resizeOutput(value); saveLayout(); }
});
inspectorResizer.addEventListener("keydown", event => {
  const {min, max} = inspectorBounds(), step = event.shiftKey ? 64 : 24;
  const value = {ArrowLeft: inspectorWidth + step, ArrowRight: inspectorWidth - step, Home: min, End: max}[event.key];
  if (value !== undefined) { event.preventDefault(); resizeInspector(value); saveLayout(); }
});
try {
  const layout = JSON.parse(localStorage.getItem("polyglot-layout-v1"));
  if (Number.isFinite(layout?.inspectorWidth)) inspectorWidth = layout.inspectorWidth;
  if (Number.isFinite(layout?.outputHeight)) outputHeight = layout.outputHeight;
  sidebarCollapsed = layout?.sidebarCollapsed === true;
} catch { /* Defaults are used if storage is unavailable or corrupted. */ }
setSidebar(compactLayout() || sidebarCollapsed); resizeOutput(outputHeight);
if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => resizeOutput(outputHeight)).observe(workbench);
let previousCompactLayout = compactLayout();
window.addEventListener("resize", () => {
  const compact = compactLayout();
  if (compact && !previousCompactLayout) setSidebar(true);
  previousCompactLayout = compact;
  finishOutputResize(); finishInspectorResize(); resizeOutput(outputHeight); resizeInspector(inspectorWidth);
  $("sidebar-backdrop").hidden = sidebarCollapsed || !compactLayout();
});
function renderFileList() {
  const list = $("file-list"), query = $("file-search").value.trim().toLowerCase();
  list.replaceChildren();
  const names = Object.keys(examples).filter(name => name.toLowerCase().includes(query));
  $("file-count").textContent = names.length;
  for (const name of names) {
    const button = element("button", undefined, "file-entry");
    button.type = "button"; button.dataset.example = name; button.title = name;
    button.setAttribute("aria-current", String(name === $("filename").value));
    button.append(glyph("file-code"), element("span", name));
    button.addEventListener("click", () => { $("examples").value = name; $("examples").dispatchEvent(new Event("change")); });
    list.append(button);
  }
  if (!names.length) list.append(element("p", "No matching examples.", "file-empty"));
}
$("file-search").addEventListener("input", renderFileList);
$("clear-output").addEventListener("click", () => {
  $("output").textContent = "Output cleared. Run a program to start again."; $("output").dataset.empty = "true";
  $("output-count").textContent = "0"; $("diagnostics").replaceChildren(); $("execution-info").textContent = "";
});

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
  updateInspectionFocus();
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function glyph(name) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("icon"); icon.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#ph-${name}`); icon.append(use); return icon;
}
function navigateSource(location) {
  const range = PolyglotWorkspace.sourceRange(editor.value, location);
  editor.focus({preventScroll: true}); editor.setSelectionRange(range.start, range.end);
  editor.scrollTop = Math.max(0, (range.line - 3) * 24); updateEditor();
}
function attachSource(node, location) {
  if (!inspectionMatchesSource || !location || !Number.isFinite(location.line)) return;
  const range = PolyglotWorkspace.sourceRange(editor.value, location);
  node.dataset.sourceStart = range.start; node.dataset.sourceEnd = range.end;
}
function sourceLink(location, includeColumn = false) {
  const label = includeColumn ? `${location.line}:${location.column || 1}` : `L${location.line}`;
  if (!inspectionMatchesSource) return element("span", label, "source-location");
  const button = element("button", label, "source-link");
  button.type = "button";
  button.setAttribute("aria-label", `Go to source line ${location.line}, column ${location.column || 1}`);
  button.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); navigateSource(location); });
  return button;
}
function updateInspectionFocus() {
  const nodes = [...$("stage-data").querySelectorAll("[data-source-start]")].filter(node => {
    for (let child = node, parent = child.parentElement; parent; child = parent, parent = parent.parentElement) {
      if (parent.tagName === "DETAILS" && !parent.open && child.tagName !== "SUMMARY") return false;
    }
    return true;
  });
  const cursor = editor.selectionStart;
  let shortest = Infinity;
  for (const node of nodes) {
    node.classList.remove("source-match");
    const start = Number(node.dataset.sourceStart), end = Number(node.dataset.sourceEnd);
    if (cursor >= start && cursor < end) shortest = Math.min(shortest, end - start);
  }
  for (const node of nodes) {
    const start = Number(node.dataset.sourceStart), end = Number(node.dataset.sourceEnd);
    if (cursor >= start && cursor < end && end - start === shortest) node.classList.add("source-match");
  }
}
function renderTable(parent, headers, rows, locations = []) {
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
      const location = locations[shown]; attachSource(row, location);
      rows[shown].forEach((value, index) => {
        const cell = element("td", PolyglotWorkspace.valueText(value));
        if (location && index === rows[shown].length - 1) { cell.replaceChildren(sourceLink(location, true)); }
        row.append(cell);
      });
      body.append(row);
    }
    more.textContent = `Show next ${Math.min(200, rows.length - shown)} (${shown} of ${rows.length})`;
    more.hidden = shown >= rows.length;
    updateInspectionFocus();
  };
  more.addEventListener("click", appendPage); parent.append(more); appendPage();
}
function renderTree(parent, key, value, depth = 0) {
  if (value === null || typeof value !== "object") {
    parent.append(element("div", `${key}: ${PolyglotWorkspace.valueText(value)}`, "tree-value")); return;
  }
  if (value.kind && value.data) {
    const details = element("details", undefined, "tree-node ast-node"), summary = element("summary");
    summary.append(element("span", value.kind, "node-kind"));
    const name = value.data.name ?? value.data.op ?? (value.kind === "Literal" ? JSON.stringify(value.data.value) : "");
    if (name !== "") summary.append(element("span", ` ${name}`, "node-name"));
    if (value.meta?.type) summary.append(element("span", ` : ${value.meta.type}`, "node-type"));
    if (value.span?.line) summary.append(sourceLink(value.span));
    attachSource(summary, value.span); details.append(summary);
    const children = element("div", undefined, "tree-children"); details.append(children); parent.append(details);
    let loaded = false;
    const populate = () => {
      if (loaded || !details.open) return;
      loaded = true;
      for (const [name, field] of Object.entries(value.data)) {
        if (name === "name" || name === "op" || (value.kind === "Literal" && name === "value")) continue;
        renderTree(children, name, field, depth + 1);
      }
      if (!children.childNodes.length) children.append(element("div", "Leaf expression", "tree-value"));
      updateInspectionFocus();
    };
    details.addEventListener("toggle", populate);
    if (depth < 2) { details.open = true; populate(); }
    return;
  }
  const details = element("details", undefined, "tree-node");
  details.append(element("summary", `${key} · ${Array.isArray(value) ? `${value.length} items` : "details"}`));
  const children = element("div", undefined, "tree-children"); details.append(children); parent.append(details);
  let loaded = false;
  const populate = () => {
    if (loaded || !details.open) return;
    loaded = true;
    const entries = Object.entries(value); let shown = 0;
    const more = element("button", "Show more", "stage-more");
    const page = () => {
      const end = Math.min(shown + 100, entries.length);
      for (; shown < end; shown++) renderTree(children, ...entries[shown], depth + 1);
      more.hidden = shown >= entries.length; children.append(more); updateInspectionFocus();
    };
    more.addEventListener("click", page); page();
  };
  details.addEventListener("toggle", populate);
  if (depth < 2 || (key === "body" && depth < 3)) { details.open = true; populate(); }
}

function renderAstDiagram(parent, data) {
  const index = PolyglotWorkspace.astIndex(data);
  const controller = new AbortController();
  let root = 0, expanded = new Set([0]), vertical = false, zoom = 1, expandedView = false, layout, fitMode = "width", pan = null;
  const view = element("section", undefined, "ast-view"); view.setAttribute("aria-label", "Syntax tree diagram");
  const controls = element("div", undefined, "ast-controls");
  const focusLabel = element("label", "Focus", "ast-focus-label");
  const focus = element("select"); focus.setAttribute("aria-label", "Syntax tree focus");
  focusLabel.append(focus);
  for (const id of [0, ...(index[0]?.children || [])]) {
    const item = index[id], label = id === 0 ? "Whole program" : `${item.node.kind}${PolyglotWorkspace.astLabel(item.node) === item.node.kind ? "" : ` ${PolyglotWorkspace.astLabel(item.node)}`} · L${item.node.span?.line || 1}`;
    const option = element("option", label); option.value = String(id); focus.append(option);
  }
  const orientation = element("button", "Top to bottom", "ast-control"); orientation.setAttribute("aria-label", "Use top-to-bottom tree layout");
  const expand = element("button", "Expand all", "ast-control"), collapse = element("button", "Collapse all", "ast-control");
  const outline = element("button", "Outline", "ast-control");
  outline.addEventListener("click", () => { astPresentation = "outline"; showStage(); });
  const enlarge = element("button", "Expand view", "ast-control"); enlarge.setAttribute("aria-label", "Expand tree view"); enlarge.setAttribute("aria-pressed", "false");
  controls.append(focusLabel, orientation, expand, collapse, outline, enlarge);
  const viewport = element("div", undefined, "ast-viewport"); viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Syntax tree canvas. Scroll or drag the background to pan.");
  const canvas = element("div", undefined, "ast-canvas"), scene = element("div", undefined, "ast-scene");
  canvas.append(scene); viewport.append(canvas);
  const footer = element("div", undefined, "ast-toolbar"), count = element("span", "", "ast-count"); count.setAttribute("role", "status");
  const zoomOut = element("button", "−", "ast-control"); zoomOut.setAttribute("aria-label", "Zoom out syntax tree");
  const zoomIn = element("button", "+", "ast-control"); zoomIn.setAttribute("aria-label", "Zoom in syntax tree");
  const percent = element("span", "100%", "ast-zoom"); percent.setAttribute("aria-live", "polite");
  const fit = element("button", "Fit", "ast-control"); fit.setAttribute("aria-label", "Fit syntax tree to view");
  const reset = element("button", "100%", "ast-control"); reset.setAttribute("aria-label", "Reset syntax tree zoom");
  footer.append(count, zoomOut, percent, zoomIn, fit, reset);
  const hint = element("p", "Select a node to jump to source. Use its arrow to expand a branch.", "ast-hint");
  view.append(controls, viewport, footer, hint); parent.append(view);
  function svg(tag, attributes = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  }
  function applyZoom(value, center = true) {
    const old = zoom;
    zoom = Math.max(.25, Math.min(1.5, value));
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / old;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / old;
    scene.style.transform = `scale(${zoom})`;
    canvas.style.width = `${Math.max(viewport.clientWidth, layout.width * zoom)}px`;
    canvas.style.height = `${Math.max(viewport.clientHeight, layout.height * zoom)}px`;
    scene.style.left = `${Math.max(0, (viewport.clientWidth - layout.width * zoom) / 2)}px`;
    percent.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= .25; zoomIn.disabled = zoom >= 1.5;
    if (center) { viewport.scrollLeft = centerX * zoom - viewport.clientWidth / 2; viewport.scrollTop = centerY * zoom - viewport.clientHeight / 2; }
  }
  function fitGraph(mode = "all") {
    const width = viewport.clientWidth || 500, height = viewport.clientHeight || 400;
    applyZoom(Math.min(1, (width - 16) / layout.width, mode === "all" ? (height - 16) / layout.height : 1), false);
    viewport.scrollLeft = 0; viewport.scrollTop = 0;
  }
  function draw(focusId = null) {
    layout = PolyglotWorkspace.astLayout(index, root, expanded, vertical);
    scene.replaceChildren(); scene.style.width = `${layout.width}px`; scene.style.height = `${layout.height}px`;
    const edges = svg("svg", {class: "ast-edges", width: layout.width, height: layout.height, "aria-hidden": "true"});
    const positions = new Map(layout.nodes.map(n => [n.id, n]));
    for (const edge of layout.edges) {
      const a = positions.get(edge.from), b = positions.get(edge.to);
      const x1 = a.x + (vertical ? layout.cardWidth / 2 : layout.cardWidth), y1 = a.y + (vertical ? layout.cardHeight : layout.cardHeight / 2);
      const x2 = b.x + (vertical ? layout.cardWidth / 2 : 0), y2 = b.y + (vertical ? 0 : layout.cardHeight / 2);
      const path = svg("path", {d: vertical ? `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}` : `M${x1},${y1} C${(x1+x2)/2},${y1} ${(x1+x2)/2},${y2} ${x2},${y2}`});
      path.append(elementSvgTitle(index[edge.to].field)); edges.append(path);
    }
    scene.append(edges);
    for (const position of layout.nodes) {
      const item = index[position.id], node = item.node, label = PolyglotWorkspace.astLabel(node);
      const card = element("div", undefined, "ast-node-card"); card.dataset.kind = node.kind; card.dataset.astId = item.id;
      card.style.left = `${position.x}px`; card.style.top = `${position.y}px`; attachSource(card, node.span);
      const select = element("button", undefined, "ast-select"); select.type = "button";
      select.setAttribute("aria-label", `${node.kind} ${label}${node.span?.line ? `, source line ${node.span.line}` : ""}`);
      select.title = `${node.kind}: ${label}${node.meta?.type ? ` (${node.meta.type})` : ""}${item.field ? ` · ${item.field}` : ""}`;
      select.append(element("span", node.kind, "ast-node-kind"), element("span", label, "ast-node-value"),
        element("span", `${node.meta?.type || item.field || "root"}${node.span?.line ? ` · L${node.span.line}` : ""}`, "ast-node-detail"));
      select.addEventListener("click", () => {
        if (inspectionMatchesSource && node.span) { if (expandedView) setExpanded(false); navigateSource(node.span); }
      });
      card.append(select);
      if (item.children.length) {
        const toggle = element("button", undefined, "ast-branch"); toggle.type = "button";
        toggle.append(glyph("caret-right")); toggle.setAttribute("aria-expanded", String(expanded.has(item.id)));
        toggle.setAttribute("aria-label", `${expanded.has(item.id) ? "Collapse" : "Expand"} children of ${node.kind} ${label}`);
        toggle.title = `${item.children.length} child nodes`;
        toggle.addEventListener("click", () => { expanded.has(item.id) ? expanded.delete(item.id) : expanded.add(item.id); draw(item.id); });
        card.append(toggle);
      }
      scene.append(card);
    }
    count.textContent = `${layout.nodes.length} / ${index[root].size} nodes${layout.truncated ? " · view limited to 250" : ""}`;
    if (fitMode) fitGraph(fitMode); else applyZoom(zoom, false);
    updateInspectionFocus();
    if (focusId !== null) {
      const position = positions.get(focusId);
      if (position) {
        viewport.scrollLeft = (position.x + layout.cardWidth / 2) * zoom - viewport.clientWidth / 2;
        viewport.scrollTop = (position.y + layout.cardHeight / 2) * zoom - viewport.clientHeight / 2;
      }
      const card = [...scene.querySelectorAll(".ast-node-card")].find(node => Number(node.dataset.astId) === focusId);
      card?.querySelector(".ast-branch")?.focus({preventScroll:true});
    }
  }
  function elementSvgTitle(text) { const title = svg("title"); title.textContent = text; return title; }
  focus.addEventListener("change", () => { root = Number(focus.value); expanded = new Set([root]); fitMode = "width"; draw(); });
  orientation.addEventListener("click", () => {
    vertical = !vertical; orientation.textContent = vertical ? "Left to right" : "Top to bottom";
    orientation.setAttribute("aria-label", vertical ? "Use left-to-right tree layout" : "Use top-to-bottom tree layout"); draw();
  });
  expand.addEventListener("click", () => { expanded = new Set(index.map(node => node.id)); draw(); });
  collapse.addEventListener("click", () => { expanded = new Set([root]); draw(); });
  zoomOut.addEventListener("click", () => { fitMode = null; applyZoom(zoom - .15); });
  zoomIn.addEventListener("click", () => { fitMode = null; applyZoom(zoom + .15); });
  fit.addEventListener("click", () => { fitMode = "all"; fitGraph(); });
  reset.addEventListener("click", () => { fitMode = null; applyZoom(1); });
  function setExpanded(next) {
    expandedView = next; view.classList.toggle("ast-view-expanded", next); document.body.classList.toggle("ast-expanded", next);
    enlarge.textContent = next ? "Restore view" : "Expand view";
    enlarge.setAttribute("aria-label", next ? "Restore tree view" : "Expand tree view"); enlarge.setAttribute("aria-pressed", String(next));
    if (fitMode) fitGraph(fitMode); else applyZoom(zoom, false);
  }
  enlarge.addEventListener("click", () => setExpanded(!expandedView));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && expandedView) { event.preventDefault(); setExpanded(false); enlarge.focus(); }
  }, {signal: controller.signal});
  viewport.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button")) return;
    pan = {id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
    viewport.setPointerCapture(event.pointerId); viewport.classList.add("ast-panning"); event.preventDefault();
  });
  viewport.addEventListener("pointermove", event => {
    if (pan?.id !== event.pointerId) return;
    viewport.scrollLeft = pan.left - event.clientX + pan.x; viewport.scrollTop = pan.top - event.clientY + pan.y;
  });
  function stopPan(event) {
    if (event?.pointerId !== undefined && pan?.id !== event.pointerId) return;
    const previous = pan; pan = null; viewport.classList.remove("ast-panning");
    if (previous && viewport.hasPointerCapture(previous.id)) viewport.releasePointerCapture(previous.id);
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(name, stopPan);
  window.addEventListener("blur", () => stopPan(), {signal:controller.signal});
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (fitMode) fitGraph(fitMode); else applyZoom(zoom, false); }) : null;
  observer?.observe(viewport);
  graphCleanup = () => { controller.abort(); observer?.disconnect(); stopPan(); document.body.classList.remove("ast-expanded"); };
  draw();
}

function renderStage(parent, stage, data) {
  if (stage === "recognition") {
    const families = new Map();
    for (const record of data) {
      const family = record.candidates?.length ? record.candidates.join(" / ") : record.family;
      families.set(family, (families.get(family) || 0) + 1);
    }
    const summary = element("div", undefined, "syntax-summary");
    for (const [family, count] of families) summary.append(element("span", `${family} · ${count}`));
    parent.append(element("h3", "Many syntaxes → one program", "view-heading"), summary,
      element("p", "Counts describe recognized constructs, including nested ones. Candidate groups share syntax; they are counted once.", "stage-explanation"));
  }
  if (stage === "execution") {
    const report = compilationReport;
    parent.append(element("h3", report.ok ? "Execution complete" : "Execution stopped", "view-heading"));
    const stats = element("dl", undefined, "execution-stats");
    for (const [key, value] of [["VM instructions executed", report.steps === undefined ? "Not reported for a stopped run" : report.steps.toLocaleString()],
      ["Output lines", report.output ? report.output.replace(/\n$/, "").split("\n").length : 0],
      ["Input", report.operation === "exec" ? "Uploaded bytecode artifact" : "Bytecode compiled from this source"]]) {
      stats.append(element("dt", key), element("dd", String(value)));
    }
    parent.append(stats, element("h4", "Program output", "view-heading"),
      element("pre", report.output || "No output produced.", "execution-output"));
    for (const diagnostic of report.diagnostics || []) {
      const error = element("div", diagnosticText(diagnostic), "diagnostic");
      if (diagnostic.location) error.append(sourceLink(diagnostic.location, true));
      parent.append(error);
    }
    return;
  }
  const table = PolyglotWorkspace.tableData(stage, data);
  if (table) { renderTable(parent, table.headers, table.rows, table.locations); return; }
  if (stage === "ast") {
    if (astPresentation === "diagram") renderAstDiagram(parent, data);
    else {
      const diagram = element("button", "Show connected tree", "stage-more");
      diagram.addEventListener("click", () => { astPresentation = "diagram"; showStage(); }); parent.append(diagram);
      renderTree(parent, "Program", data);
    }
    return;
  }
  if (stage === "ir" || stage === "bytecode") {
    const functions = stage === "ir" ? data : data.functions;
    parent.append(element("p", stage === "ir" ? "Readable three-address notation · t = temporary · global[n] / local[n] = storage slot. Original operands are preserved in Raw JSON." :
      "Static instruction listing, not execution history. Each instruction includes its effect on the VM stack.", "stage-explanation"));
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
        const rows = instructions.map((instruction, i) => [i,
          stage === "ir" ? PolyglotWorkspace.irText(instruction, functions) : `${instruction.op} ${instruction.args.map(value => JSON.stringify(value)).join(", ")}`,
          stage === "ir" ? instruction.op : PolyglotWorkspace.bytecodeMeaning(instruction, data),
          instruction.source ? `${instruction.source.line}:${instruction.source.column}` : "—"]);
        renderTable(details, ["#", stage === "ir" ? "Three-address code" : "Instruction", stage === "ir" ? "Operation" : "Stack effect", "Source"], rows, instructions.map(instruction => instruction.source));
      };
      details.addEventListener("toggle", populate); parent.append(details);
      if (fn === functions[0]) { details.open = true; populate(); }
    }
  }
}
function showStage() {
  graphCleanup?.(); graphCleanup = null;
  const executionAvailable = compilationReport && ["run", "exec"].includes(compilationReport.operation) && stages.bytecode;
  const available = selectedStage === "execution" ? !!executionAvailable : stages[selectedStage] !== undefined;
  const status = PolyglotWorkspace.pipelineStatus(stages, compilationReport);
  for (const button of document.querySelectorAll("[data-stage]")) {
    const phase = status[button.dataset.stage]; button.dataset.state = phase.state;
    button.querySelector("small").textContent = phase.text;
    button.title = `${stageTitles[button.dataset.stage]} · ${phase.text}`;
  }
  const summary = $("pipeline-summary");
  summary.textContent = !compilationReport ? "Check to explore · Run to execute" : compilationReport.operation === "exec" ? "Uploaded artifact · source stages unavailable" :
    !compilationReport.ok ? "Stopped · inspect the diagnostic" : stages.bytecode ? ["run", "exec"].includes(compilationReport.operation) ? "Compiled & executed locally" : "Compiled · VM not run" : "Result unavailable";
  const panel = $("stage-data"); panel.replaceChildren();
  panel.dataset.raw = String(rawStage);
  panel.classList.toggle("ast-graph-panel", available && selectedStage === "ast" && !rawStage && astPresentation === "diagram");
  if (available) {
    if (rawStage) panel.append(element("pre", JSON.stringify(selectedStage === "execution" ? compilationReport : stages[selectedStage], null, 2), "stage-json"));
    else renderStage(panel, selectedStage, stages[selectedStage]);
  } else {
    const icon = element("div", undefined, "stage-empty-icon"); icon.append(glyph("tree-structure"));
    const vmWaiting = selectedStage === "execution" && stages.bytecode && !executionAvailable;
    const noSource = compilationReport?.operation === "exec";
    panel.append(icon, element("div", status[selectedStage].state === "failed" ? `${stageTitles[selectedStage]} stopped` : vmWaiting ? "Compiled, ready to run" : noSource ? "Artifact execution" : compilationReport ? "Stage not available" : "Look inside your program", "stage-empty-title"),
      element("p", vmWaiting ? "Check and Build produce bytecode without executing it. Choose Run to see the VM result." : noSource ? "An uploaded artifact contains bytecode. Compile source to inspect its earlier stages." : compilationReport ? "Review the diagnostic in Output. Later stages are only available when their prerequisites succeed." : "Run or check your code. Explore its tokens, syntax tree and instructions here.", "stage-empty-help"));
    if (status[selectedStage].state === "failed") for (const d of compilationReport.diagnostics) {
      const diagnostic = element("button", diagnosticText(d), "diagnostic stage-empty-diagnostic");
      diagnostic.disabled = !inspectionMatchesSource;
      diagnostic.addEventListener("click", () => { if (inspectionMatchesSource) navigateSource(d.location); });
      panel.append(diagnostic);
    }
  }
  panel.dataset.empty = String(!available);
  panel.setAttribute("aria-labelledby", `tab-${selectedStage}`);
  $("stage-title").textContent = stageTitles[selectedStage];
  $("stage-description").textContent = stageDescriptions[selectedStage];
  $("phase-flow").textContent = phaseGuides[selectedStage][0];
  $("phase-concept").textContent = phaseGuides[selectedStage][1];
  $("stage-state").textContent = status[selectedStage].text;
  $("stage-state").dataset.state = status[selectedStage].state;
  $("previous-stage").disabled = selectedStage === PolyglotWorkspace.phaseOrder[0];
  $("next-stage").disabled = selectedStage === PolyglotWorkspace.phaseOrder.at(-1);
  $("stage-format").disabled = !available;
  $("stage-format").textContent = rawStage ? "Readable view" : "Raw JSON";
  $("stage-format").setAttribute("aria-pressed", String(rawStage));
  updateInspectionFocus();
  coursework?.refresh();
}
$("stage-format").addEventListener("click", () => { rawStage = !rawStage; showStage(); });
function dirty() {
  initialized = true; revision++;
  sourcePane.classList.remove("compiler-error");
  $("diagnostics").replaceChildren();
  $("execution-info").textContent = "";
  stages = {}; compilationReport = null; inspectionMatchesSource = false;
  showStage();
  setStatus("Source changed", "changed");
  updateEditor();
  scheduleDraft();
  renderFileList();
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
  coursework?.refresh();
  setStatus(operation === "run" || operation === "exec" ? "Running…" : "Compiling…", "busy");
  $("pipeline-summary").textContent = operation === "exec" ? "Executing uploaded artifact…" : "Compiling current source…";
  $("diagnostics").replaceChildren();
  const sourceAtStart = editor.value, filenameAtStart = $("filename").value, revisionAtStart = revision;
  try {
    const response = await fetch(`/api/${operation}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({source:sourceAtStart, filename:filenameAtStart, ...extra})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    inspectionMatchesSource = operation !== "exec" && revisionAtStart === revision;
    stages = revisionAtStart === revision ? result.stages || {} : {};
    compilationReport = revisionAtStart === revision ? {operation, ok: result.ok, output: result.output || "", steps: result.steps, diagnostics: result.diagnostics || [], analysis: result.analysis, trace: result.trace} : null;
    sourcePane.classList.toggle("compiler-error", operation !== "exec" && revisionAtStart === revision && !result.ok);
    showStage();
    setStatus(revisionAtStart !== revision ? "Source changed during compilation" : result.ok ? "Successful" : "Stopped with an error",
      revisionAtStart !== revision ? "changed" : result.ok ? "success" : "error");
    $("output").textContent = result.output || (result.ok ? operation === "run" || operation === "exec" ? "Program finished with no output." : "Compilation successful." : stages.bytecode && ["run", "exec"].includes(operation) ? "Execution stopped." : "Compilation stopped.");
    $("output").dataset.empty = String(!result.output);
    $("output-count").textContent = String(result.output ? result.output.replace(/\n$/, "").split("\n").length : 0);
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
    if (revisionAtStart === revision) { stages = {}; compilationReport = null; inspectionMatchesSource = false; showStage(); }
    setStatus("Connection error", "error");
    $("output").textContent = error.message;
    $("output").dataset.empty = "false";
  } finally {
    workbench.querySelector(".console-content").scrollTop = 0;
    busy = false;
    $("workbench").setAttribute("aria-busy", "false");
    coursework?.refresh();
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
$("previous-stage").addEventListener("click", () => selectStage(stageTabs[PolyglotWorkspace.phaseOrder.indexOf(selectedStage) - 1]));
$("next-stage").addEventListener("click", () => selectStage(stageTabs[PolyglotWorkspace.phaseOrder.indexOf(selectedStage) + 1]));
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
coursework = PolyglotCoursework.mount({element, renderTable, sourceLink,
  irText: PolyglotWorkspace.irText, astIndex: PolyglotWorkspace.astIndex,
  getState: () => ({stages, report: compilationReport, busy, filename: $("filename").value}),
  analyze: () => action("inspect", {teaching:true}), record: () => action("run", {teaching:true}),
  selectStage: name => selectStage($("tab-" + name)),
  loadExample: async module => {
    if (busy || !Object.hasOwn(examples, module.example)) return;
    coursework.close();
    if (!await canReplaceSource() || busy) return;
    selectedExample = module.example; $("examples").value = module.example;
    loadSource(examples[module.example], module.example);
    selectStage($("tab-" + module.stage));
    await coursework.open(module.id);
    await action(module.id === "generation" ? "run" : "inspect", {teaching:true});
  }
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
  renderFileList();
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
  renderFileList();
}).catch(error => { setStatus(error.message, "error"); });
showStage();
}
