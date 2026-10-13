# Polyglot language specification

Polyglot defines one statically checked language with borrowed syntax. It does not preserve all semantics of Python, C, C++, Java, JavaScript or BASIC.

## P0 support matrix

| Capability | Python-inspired | C++/Java-inspired |
|---|---|---|
| Variables | `x = 3` | `int x = 3;`, `double`, `bool`, `boolean`, `String` |
| Arrays | `values = [1, 2]`, `values[i]`, `len(values)` | `int values[2] = {1, 2};`, `int[] values = new int[2];` |
| Functions | `def add(a: int, b: int) -> int:` | `int add(int a, int b) { ... }` |
| Conditions | `if`, `elif`, `else` with suites | `if (...)`, `else if (...)`, `else` with braces |
| While | `while condition:` | `while (condition) { ... }` |
| For | `for i in range(...)`, `for value in array:` | `for (initializer; condition; update) { ... }` |
| Output | `print(...)` | `System.out.println(...)`; qualified/bare `cout` |
| Loop control | `break`, `continue` | Same spellings |
| Returns | `return` or `return expression` | Same spellings |

## P1 support matrix

| Syntax | Supported spelling | Restrictions |
|---|---|---|
| JavaScript declarations | `let x = value;`, `const x = value;` | Initializers required; fixed inferred types |
| JavaScript output | `console.log(...)` | Recognized builtin; semicolon required |
| JavaScript functions | `function name(a: int): int { ... }` | Polyglot annotations required; top-level only |
| C formatted output | `printf("%d %f %s", n, ratio, name);` | Literal format; only `%d`, `%f`, `%s`, `%%` |
| BASIC assignment | `LET X = expression` | Uppercase prefix, shared case-sensitive bindings |
| BASIC output | `PRINT expression`, `PRINT` | One expression or blank line |

## Lexical and structural rules

Identifiers are ASCII, case-sensitive, and match `[A-Za-z_][A-Za-z0-9_]*`. Built-in names, type names and active construct keywords are reserved. Boolean literals accept `True`, `False`, `true`, `false`.

Strings use single/double quotes and escapes `\\`, `\'`, `\"`, `\n`, `\r`, `\t`. Comments: `#`, `//`, and `/* ... */`. Triple quotes, raw/f-strings and backslash continuation are unsupported. `//` is not division. CRLF input is normalized to LF for inspection spans.

Newlines terminate shared simple statements and BASIC forms. Semicolons are also accepted; typed declarations, JavaScript declarations, and C/C++/Java/JavaScript built-in output require them. EOF completes a final logical line. Parentheses suppress newlines, permitting multiline expressions, arguments and headers. Block-comment newlines follow the same logical-newline rules.

Python headers require colon, newline and a nonempty indented suite. Suite statements must align. Blank/comment-only lines do not establish indentation. Tabs in leading whitespace are rejected. Brace blocks may be empty and accept cosmetic indentation. A Python suite inside braces activates indentation until its dedent or the enclosing closing brace. Braces can also nest inside Python suites. `else` attachment follows structural context; Python-style branches must align with their `if`.

## Types, scopes and initialization

Aliases normalize to `int`, `float`, `bool`, `string`; `void` is return-only. `float`/`double`, `bool`/`boolean`, and `str`/`string`/`String` are equivalent.

One namespace contains variables and functions. Explicit declarations create current-scope bindings and may shadow outer bindings. Duplicate names in one scope fail. Initializers resolve names before introducing the new binding. Untyped assignment updates the nearest visible variable or introduces a current-scope binding. Subsequent assignments cannot change its type.

Global, function, block and loop scopes are lexical, including Python-style blocks. Function parameters occupy the function scope. Typed loop initializers and range counters are loop-local; assignment initializers update visible bindings. Block and loop bindings do not escape their scope.

Explicit declarations may omit initialization. Reads require definite initialization: branch exits are intersected and loops may execute zero times. Function calls do not prove global initialization or writes. Function bodies can resolve later global declarations, but VM guards catch reads before their initializer actually executes. Initialize globals before relying on calls that read them.

## Expressions

Precedence, high to low: calls/parentheses; unary `+`/`-`; `*`/`/`/`%`; `+`/`-`; comparisons; `not`/`!`; `and`/`&&`; `or`/`||`. Binary operators associate left. Chained comparisons are rejected; combine separate comparisons with Boolean operators.

Operands and call arguments evaluate left to right. Boolean operators short-circuit and require Booleans. Conditions require Booleans; numeric truthiness is unsupported. `not` and `!` share Polyglot precedence, which deliberately differs from C++/Java `!`.

Integers have no fixed 32/64-bit width, subject to resource limits. Floats use finite binary64 values. Integer-to-float widening is allowed for assignment, arguments and returns; narrowing is rejected. Booleans are not numbers. Division always returns float. Remainder follows the dividend's sign (`-7 % 3` is `-1`), including floating-point remainder. Zero divisors fail at runtime. Mixed numeric operations widen integers explicitly.

Strings support concatenation with strings, equality and lexicographic ordering. Implicit numeric/string coercion is unsupported. `+=` and `-=` follow the corresponding binary operator and assignment checks.

## Control flow and functions

`range(stop)`, `range(start, stop)` and `range(start, stop, step)` require integers, evaluate arguments once, exclude the bound, and support either step sign. Zero step fails at runtime.

