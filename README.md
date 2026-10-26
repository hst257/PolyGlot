# Polyglot

An offline educational compiler and browser IDE for a **restricted mixed-syntax language** with selected Python, C, C++, Java, JavaScript and BASIC-inspired spellings. It has its own grammar, types, scopes, bytecode and stack VM. It does not compile arbitrary programs from those languages.

## Hosted browser version (GitHub Pages)

The Pages build runs the **same Python compiler and custom VM inside a Web Worker
using Pyodide/WebAssembly**. Source stays in the browser. Check, Run, Build,
artifact execution and compiler-stage inspection work without a remote Python
server. First execution downloads the browser Python runtime, so allow time on a
slow connection. A modern browser with WebAssembly and module workers is required.
The local Python server remains available and needs no Pyodide dependency.

The deployment workflow builds static assets and deploys them on pushes to main.
The repository owner must enable Settings → Pages → Source: GitHub Actions once.
Build the same static package with:

```sh
python tools/build_pages.py --download-runtime
python -m http.server --directory build/pages
```

The pinned runtime is Pyodide 314.0.7. Deployment downloads its unmodified runtime
files into the generated site, including attribution and the upstream license.
Compiler execution uses the shared `execute_job` API, not Python evaluation of
user `.poly` source. The browser worker has an 8-second job deadline after loading,
and the VM retains its existing step, recursion, output and execution limits.

## Run locally

Python 3.11 or newer is required. The compiler and IDE have **no third-party runtime dependencies**. Open a terminal in the repository folder, then run:

```sh
python3 run_polyglot.py serve
```

On Windows, use `python` instead of `python3`. Keep the terminal open while using the IDE.

Open **http://127.0.0.1:8765**. Select `mixed_demo.poly` and click **Run**. The expected output is:

```text
0
1
3
6
12
done
```

The IDE includes source editing, automatic local draft recovery, Check, Run, Build/download, source upload/download, bytecode upload/execution, diagnostics and actual recognition/token/AST/symbol/IR/bytecode inspection. Its slate-and-blue workspace has searchable examples, a collapsible sidebar, resizable editor/inspector panes and docked output. Both the interface and syntax highlighting follow the system light/dark theme, with a persistent manual toggle. Official Phosphor icons are bundled locally with their MIT license.

Ctrl+Enter runs; Tab/Shift+Tab indent or unindent selected lines. Backspace removes one four-space indentation level when the cursor has no selection and sits at a leading indentation boundary; elsewhere it deletes normally. Arrow keys, Home and End navigate compiler stage tabs. The entire application works offline and uses system fonts and bundled assets.

Output stays docked beneath the editor. Drag its divider up or down, or use Up/Down (Shift for larger steps), Home or End. Drag the vertical divider to resize the compiler explorer, or use Left/Right, Home and End. The Programs button hides the searchable example sidebar. Layout sizes persist locally. Click the maximize icon beside Run for an editor-only workspace; Restore or Escape returns to the normal layout with source, selection and undo history preserved.

The source editor uses a **theme-aware syntax palette** for mixed-language keywords, types, calls, built-ins, literals, operators and comments. It retains native textarea editing, synchronized scrolling, undo/redo, active-line and matching-bracket feedback. Select `ember_demo.poly` for the supplied highlighting demonstration. Visual highlighting does not change compiler semantics.

Press Ctrl+C in the server terminal to stop it. Use `serve --port 8766` if port 8765 is occupied.

The editor automatically saves the current source and filename in this browser and restores them on refresh, including an intentionally empty program. A local status shows whether recovery is available; use **Save source** for a durable file. Replacing edited code with an example or uploaded source offers **Keep editing** or **Replace program**. Drafts belong to this browser and local server address; clearing browser storage removes them. Only the current draft is retained, and simultaneously editing in multiple tabs uses the latest saved draft.

The compiler explorer defaults to readable recognition/token/symbol tables, a connected AST diagram with node names and types, and per-function IR/bytecode instructions. The AST supports branch expansion, subtree focus, horizontal/vertical layouts, zoom, drag-to-pan and an expanded canvas; Outline remains available as an alternative. Position links jump to the source; selecting code highlights matching visible compiler records. **Raw JSON** retains the complete original representations. Large tables load more rows on demand. Editing source or its filename clears old diagnostics; responses for an earlier editor revision cannot attach stale error links.

## Compiler-design walkthrough

