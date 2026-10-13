# IR and bytecode

## Typed three-address IR

Every instruction preserves source location/excerpt. Value-producing instructions define a typed temporary. Binding operations identify global/local storage and slot. A function records ID, name, parameter types, return type, local count and temporary count.

| Operation | Meaning |
|---|---|
| `CONST` | Define a typed literal temporary |
| `LOAD`, `STORE` | Read/write a resolved binding |
| `MOVE` | Copy a temporary; merge short-circuit/loop test results |
| `WIDEN` | Convert integer to float |
| `UNARY`, `BINARY` | Explicit normalized operator and operands |
| `FORMAT` | Convert one typed printf argument to a string using an explicit specifier |
| `LABEL`, `JUMP`, `BRANCH` | Named control-flow targets and Boolean decisions |
| `CALL` | Function ID, evaluated arguments and optional result |
| `RETURN_VALUE`, `RETURN_VOID` | Return from the current frame |
| `OUTPUT` | Evaluated arguments, separator and ending |
| `ARRAY_BUILD`, `ARRAY_NEW` | Typed literal construction or default-initialized allocation |
| `ARRAY_GET`, `ARRAY_SET`, `ARRAY_CHECK` | Indexed access, mutation and pre-RHS bounds validation |
| `ARRAY_LENGTH`, `ARRAY_SIZE_CHECK` | Length query or sized-initializer validation |
| `ASSERT`, `TRAP` | Runtime guard or unconditional mapped failure |

Short-circuit expressions use branches rather than eagerly executing both operands. Range arguments are evaluated once and retained in temporary slots. Positive and negative steps use separate comparisons. Continue targets the loop update; break targets the exit.

## Stack instruction reference

| Instruction | Operands | Stack effect |
|---|---|---|
| `CONST` | constant index | push value |
| `LOAD_LOCAL`, `LOAD_GLOBAL` | slot | push value; reject uninitialized read |
| `STORE_LOCAL`, `STORE_GLOBAL` | slot | pop value |
| `UNARY` | `+`, `-`, `not`, `float` | pop one, push one |
| `BINARY` | normalized operator | pop right then left, push result |
| `FORMAT` | `d`, `f`, or `s` | pop typed argument, push formatted string (version 3+) |
| `JUMP` | absolute instruction index | none |
| `JUMP_IF_FALSE` | absolute index | pop Boolean |
| `CALL` | function ID, argument count | pop arguments; result pushed only for value returns |
| `RETURN_VALUE` | none | pop result, restore caller |
| `RETURN_VOID` | none | restore caller; main return finishes execution |
| `OUTPUT` | argument count, separator, ending | pop arguments in source order |
| `ASSERT` | diagnostic code, message | pop Boolean; fail if false |
| `TRAP` | diagnostic code, message | fail unconditionally |
| `POP` | none | discard one value; accepted by loader, not currently needed by generator |
| `ARRAY_BUILD` | primitive type, count | pop ordered elements, push a new array |
| `ARRAY_NEW` | primitive type | pop length, push a default-initialized array |
| `ARRAY_GET` | none | pop index and array, push element |
| `ARRAY_SET` | none | pop value, index and array; validate type and mutate |
| `ARRAY_CHECK` | none | pop index and array; validate bounds |
| `ARRAY_LENGTH` | none | pop array, push length |
| `ARRAY_SIZE_CHECK` | none | pop expected length and array; require matching length |

IR temporaries map to local slots after declared locals. Calls place parameters in the first local slots of a fresh frame. Each frame has its own instruction pointer and operand stack. Storage starts uninitialized. Value-returning functions end with an unreachable trap as a defensive guard.

## Artifact format

New `.pbc` artifacts are UTF-8 JSON with `format: "polyglot-bytecode"`, `version: 3`, `entry`, `constants`, `global_count`, and `functions`. Constants remain primitive values; arrays are allocated by instructions, never embedded mutable constants. Signatures accept primitive or one-dimensional array types. Functions contain signatures, local storage size and instruction arrays. Instructions contain `op`, `args` and original source metadata/excerpts. The loader continues to accept scalar version 1 and array version 2 artifacts. Version 1 rejects array types/instructions; versions 1/2 reject FORMAT.

FORMAT checks its runtime operand type: `%d` integer, `%f` float, `%s` string. Integer widening for `%f` is explicit in IR/bytecode. Literal format segments and formatted temporaries feed the existing OUTPUT operation. Const mutability is enforced during source semantic analysis; bytecode is not a source-level const verifier.

The loader rejects unknown versions/opcodes, duplicate JSON keys, malformed constants, invalid operands/slots/functions/jumps, bad source mappings, stack underflow, inconsistent branch-stack heights, incorrect return forms and reachable fall-through. Runtime checks additionally enforce operand/call/return types and initialized storage. No pickle or code deserialization is used.

Artifacts are reusable without source text or AST. Serialization rejects artifacts over 5 MB, and compilation verifies that its generated artifact is serializable within this limit. Format changes require an explicit version change and loader tests.
