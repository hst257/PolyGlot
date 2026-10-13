const test = require('node:test');
const assert = require('node:assert/strict');
const {tokenize, bracketPairs} = require('../../src/polyglot/web/static/app.js');
const tokens = source => tokenize(source).map(t => ({...t, text: source.slice(t.start, t.end)}));
const kind = (source, text) => tokens(source).find(t => t.text === text)?.kind;

test('one definition recognizes all supported mixed syntax families', () => {
  const source = 'def twice(value: int) -> int:\n    return add(value, value)\n' +
    'int add(int a, int b) { return a + b; }\nfunction calculate(n: int): int { return twice(n); }\n' +
    'let numbers = [1, 2];\nconst ready = true;\nLET result = calculate(numbers[0])\n' +
    'PRINT result\nconsole.log(result);\nSystem.out.println(result);\nstd::cout << result << std::endl;\nprintf("%d", result);';
  for (const text of ['def', 'return', 'function', 'let', 'const', 'LET']) assert.equal(kind(source, text), 'keyword', text);
  for (const text of ['twice', 'add', 'calculate']) assert.equal(kind(source, text), 'function', text);
  for (const text of ['PRINT', 'console', 'log', 'System', 'out', 'println', 'std', 'cout', 'endl', 'printf'])
    assert.equal(kind(source, text), 'builtin', text);
  assert.equal(kind(source, 'numbers'), 'identifier');
  assert.equal(kind(source, 'true'), 'constant');
  assert.equal(kind(source, 'int'), 'type');
});

test('strings and comments take precedence over keywords and calls', () => {
  const source = 'print("return add() # // /* */") # return add()\n// let calculate()\n/* int\nreturn twice() */\nreturn 1';
  const result = tokens(source);
  assert.deepEqual(result.filter(t => t.kind === 'function'), []);
  assert.equal(result.filter(t => t.kind === 'keyword').length, 1);
  assert.equal(result.filter(t => t.kind === 'comment').length, 3);
  assert.equal(result.find(t => t.kind === 'string').text, '"return add() # // /* */"');
});

test('supported escapes protect quotes and comment delimiters in strings', () => {
  const source = String.raw`print("a\"return\\ # // \n\r\t", 'it\'s /* fine */')`;
  const strings = tokens(source).filter(t => t.kind === 'string');
  assert.equal(strings.length, 2);
  assert.ok(strings[0].text.includes('return'));
  assert.ok(strings[1].text.includes('/* fine */'));
  assert.equal(tokens(source).filter(t => t.kind === 'comment' || t.kind === 'keyword').length, 0);
});

test('unclosed strings stop at the actual newline, without false error tokens', () => {
  const result = tokens('"unfinished\nreturn 1');
  assert.equal(result[0].text, '"unfinished');
  assert.equal(result.find(t => t.text === 'return').kind, 'keyword');
  assert.ok(result.every(t => t.kind !== 'error'));
});

test('only block comments carry multiline state; incomplete comments remain readable', () => {
  assert.equal(tokens('/* return\nint x = 1; */\nprint(1)')[0].kind, 'comment');
  const source = 'x = 1\n/* unfinished\nreturn';
  assert.equal(tokens(source).at(-1).text, '/* unfinished\nreturn');
  assert.equal(tokens(source).at(-1).kind, 'comment');
});

test('unsupported triple-quoted forms do not enable multiline strings', () => {
  assert.equal(kind('"""unfinished\nreturn 1', 'return'), 'keyword');
});

test('types use exact implemented names, never capitalization heuristics', () => {
  for (const type of ['int', 'float', 'double', 'bool', 'boolean', 'str', 'string', 'String', 'void'])
    assert.equal(kind(type + '[] values', type), 'type');
  for (const name of ['Widget', 'Integer', 'StringBuilder', 'None', 'null', 'printfExtra'])
    assert.equal(kind(name + ' = 1', name), 'identifier');
});

test('function colors follow declaration or call context, including incomplete signatures', () => {
  assert.equal(kind('def calculate', 'calculate'), 'function');
  assert.equal(kind('function calculate', 'calculate'), 'function');
  assert.equal(kind('int calculate(int a) {', 'calculate'), 'function');
  assert.equal(kind('calculate /* comment */ (1)', 'calculate'), 'function');
  assert.equal(kind('calculate = 1', 'calculate'), 'identifier');
});

test('qualified builtins require their actual spelling', () => {
  assert.equal(kind('console.log(1)', 'console'), 'builtin');
  assert.equal(kind('System.out.println(1)', 'out'), 'builtin');
  assert.equal(kind('console.warn(1)', 'console'), 'identifier');
  assert.equal(kind('System.other.println(1)', 'other'), 'identifier');
  assert.equal(kind('console = 1', 'console'), 'identifier');
});

test('numbers, booleans, operators, arrays and return arrows remain distinct', () => {
  const source = 'int[] values = [12, 2.5, 1e-3]; true False and not x -> int && x != 0; values[0] += 1';
  for (const value of ['12', '2.5', '1e-3']) assert.equal(kind(source, value), 'number');
  for (const value of ['true', 'False']) assert.equal(kind(source, value), 'constant');
  for (const value of ['and', 'not', '->', '&&', '!=', '+=']) assert.equal(kind(source, value), 'operator');
  for (const value of ['[', ']', ';', ',']) assert.equal(kind(source, value), 'punctuation');
});

test('deferred BASIC spellings are visual keywords, never execution validation', () => {
  assert.equal(kind('GOTO finish THEN', 'GOTO'), 'keyword');
  assert.equal(kind('GOTO finish THEN', 'THEN'), 'keyword');
});

test('bracket matching excludes strings/comments and refuses mismatched pairs', () => {
  const source = 'add([1, 2], "(]") /* } */';
  const pairs = bracketPairs(source, tokenize(source));
  assert.equal(pairs.get(3), source.indexOf(') /*'));
  assert.equal(pairs.get(4), source.indexOf('],'));
  assert.equal(pairs.size, 4);
  assert.equal(bracketPairs('([)]', tokenize('([)]')).size, 0);
});

test('token offsets reconstruct arbitrary source without modifying or dropping characters', () => {
  for (const source of ['', '\n', '\t', 'x\r\ny', '"<img src=x onerror=alert(1)>"', '"😀"', 'x = @oops', '\\', '123e+', "'", '/*']) {
    const result = tokens(source);
    assert.equal(result.map(t => t.text).join(''), source);
    let offset = 0;
    for (const t of result) { assert.equal(t.start, offset); assert.ok(t.end > t.start); offset = t.end; }
    assert.equal(offset, source.length);
  }
});

test('seeded malformed sources terminate and preserve their exact text', () => {
  let seed = 14;
  const alphabet = 'ab09#/*\'"\\\n[]{}() :;=<>&😀';
  for (let n = 0; n < 250; n++) {
    let source = '';
    for (let i = 0; i < 100; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; source += alphabet[seed % alphabet.length]; }
    assert.equal(tokens(source).map(t => t.text).join(''), source);
  }
});

test('a source near the compiler size limit remains lossless', () => {
  const source = 'LET total = add(1, 2) # comment\n'.repeat(4000);
  const result = tokenize(source);
  assert.equal(result.map(t => source.slice(t.start, t.end)).join(''), source);
  assert.equal(result.filter(t => t.kind === 'function').length, 4000);
});