Open **Project walkthrough** in Programs and choose a demo. **Load & run demo** uses the real example and compiler, protects edited source before replacement, and opens the relevant inspection view:

- **Six syntax families**: trace the recognition rules and their normalized AST node kinds in `p1_mixed.poly`.
- **Braces + indentation**: inspect the connected tree for nested mixed block styles; the program prints `22`.
- **Arrays + shared functions**: follow array access and bounds checks through typed IR and VM instructions.
- **Semantic error**: show successful parsing followed by a type error, with IR and bytecode blocked.

The pipeline ribbon shows actual representation sizes and whether each stage is available, stopped or blocked. Syntax recognition and AST construction are views of the same parser pass. **Check** and **Build** compile without running the VM; **Run** adds execution. The VM view reports real output and executed instruction count, not a step-by-step trace. Uploaded artifacts expose bytecode and execution without claiming source stages are available.

The IR view uses readable three-address notation (`t2 = t0 + t1 : int`) and the bytecode view explains each instruction's stack effect. Source links and complete Raw JSON remain available. Expand the input/output disclosure above a view for a short explanation of its role. See [the demo script](docs/demo.md) and [design references](docs/ui-design.md#reference-informed-compiler-lab) for presentation guidance.

The compiler now applies **real IR optimization** before bytecode generation: local constant folding, constant-branch simplification, unreachable-code removal and safe dead-constant removal using control flow, liveness and next-use analysis. This changes the generated instructions while preserving program output and reachable runtime checks. For example, `print((2 + 3) * 4)` prints `20` using 5 VM instructions instead of 17.

