# Polyglot

An offline educational compiler and browser IDE for a **restricted mixed-syntax language** with selected Python, C, C++, Java, JavaScript and BASIC-inspired spellings. It has its own grammar, types, scopes, bytecode and stack VM. It does not compile arbitrary programs from those languages.

## Run locally

Python 3.11 or newer is required. The compiler and IDE have **no third-party runtime dependencies**. From PowerShell in this repository:

```powershell
python .\run_polyglot.py serve
```

Open **http://127.0.0.1:8765**. Select `mixed_demo.poly` and click **Run**. The expected output is:

```text
0
1
3
6
12
done
```

The IDE includes source editing, Check, Run, Build/download, source upload/download, bytecode upload/execution, diagnostics and actual recognition/token/AST/symbol/IR/bytecode inspection. Its editor-first workspace adapts to smaller screens, follows the system light/dark theme and offers a manual theme toggle. Official Phosphor icons are bundled locally with their MIT license.

Ctrl+Enter runs; Tab/Shift+Tab indent or unindent selected lines. Backspace removes one four-space indentation level when the cursor has no selection and sits at a leading indentation boundary; elsewhere it deletes normally. Arrow keys, Home and End navigate compiler stage tabs. The entire application works offline and uses system fonts and bundled assets.

Press Ctrl+C in the server terminal to stop it. Use `serve --port 8766` if port 8765 is occupied.

## CLI

```powershell
python .\run_polyglot.py check .\examples\mixed_demo.poly
python .\run_polyglot.py run .\examples\mixed_demo.poly
python .\run_polyglot.py build .\examples\mixed_demo.poly -o .\build\mixed_demo.pbc
python .\run_polyglot.py exec .\build\mixed_demo.pbc
python .\run_polyglot.py inspect .\examples\mixed_demo.poly --syntax --symbols --ir
python .\run_polyglot.py run .\examples\mixed_nesting.poly
```

The second mandatory example prints `22`. Built `.pbc` JSON artifacts contain everything needed for execution and source-based runtime errors; the source file is not needed by `exec`.

Inspection switches: `--tokens`, `--syntax`, `--ast`, `--symbols`, `--ir`, `--bytecode`. Omit switches to inspect all stages. `--json` enables structured CLI results/diagnostics. Exit codes: 0 success; 2 invalid invocation; 3 compilation failure; 4 runtime failure; 5 file/artifact failure. Program output goes to stdout; errors go to stderr.

Execution limits are configurable:

```powershell
python .\run_polyglot.py run .\examples\recursion.poly --steps 10000 --recursion 32 --timeout 2 --output-limit 8192
```

## Development and tests

The source-tree launcher avoids installation and works offline. Tests require pytest:

```powershell
python -m pip install pytest
python -m pytest -q
```

Pytest uses `src/` automatically. HTTP integration tests connect only to loopback and spawn real compiler workers. In a restricted environment that forbids local sockets, run `python -m pytest -q -m "not network"`; run the complete suite in an environment that permits loopback connections.

Optional package installation in a Python environment with packaging tools available:

```powershell
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

```powershell
python .\run_polyglot.py run .\examples\arrays_mixed.poly
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

Unannotated functions, advanced error recovery, optimization, classes, other collection types, imports and general object/member operations are unsupported. The compiler stops at the first error; it never executes invalid source. Initialization and return analysis are deliberately conservative.

## Documentation

- [Language specification and support matrix](docs/language.md)
- [Supported grammar](docs/grammar.ebnf)
- [Architecture and extension points](docs/architecture.md)
- [IR, bytecode and artifact format](docs/bytecode.md)
- [Diagnostics and limits](docs/diagnostics.md)
- [Professor demonstration script](docs/demo.md)
- [Actual verification results](docs/verification.md)
- [UI design and icon maintenance](docs/ui-design.md)
- [Supplied visual reference](DESIGN.md)

Compiler modules live in `src/polyglot/`; the offline interface lives in `src/polyglot/web/static/`. `examples/` contains valid and intentionally invalid programs. Presentation deliverables remain in `presentation/output/`.
