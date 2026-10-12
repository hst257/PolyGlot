# Verification report

Verified on October 13, 2026, with Python 3.11.8 and pytest 8.2.0.

## Automated checks

`python -m pytest -q`: **106 passed, 0 failed**. The complete suite includes seven real loopback HTTP tests with spawned compiler workers. Restricted sandbox client networking required running those checks outside the socket restriction.

Coverage includes lexer/source positions, comments/strings, structural parsing, grammar attribution, AST normalization, expression/type/scope behavior, definite assignment, functions/recursion, loop variants/control, short-circuiting, artifact validation/round trips, CLI streams/exit codes, web operations and execution limits. Seeded malformed-input checks also exercise parser termination.

`node --check src/polyglot/web/static/app.js` and Python `compileall` completed without errors.

## End-to-end demonstrations

- `mixed_demo.poly`: `0`, `1`, `3`, `6`, `12`, `done` on separate lines.
- `mixed_nesting.poly`: `22`.
- CLI build and exec produced the same output. An automated test deletes the source before executing its artifact.
- A fresh virtual environment created with `--without-pip` ran both mandatory programs through the source-tree launcher. No compiler runtime packages were installed.

## Browser checks

Opened the running IDE at `http://127.0.0.1:8765` and verified:

- Run produced the exact mandatory mixed-program output.
- All six inspection panels contained actual compiler representations.
- Build downloaded a `.pbc`; artifact upload/execution reproduced its output.
- Source upload ran the nested-block example and printed `22`.
- Source download contents matched the repository example.
- Check showed `S004` at line 2 for the type-error example; clicking it selected the correct source position.
- Tab/Shift+Tab indented/unindented a multiline selection without deleting its contents.

The saved preview is [ide-demo.jpg](ide-demo.jpg). The IDE was left running with the main mixed example and IR panel selected.

## Remaining work and limits

P1 syntax, benchmarks, optimization and advanced recovery remain disabled. Optional editable package installation was not verified: the system Python lacked wheel tooling. The dependency-free source-tree launcher was verified instead.

Rehearsal and clean setup on the actual October 19 demonstration laptop remain a release task. The implementation uses only local browser assets; no claim is made that operating-system network access was physically disabled during these checks.
