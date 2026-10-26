# Verification

## Current baseline

Verified on October 26, 2026. The repository cleanup retains the compiler, runtime, frontend, tests and examples unchanged.

| Check | Result |
| --- | --- |
| Complete Python suite, including loopback HTTP workers | 298 passed |
| Complete frontend suite | 57 passed |
| Documentation links and current presentation paths | Checked after cleanup |
| Static Pages package | Builds with project-relative assets |

From the repository folder:

```sh
python3 -m pytest -q
npm ci
npm test
python3 tools/build_pages.py
```

Tests require development dependencies. The local application itself requires only Python 3.11 or newer. In an environment that blocks local sockets, `python3 -m pytest -q -m "not network"` runs the non-network checks; the complete suite needs loopback access.

## Compiler and runtime coverage

The tests cover lexer positions, mixed block parsing, normalized AST nodes, grammar attribution, lexical scopes, type errors, definite assignment, functions, recursion, loops, arrays and short-circuit behavior. Positive and negative examples remain synchronized with the bundled browser catalog.

Optimization tests compare optimized and unoptimized output, runtime diagnostics and evaluation order. They exercise constant folding, branch simplification, unreachable blocks, temporary liveness and definition-sensitive next use. Oversized functions retain their original IR.

Artifact tests cover validation, legacy compatibility and execution without the source file. HTTP tests exercise check, run, build, inspect and artifact execution with real spawned workers, including limits and recovery after failures.

Frontend tests cover source recovery, replacement controls, stale responses, Unicode diagnostic links, safe rendering, connected AST relationships, readable compiler views, pane controls and the Pages worker adapter.

## Demonstrated results

| Program | Result |
| --- | --- |
| `mixed_demo.poly` | `0`, `1`, `3`, `6`, `12`, `done` on separate lines |
| `mixed_nesting.poly` | `22` |
| `p1_mixed.poly` | `total 8`, formatted output, `BASIC output`, `8`, `done` |
| `arrays_mixed.poly` | `15`, `7`, `[1, 7, 3, 4] 4` |
| `array_iteration.poly` | `1` through `5` |
| `recursion.poly` | `720` |
| `print((2 + 3) * 4)` | `20`, with 17 VM steps unoptimized and 5 optimized |
| `print(2 + )` | `P010` at line 1, column 11 |
| `error_type.poly` | `S004` at line 2, with code generation blocked |

Instruction counts do not establish an elapsed-time speedup. [The demonstration script](demo.md) explains the corresponding compiler views. Working screenshots are embedded in the [current presentation](../presentation/output/PolyGlot_Compiler_Design_Redesigned.pptx).

## Browser build and earlier manual checks

The Pages build packages the original compiler modules and runs the shared `execute_job` API under Pyodide 314.0.7 in a module Web Worker. Earlier verification on October 26 matched native Python results on 26 real WebAssembly cases, including bundled examples, errors, limits, building and independent artifact execution. Those browser checks were not repeated for this file-organization change.

The first browser execution downloads the runtime. An outer deadline terminates overdue worker jobs, while VM step, recursion, output and execution limits remain active. The local HTTP route remains available.

The deployment workflow needs repository Pages administration to enable GitHub Actions as its source. See the [hosting instructions](../README.md#hosted-browser-version-github-pages) for setup.

Historical interface screenshots and superseded running-session notes have been removed. Git history retains earlier verification records. Current scope and limitations are documented in [the language specification](language.md), [architecture](architecture.md) and [editor maintenance notes](highlighting.md).