Use `inspect --optimized-ir --optimization` to inspect the executed IR and actual pass counts, or `--no-optimize` on check/run/build/inspect to compare the original compilation. The existing IR view retains the original lowering output; Bytecode shows the generated executable instructions. See [architecture](docs/architecture.md#ir-optimization) for the conservative scope and bounds.

## CLI

```sh
python3 run_polyglot.py check examples/mixed_demo.poly
python3 run_polyglot.py run examples/mixed_demo.poly
python3 run_polyglot.py build examples/mixed_demo.poly -o build/mixed_demo.pbc
python3 run_polyglot.py exec build/mixed_demo.pbc
python3 run_polyglot.py inspect examples/mixed_demo.poly --syntax --symbols --ir
python3 run_polyglot.py run examples/mixed_nesting.poly
```

The second mandatory example prints `22`. Built `.pbc` JSON artifacts contain everything needed for execution and source-based runtime errors; the source file is not needed by `exec`.

Inspection switches: `--tokens`, `--syntax`, `--ast`, `--symbols`, `--ir`, `--bytecode`, `--optimized-ir`, `--optimization`. Omit switches to inspect all stages. `--json` enables structured CLI results/diagnostics. Exit codes: 0 success; 2 invalid invocation; 3 compilation failure; 4 runtime failure; 5 file/artifact failure. Program output goes to stdout; errors go to stderr.

Execution limits are configurable:

```sh
python3 run_polyglot.py run examples/recursion.poly --steps 10000 --recursion 32 --timeout 2 --output-limit 8192
```

## Development and tests

The source-tree launcher avoids installation and works offline. Tests require pytest:

```sh
python -m pip install pytest
python -m pytest -q
```

Frontend helper and tokenizer tests use Node's built-in runner (development only):

```sh
node --test tests/web/highlighting.test.cjs tests/web/workspace.test.cjs
```

For the complete editor interaction suite, optionally install the development-only DOM test library (Node 22.22.2+, 24.15+, or 26+ is required by jsdom):

```sh
npm ci
npm test
```

These tests exercise the actual editor with real compiler responses, draft recovery, replacement controls, stale diagnostics, Unicode selections, all inspection views and table pagination. Set `PYTHON` if your Python command differs from the platform default. Node packages are used only for development; running the compiler and IDE still requires only Python.

Pytest uses `src/` automatically. HTTP integration tests connect only to loopback and spawn real compiler workers. In a restricted environment that forbids local sockets, run `python -m pytest -q -m "not network"`; run the complete suite in an environment that permits loopback connections.

Optional package installation in a Python environment with packaging tools available:

```sh
python -m pip install -e ".[dev]"
polyglot serve
```

The same launcher works on other platforms: `python run_polyglot.py serve`.

## Implemented scope

The compiler includes primitive values; one-dimensional arrays; inferred/explicit declarations and const bindings; annotated functions, forward calls and recursion; both conditional/while spellings; `range`; three-part loops; `break`/`continue`; mixed indentation/braces; Python, C, C++, Java, JavaScript and BASIC output forms; static checking; typed IR; validated artifacts; and a bounded custom VM.

## Arrays

```text
values = [1, 2, 3]
int bonus[2] = {4, 5};
double[] weights = new double[3];
values[0] += bonus[1]
print(values, len(values))
```

Arrays contain one primitive element type, have fixed-length objects, and use zero-based indexing with runtime bounds checks. Sized allocations initialize elements to zero, false, or an empty string. Typed function parameters and returns accept `int[]`, `float[]`, `bool[]`, and `string[]` with existing type aliases. Arrays share references when assigned or passed to functions; array types are invariant. Empty literals require a known element type. Multidimensional arrays, slicing, resizing, and array arithmetic are unsupported.

Select `arrays_mixed.poly` in the IDE or run:

```sh
python3 run_polyglot.py run examples/arrays_mixed.poly
```

Expected output: `15`, `7`, and `[1, 7, 3, 4] 4` on separate lines. New bytecode uses format version 3; legacy scalar version 1 and array version 2 artifacts remain executable.

Python-style iteration also works over arrays declared using another syntax:

```text
int[] arr = {1, 2, 3, 4, 5};
for num in arr:
    print(num)
```

Select `array_iteration.poly` to run this example. The iterable expression is evaluated once; each loop iteration reads the next element. The loop variable is local to the loop and changing it does not write back to the array.

## Additional syntax (P1)

```text
const bonus = 2;
let values = [1, 2, 3];
function first(items: int[]): int {
    return items[0] + bonus;
}
LET result = first(values)
console.log("result", result);
printf("value=%d ratio=%f name=%s\n", result, 2.5, "ready");
PRINT "finished"
```

- JavaScript-inspired `let` and `const` infer fixed types. `const` prevents rebinding across all syntax families; array elements remain mutable. `console.log` accepts variadic arguments and adds a newline.
- JavaScript-inspired functions require Polyglot parameter and return annotations, such as `function add(a: int): int { ... }`. Forward calls, recursion and cross-syntax calls use the existing compiler/VM.
- C-inspired `printf` accepts a literal format with `%d`, `%f`, `%s`, and `%%`. `%f` prints six fractional digits; no newline is added automatically. Width, precision, `%c` and other formats are unsupported.
- BASIC-inspired uppercase `LET` creates/updates a binding and `PRINT` outputs one expression or a blank line. Identifiers remain case-sensitive. Labels, line numbers, `GOTO`, `IF ... THEN GOTO` and `END` are deferred.

Choose `p1_mixed.poly`, `javascript_style.poly`, `c_printf.poly`, or `basic_style.poly` in the IDE. The mixed example's expected output is `total 8`, `formatted: 8, 2.500000, ready`, `BASIC output`, `8`, and `done` on separate lines.

Unannotated functions, advanced error recovery, classes, other collection types, imports and general object/member operations are unsupported. The compiler stops at the first error; it never executes invalid source. Initialization and return analysis are deliberately conservative.

## Documentation

- [Language specification and support matrix](docs/language.md)
- [Supported grammar](docs/grammar.ebnf)
- [Architecture and extension points](docs/architecture.md)
- [IR, bytecode and artifact format](docs/bytecode.md)
- [Diagnostics and limits](docs/diagnostics.md)
- [Professor demonstration script](docs/demo.md)
- [Actual verification results](docs/verification.md)
- [UI design and icon maintenance](docs/ui-design.md)
- [Ember highlighting and editor maintenance](docs/highlighting.md)

## Project layout

| Location | Contents |
| --- | --- |
| `src/polyglot/` | Compiler stages, parser, artifact validation, VM, CLI and local IDE |
| `examples/` | Valid programs and intentional error examples |
| `tests/` | Compiler, HTTP and frontend regression tests |
| `docs/` | Language, architecture, demonstrations and current verification |
| `tools/` | GitHub Pages builder and icon maintenance |
| [Presentations](presentation/README.md) | Current slides and PDF preview |
| `third_party/` | Original bundled assets and required licenses |

Generated builds belong in `build/` or `dist/`. Git ignores these directories and local caches.

## License

Polyglot's original code is licensed under the [MIT License](LICENSE), copyright 2026 Harshit and Polyglot contributors.

Third-party assets and supplied reference material retain their original copyright and applicable terms. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES), including the bundled Phosphor icons' MIT notice.
