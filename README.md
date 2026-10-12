# Polyglot

An offline educational compiler and browser IDE for a **restricted mixed-syntax language** inspired by Python, C++ and Java. It has its own grammar, types, scopes, bytecode and stack VM. It does not compile arbitrary programs from those languages.

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

The IDE includes source editing, Check, Run, Build/download, source upload/download, bytecode upload/execution, diagnostics and actual recognition/token/AST/symbol/IR/bytecode inspection. Ctrl+Enter runs; Tab/Shift+Tab indent or unindent selected lines. The entire application works offline and uses system fonts and bundled assets.

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

P0 includes primitive values; inferred/explicit declarations; annotated functions, forward calls and recursion; both conditional/while spellings; `range`; three-part loops; `break`/`continue`; mixed indentation/braces; all three output forms; static checking; typed IR; validated artifacts; and a bounded custom VM.

Optional C `printf`, JavaScript and BASIC syntax are **disabled**. Unannotated functions, advanced error recovery, optimization, classes, collections, imports and general object/member operations are unsupported. The compiler stops at the first error; it never executes invalid source. Initialization and return analysis are deliberately conservative.

## Documentation

- [Language specification and support matrix](docs/language.md)
- [Supported grammar](docs/grammar.ebnf)
- [Architecture and extension points](docs/architecture.md)
- [IR, bytecode and artifact format](docs/bytecode.md)
- [Diagnostics and limits](docs/diagnostics.md)
- [Professor demonstration script](docs/demo.md)
- [Actual verification results](docs/verification.md)

Compiler modules live in `src/polyglot/`; the offline interface lives in `src/polyglot/web/static/`. `examples/` contains valid and intentionally invalid programs. Presentation deliverables remain in `presentation/output/`.