`for value in array_expression:` supports one-dimensional arrays of any primitive element type, regardless of their declaration syntax. Evaluate the expression once and retain its array reference and fixed length. Read each element at the start of its iteration; mutations to later elements are visible, while rebinding the source variable does not change the captured array. The loop-local variable has the element type and receives a copy of each primitive value. Assigning it does not mutate the array. Empty arrays execute no iterations; `continue` advances to the next element and `break` exits. General iterable objects, string iteration, tuple unpacking and `for ... else` are unsupported.

Three-part loops support optional declaration/assignment initializer, optional Boolean condition, and optional assignment/compound-assignment/`i++`/`i--` update. Missing condition means true. `continue` runs the update; `break` skips it. Increment/decrement outside the update position is unsupported.

Functions are top-level and require annotated parameters and return types. Python-style void functions use `-> void`. Forward calls and recursion work. Primitive parameters are passed by value; array reference values are copied, sharing the same mutable array. Reject invalid arity/types, missing value returns, and value returns from void functions. Return checking is conservative: a loop alone does not prove every path returns. Functions are not first-class values; nested functions and overloading are unsupported.

## One-dimensional arrays

Array types append `[]` to a primitive type, including aliases. Supported declarations include `values = [1, 2]`, `int values[2] = {1, 2};`, `int values[] = {1, 2};`, and `int[] values = [1, 2];`. Brace literals are supported only in explicit declaration initializers. Literals allow multiline contents and trailing commas. Each evaluation creates a fresh array object.

Infer the common element type of nonempty literals; numeric mixtures widen to float. Other heterogeneous elements, nested arrays, void elements and implicit whole-array conversions are rejected. In a known typed context, `float[] values = [1, 2];` widens the literal elements; assigning an existing `int[]` to a `float[]` fails because mutable array types are invariant. Empty literals need an explicit declaration or an expected parameter/return/previous binding type.

`int values[n];` and `new int[n]` allocate a fixed-length array, initializing elements to `0`; other defaults are `0.0`, `false`, and `""`. An unsized declaration without an initializer (`int[] values;`) remains uninitialized. Length expressions evaluate once. A sized initializer must match its declared length; literal mismatches are diagnosed statically, dynamic mismatches at runtime.

Indexing requires an integer; negative indexes and indexes at or beyond length fail at runtime. `values[i] = value`, `+=`, and `-=` check element compatibility. Evaluate the array reference and index once, validate bounds, then evaluate the right-hand side. Compound assignment captures the old element before right-hand-side evaluation. `len(array)` returns its element count.

Assignment, argument passing and returns share array references; element writes are visible through aliases. Rebinding a variable or parameter changes that binding only. Objects cannot resize; rebinding to a new object of the same element type may change the binding's length. Array arithmetic, comparisons, slicing, general increment/decrement and multidimensional arrays are unsupported. Whole-array output uses JSON-style formatting, with quoted strings and lowercase Booleans.

The per-array limit is 1000 elements; a VM execution may allocate up to 100,000 total elements (empty arrays count as one allocation unit). Source/artifact/output limits also apply. Generated artifacts must fit the same 5 MB limit enforced by the loader.

## Output

`print` accepts zero or more printable values, separates multiple arguments with spaces, and adds newline. `System.out.println` accepts exactly one expression and adds newline. `std::cout`/`cout` accepts insertion chains, with no automatic separators; `std::endl`/`endl` adds newline. Each cout expression is evaluated and emitted before evaluating the next insertion. Print arguments evaluate before output is emitted.

Integers print in decimal, floats in Python's finite float representation, Booleans as `true`/`false`, strings without quotes. All spellings use these same rules. These are recognized built-ins, not general namespaces, methods or overloaded operators.

## Additional declarations, functions and output

`let` and `const` require an initializer and infer the same fixed types as Python-style assignment. `const` disallows rebinding through every supported spelling, including compound assignments and BASIC LET. It does not freeze array contents. An inner declaration may shadow an outer const binding. JavaScript-style for initializers accept `let`/`const`; updating a const loop counter fails statically.

JavaScript-style functions require `name: type` parameters and a `: return_type` annotation before their brace body. They normalize to the same Function AST and share forward calls, recursion, arrays, returns and type checks. This annotated spelling is a Polyglot restriction, not standard JavaScript. `console.log` matches common print semantics, with spaces between arguments and a final newline; it is not general member access.

`printf` is a statement-only builtin with a literal format. `%d` requires integer, `%f` requires float (with integer widening), `%s` requires string, and `%%` emits percent without consuming an argument. `%f` prints six fractional digits. No automatic newline is added. Arguments evaluate once, left to right, before formatting/output. Widths, precision, flags, dynamic formats, `%c` and other specifiers fail at compile time. This does not expose C libraries or C's source-language evaluation/type semantics.

BASIC forms use uppercase LET/PRINT with case-sensitive identifiers. LET introduces or updates the nearest shared binding using `=`; other compound assignments omit the LET prefix. PRINT emits one expression plus newline, or a blank line. BASIC may appear inside any supported block and use the same expression/array grammar. No line numbers, labels, GOTO, IF/THEN or END are enabled.

## Deferred features

BASIC labels/jumps, unannotated functions, multi-error recovery and optimization are not enabled. Multidimensional arrays, other collections, classes, pointers, imports, exceptions and external libraries are unsupported. Block nesting is limited to 100; calls/output accept at most 1000 arguments. Python's integer text-conversion limits can constrain unusually large literals/output; arithmetic still does not use fixed-width integers.
