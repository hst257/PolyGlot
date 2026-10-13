# Verification report

Verified on October 13, 2026, with Python 3.11.8 and pytest 8.2.0.

## Automated checks

`python -m pytest -q`: **259 passed, 0 failed**. The complete suite includes ten real loopback HTTP tests with spawned compiler workers. Restricted sandbox client networking required running those checks outside the socket restriction.

Coverage includes lexer/source positions, comments/strings, structural parsing, grammar attribution, AST normalization, expression/type/scope behavior, definite assignment, functions/recursion, loop variants/control, short-circuiting, artifact validation/round trips, CLI streams/exit codes, web operations and execution limits. Seeded malformed-input checks also exercise parser termination.

Array coverage includes literals, all primitive element types, typed C/Java-style declarations, default allocation, empty/contextual literals, indexed assignments, argument/return types, reference sharing, fresh allocations, evaluation order, bounds, length/resource limits, invalid array bytecode and version 1 compatibility.

Array iteration coverage includes Java/C++ declarations with Python-style for-in loops, all primitive element types, empty arrays, iterator evaluation once, loop-variable scope, element copying, captured references, mutations, nested/mixed blocks, continue/break, typed functions and non-array diagnostics.

P1 coverage includes inferred `let`/`const` declarations, constant reassignment across syntaxes, annotated JavaScript-style functions, recursion/forward calls, `console.log`, restricted `printf`, uppercase BASIC `LET`/`PRINT`, recognition of all six syntax families, evaluation order, formatting type/arity checks, large output chunking, version 3 artifact validation and version 2 compatibility.

`node --check src/polyglot/web/static/app.js` and Python `compileall` completed without errors.

## End-to-end demonstrations

- `mixed_demo.poly`: `0`, `1`, `3`, `6`, `12`, `done` on separate lines.
- `mixed_nesting.poly`: `22`.
- CLI build and exec produced the same output. An automated test deletes the source before executing its artifact.
- A fresh virtual environment created with `--without-pip` ran both mandatory programs through the source-tree launcher. No compiler runtime packages were installed.
- `arrays_mixed.poly`: `15`, `7`, and `[1, 7, 3, 4] 4`. CLI build/exec and real HTTP build/exec produced the same result. The existing saved version 1 mixed-demo artifact also executed successfully with the updated VM.
- `array_iteration.poly`: `1` through `5` on separate lines. CLI run/build/exec, HTTP build/exec, and the live IDE all produced the expected result using a Java-style array declaration with a Python-style for-in loop.
- `p1_mixed.poly`: `total 8`, `formatted: 8, 2.500000, ready`, `BASIC output`, `8`, and `done` on separate lines. CLI run/build/exec, real HTTP build/exec and the live IDE produced the same output. The saved version 1 mixed-demo and version 2 array artifacts still execute under the version 3 compiler/VM.

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

For the array update, the live IDE ran `arrays_mixed.poly`, displayed `int[]` symbols and real array IR instructions, and reported `R012` for an out-of-bounds access with its source location. The array example was restored and left open; see [arrays-demo.jpg](arrays-demo.jpg).

For the iteration fix, the IDE ran `array_iteration.poly` and exposed the actual `ForEach` AST and its array/branch IR. That example was left open; see [array-iteration.jpg](array-iteration.jpg).

For P1, a separate IDE tab ran `p1_mixed.poly` successfully. Recognition showed JavaScript, Python, BASIC, C, Java and C++; Symbols showed the inferred array type and immutable `bonus` binding; IR contained real `FORMAT` instructions. A BASIC assignment to a JavaScript-style constant reported `S028` at line 2. The working mixed example was restored and left open; see [p1-demo.jpg](p1-demo.jpg).

For indentation Backspace, nine live-browser checks verified Tab-created and Enter-created indentation, moving from eight spaces to four and four to zero, preserving following code, and ordinary deletion off boundaries, after code, within code, with selected whitespace and at a line start. The cursor and source-change status updated correctly. A program ran successfully after deleting one indentation level; see [indentation-backspace.jpg](indentation-backspace.jpg). JavaScript syntax checking and diff whitespace checks passed; the compiler code was unchanged.

## UI refactor verification

The complete regression suite remained **259 passed**. JavaScript syntax and diff whitespace checks passed. The backend, compiler and API files have no changes.

Vendored SVGs and license matched the official npm package byte for byte. Sprite regeneration was deterministic, and every HTML icon reference resolved to a bundled symbol.

Live browser checks verified:

- The P1 mixed example's exact output and all six real inspection panels.
- Build/download of version 3 bytecode, followed by upload/execution after replacing editor source; original output was preserved.
- Upload/run of `mixed_nesting.poly` produced `22`; source download matched the repository file exactly.
- Type diagnostics navigated to the correct source selection; an infinite loop reported `R001`, and a subsequent valid run succeeded.
- Busy state disabled compilation actions while stage navigation remained usable. Completed operations restored the controls.
- Tab, Shift+Tab, Enter autoindent, indentation Backspace, ordinary Backspace and Ctrl+Enter worked. Arrow/Home/End stage navigation updated the selected tab and panel label.
- Light/dark themes, persisted manual theme, empty states and actual Phosphor glyphs rendered correctly under the existing Content Security Policy.
- At 390px, 768px and 1024px viewport widths, document scroll width did not exceed client width. The inspector moved below the editor at tablet width; mobile stacked the workspace and retained file/run controls. The temporary viewport override was reset.

Measured contrast ratios in light/dark themes: body text 12.96/13.41, muted text 5.22/7.12, primary button text 7.40/8.46, error text 6.42/7.60 and select boundaries 3.25/3.53. The UI uses system fonts and locally embedded icons, with no added runtime network requests. No Lighthouse or Core Web Vitals measurements are claimed.

Saved previews: [light](ui-redesign-light.jpg), [dark](ui-redesign-dark.jpg), [mobile](ui-redesign-mobile.jpg). The IDE was left running with `p1_mixed.poly` and IR selected. Design tokens, scope and icon regeneration are documented in [ui-design.md](ui-design.md).

## Remaining work and limits

Optional BASIC labels/GOTO, benchmarks, optimization and advanced recovery remain deferred. The implemented P1 spellings are documented subsets with shared Polyglot semantics, including mandatory annotations for JavaScript-style functions and literal `printf` formats limited to `%d`, `%f`, `%s` and `%%`. Optional editable package installation was not verified: the system Python lacked wheel tooling. The dependency-free source-tree launcher was verified instead.

Rehearsal and clean setup on the actual October 19 demonstration laptop remain a release task. The implementation uses only local browser assets; no claim is made that operating-system network access was physically disabled during these checks.
