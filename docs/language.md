# Polyglot language specification

Polyglot defines one statically checked language with borrowed syntax. It does not preserve all semantics of Python, C++ or Java.

## P0 support matrix

| Capability | Python-inspired | C++/Java-inspired |
|---|---|---|
| Variables | `x = 3` | `int x = 3;`, `double`, `bool`, `boolean`, `String` |
| Functions | `def add(a: int, b: int) -> int:` | `int add(int a, int b) { ... }` |
| Conditions | `if`, `elif`, `else` with suites | `if (...)`, `else if (...)`, `else` with braces |
| While | `while condition:` | `while (condition) { ... }` |
| For | `for i in range(...)` | `for (initializer; condition; update) { ... }` |
| Output | `print(...)` | `System.out.println(...)`; qualified/bare `cout` |
| Loop control | `break`, `continue` | Same spellings |
| Returns | `return` or `return expression` | Same spellings |

## Lexical and structural rules

Identifiers are ASCII, case-sensitive, and match `[A-Za-z_][A-Za-z0-9_]*`. Built-in names, type names and P0 construct keywords are reserved. Boolean literals accept `True`, `False`, `true`, `false`.

Strings use single/double quotes and escapes `\\`, `\'`, `\"`, `\n`, `\r`, `\t`. Comments: `#`, `//`, and `/* ... */`. Triple quotes, raw/f-strings and backslash continuation are unsupported. `//` is not division. CRLF input is normalized to LF for inspection spans.

Newlines terminate shared simple statements. Semicolons are also accepted; typed declarations and C++/Java built-in output require them. EOF completes a final logical line. Parentheses suppress newlines, permitting multiline expressions, arguments and headers. Block-comment newlines follow the same logical-newline rules.

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

Three-part loops support optional declaration/assignment initializer, optional Boolean condition, and optional assignment/compound-assignment/`i++`/`i--` update. Missing condition means true. `continue` runs the update; `break` skips it. Increment/decrement outside the update position is unsupported.

Functions are top-level and require annotated parameters and return types. Python-style void functions use `-> void`. Forward calls and recursion work. Parameters are passed by value. Reject invalid arity/types, missing value returns, and value returns from void functions. Return checking is conservative: a loop alone does not prove every path returns. Functions are not first-class values; nested functions and overloading are unsupported.

## Output

`print` accepts zero or more printable values, separates multiple arguments with spaces, and adds newline. `System.out.println` accepts exactly one expression and adds newline. `std::cout`/`cout` accepts insertion chains, with no automatic separators; `std::endl`/`endl` adds newline. Each cout expression is evaluated and emitted before evaluating the next insertion. Print arguments evaluate before output is emitted.

Integers print in decimal, floats in Python's finite float representation, Booleans as `true`/`false`, strings without quotes. All spellings use these same rules. These are recognized built-ins, not general namespaces, methods or overloaded operators.

## Deferred features

C `printf`, JavaScript and BASIC extensions, unannotated functions, multi-error recovery and optimization are not enabled. Arrays, classes, pointers, imports, exceptions and external libraries are unsupported. Block nesting is limited to 100; calls/output accept at most 1000 arguments. Python's integer text-conversion limits can constrain unusually large literals/output; arithmetic still does not use fixed-width integers.
