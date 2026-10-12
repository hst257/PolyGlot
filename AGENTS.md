Whatever action you can do yourself, Please do yourself, this includes starting apps and verification

# Repository Guidelines

## Project Structure & Module Organization

The compiler is implemented in Python, with presentation deliverables preserved in `presentation/output/`.

Use the existing structure:
- `src/polyglot/`: compiler stages, artifact loader, VM, and CLI.
- `src/polyglot/parser/`: shared grammar and syntax-family parsers.
- `src/polyglot/web/`: local server, worker, and bundled frontend assets.
- `tests/`: unit tests, integration tests, and positive/negative fixtures.
- `examples/` and `docs/`: runnable programs and language/architecture documentation.

Preserve presentation deliverables and keep generated build artifacts separate from source.

## Build, Test, and Development Commands

Run from the repository root; the source-tree launcher works without package installation:

- `python -m pip install -e ".[dev]"`: optional editable installation with packaging tools available.
- `python -m pytest`: run automated tests.
- `python run_polyglot.py serve`: start the offline IDE.
- `python run_polyglot.py run examples/mixed_demo.poly`: compile and execute source.
- `python run_polyglot.py build examples/mixed_demo.poly -o build/mixed_demo.pbc`: create reusable bytecode.
- `python run_polyglot.py exec build/mixed_demo.pbc`: execute the artifact independently.

Keep README commands consistent with implemented entry points.

## Coding Style & Naming Conventions

Use Python 3.11, four-space indentation, type annotations, and small modules. Use `snake_case` for functions/modules, `PascalCase` for classes, and `UPPER_SNAKE_CASE` for constants. No formatter or linter is currently configured.

Use plain HTML, CSS, and JavaScript with locally bundled assets.

## Architecture & Safety

Preserve the real lexer → parser → AST → semantics → typed IR → bytecode → VM pipeline. CLI and IDE must share the compiler library.

Never simulate compiler stages or execute user programs using `eval`, `exec`, or external language runtimes. Validate artifacts and enforce execution limits.

## Testing Guidelines

Use pytest with `test_*.py` files and `test_*` functions. Test every grammar or semantic change, including negative cases. Assert mixed-program outputs, nested block behavior, diagnostic locations, and source-independent artifact execution. Prioritize P0 correctness before optional syntax.

## Commit & Pull Request Guidelines

Use descriptive imperative commits, preferably `feat:`, `fix:`, `test:`, or `docs:`.

Automatically commit and push stable versions after relevant tests and verification pass. Review the diff and commit only changes for the current task, then push to the configured remote and branch. Never force-push. If a remote, credentials, or branch permissions prevent pushing, retain the stable local commit and report the blocker.

PRs should explain behavior changes, actual test results, and limitations. Include screenshots for IDE changes and explicitly identify deferred features.
