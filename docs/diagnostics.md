# Diagnostics and execution limits

Compilation stops at the first error. Diagnostics include a stable code, message, filename, line/column, source excerpt, highlighted span, optional help and related locations. The IDE displays the location/excerpt and navigates to the source on click. Runtime errors additionally include the VM call stack and preserve earlier output.

| Codes | Category |
|---|---|
| `L001` | Tab indentation |
| `L002`–`L008` | Unclosed comments/strings/parentheses, unsupported escapes, malformed literals/tokens |
| `P001`–`P006` | Missing structural tokens, terminators, indentation, unsupported/malformed constructs |
| `P010`–`P012` | Expressions, call forms and chained comparisons |
| `P020`–`P024` | Annotations, range arity, malformed function header, output arity, argument limits |
| `P099` | Excessive expression/block nesting |
| `S001`–`S009` | Duplicate/reserved names, void bindings, undefined/uninitialized names, incompatible types/operators/literals |
| `S010`–`S018` | Calls, conditions, nested functions, range types, loop control and returns |
| `P025`, `S019`–`S026` | Array types, indexes, inference, lengths and initializer compatibility |
| `S027` | Unsupported non-array iterable in a Python-style for-in loop |
| `C001`, `C002` | Source size and generated-artifact resource/validation limits |
| `C999` | Unexpected worker/compiler failure; report as a defect |
| `A001` | Invalid artifact or web execution request |
| `R001`, `R002` | Instruction limit or timeout |
| `R003`–`R005` | Uninitialized storage, zero divisors, nonfinite results |
| `R006`, `R010`, `R011` | Output, value-size and recursion limits |
| `R007`–`R009` | Invalid runtime operation, missing return guard, zero range step |
| `R012`–`R014` | Array bounds, allocation lengths/budget and initializer length mismatch |

Default limits: 1,000,000 VM instructions, 64 nested calls beyond main, 65,536 UTF-8 output bytes, five seconds of VM execution, and an eight-second web worker deadline. Strings and source input are limited to 128 KiB. Integers have a one-million-bit runtime resource ceiling. Artifacts are limited to 5 MB when loaded. Function instructions/constants/slots and operand-stack heights are validated against resource ceilings.

CLI run/exec options configure VM limits. Web run/exec requests may supply a `limits` object with `steps`, `recursion`, `output`, or `timeout`, each positive and no larger than its default. `serve --worker-timeout` configures the parent deadline up to 60 seconds. The worker deadline also bounds compilation; the VM's instruction-time checks cannot interrupt a single long host arithmetic operation.

Parser error recovery, complete interprocedural initialization analysis and sophisticated return proofs are deferred. Invalid source is never executed, and unsupported syntax is never silently skipped.
