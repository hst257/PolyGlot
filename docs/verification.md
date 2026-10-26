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

## Aether visual restyling

The supplied reference was copied byte for byte into root `DESIGN.md` (matching SHA-256). Styling follows its amber/black palette and eight-pixel surfaces, with an accessible adaptation for the existing light theme. Named font preferences use locally available fallbacks; no font download or backend route was added.

A comparison with the previous commit confirmed unchanged HTML and JavaScript and identical CSS geometry, font-size/line-height and motion declarations. Changes are limited to visual tokens and panel corners. The backend is unchanged. Diff whitespace checks passed; the earlier 259-test regression result remains the baseline, and the suite was not repeated for this CSS-only change.

The live IDE ran `p1_mixed.poly` with its exact expected output and displayed `S004` for the invalid type example. Both themes rendered correctly; 390px and 768px layouts had no horizontal page overflow. Browser warnings/errors were empty. The temporary viewport override was reset.

Dark/light contrast: body text 18.12/17.85, muted text 7.52/5.25, primary action text 9.49/9.49, error text 8.60/6.52, input boundaries 3.48/3.32. Previews: [dark](ui-aether-dark.jpg) and [light](ui-aether-light.jpg). The running IDE was left in the reference's dark palette with the mixed example and IR panel selected.

## Polyglot Ember highlighting

The full Python suite remained **259 passed**. The Node tokenizer suite passed **15 tests**, covering mixed families, precedence of strings/comments, escapes, incomplete input, exact type/API recognition, arrays/operators, bracket matching, lossless source offsets, seeded malformed input and a near-limit source file. JavaScript syntax checking and diff whitespace checks passed. The backend/compiler/API files remain unchanged.

Live Chromium checks verified:

- Exact prescribed token colors, 15px/24px font metrics, matching desktop/mobile padding, identical textarea/overlay source and synchronized viewport dimensions.
- Native typing, Tab, Shift+Tab, indentation Backspace, Enter, ordinary Backspace, Delete and selected-text deletion with undo/redo. Clipboard copy/paste succeeded; the initial empty clipboard was restored.
- Active-line and matching-bracket feedback; brackets inside strings were excluded. A string containing an HTML event-handler payload created no image/script elements.
- Vertical scrolling through a 1,202-line source synchronized the textarea, highlight layer and gutter. A 2,000-character line synchronized horizontal scrolling. A 98,000-character file highlighted losslessly with readable four-digit gutter numbers. Above the highlighter limit, native plain text stayed readable and normal highlighting recovered on loading a smaller example.
- The requested `ember_demo.poly` printed `0`, `1`, `3`, `6`, `12`, `Polyglot works!`; all six inspection panels remained real compiler data.
- Build/download and subsequent bytecode upload reproduced that output after replacing editor source. Upload/run of `p1_mixed.poly` printed its expected output; saved source matched its repository file exactly.
- `S004` navigation selected the correct character while the overlay stayed synchronized. Actual compiler failure applied the prescribed `#F38BA8` focus emphasis; editing cleared it without inventing an error for incomplete source. Both page themes and the 390px layout worked; the viewport override was reset. Browser warnings/errors were empty.

The fresh verification IDE runs at `http://127.0.0.1:8766`, with the six-family example and IR selected. The existing 8765 instance had a cached example catalog, so verification used a separate fresh instance. Preview: [ui-ember.jpg](ui-ember.jpg). Limitations and browser compatibility are documented in [highlighting.md](highlighting.md).

The weakest source-token contrast is 6.49 against the editor background and 5.72 against the active-line background; gutter contrast is 5.07. All exceed the 4.5 text-contrast target.

The subsequent focus refinement removed the yellow editor outline and inset frame. In the live IDE, the focused source field reported no outline or frame shadow, while the amber caret and current-line shading remained visible. The six-family example still ran correctly; see [ui-quiet-focus.jpg](ui-quiet-focus.jpg). This was a CSS-only change with no new compiler or highlighter logic.

## Maximized IDE and resizable output

JavaScript syntax checking, all **15 Node highlighter tests**, all **4 CLI/web-worker tests**, and diff whitespace checks passed. The compiler, server, worker and API files are unchanged; the earlier full-suite result remains 259 passed and was not repeated for this frontend change.

Live Chromium verification at `http://127.0.0.1:8766` covered:

- Maximize hides the header, files, inspector and footer, leaving only the filename, Check/Build/Run/Restore toolbar, editor and output. Restore and Escape return the normal workspace. Source and selection survive; undo removes a keystroke entered before maximizing.
- An upward mouse drag enlarged output from 220px to 350px; downward dragging clamped it to the 96px minimum. Up/Down, Shift+Up, Home and End resized the pane. At maximum height the editor retained 120px. Pointer release cleared the resize state.
- Scrolling a 103-line source synchronized the editor/highlight layer while output stayed at the same bottom position. A 100-line output scrolled independently without moving the editor or page. New operation results reset console scrolling to the top.
- Check succeeded, Build downloaded bytecode, and Ctrl+Enter ran the mixed program. The six-family `p1_mixed.poly` produced its expected five-line output. An `S004` error remained readable and its diagnostic selected the correct source character.
- Both themes, a 390×844 viewport and an 844×320 landscape viewport remained usable without page overflow. The temporary viewport override was reset. Browser warning/error logs were empty.

Preview: [maximized editor](ui-maximized.png), [light theme](ui-maximized-light.png). The verification tab is left open in the dark theme with the mixed program and output. Mouse dragging and keyboard controls were exercised; physical touch-device testing remains unverified.

## Remaining work and limits

Optional BASIC labels/GOTO, benchmarks, optimization and advanced recovery remain deferred. The implemented P1 spellings are documented subsets with shared Polyglot semantics, including mandatory annotations for JavaScript-style functions and literal `printf` formats limited to `%d`, `%f`, `%s` and `%%`. Optional editable package installation was not verified: the system Python lacked wheel tooling. The dependency-free source-tree launcher was verified instead.

Rehearsal and clean setup on the actual October 19 demonstration laptop remain a release task. The implementation uses only local browser assets; no claim is made that operating-system network access was physically disabled during these checks.

## Local editor reliability update — October 25, 2026

The local update adds browser draft recovery, explicit replacement controls for edited source, revision-aware diagnostic links (including Unicode columns), and readable compiler inspection views with a Raw JSON toggle. Tables paginate and AST children expand on demand. The compiler, server, worker and artifact format are unchanged.

Verification:

- Full Python regression suite: **259 passed** on Python 3.14.6, including the real loopback HTTP tests.
- Frontend suite: **32 passed** on Node 24.18.0. The optional jsdom development dependency is locked, and a clean `npm ci` followed by `npm test` passed. Running the application does not require Node or npm packages.
- The nine editor interaction tests run the actual frontend against real Python compiler responses. They cover empty/Unicode draft restoration, replacement/cancel/Escape, a delayed example catalog, diagnostic spans and invalidation, stale asynchronous results, every inspection stage and Raw JSON, safe rendering of HTML-like source, token-table pagination, unavailable storage and unchanged older tabs.
- Live in-app browser checks confirmed mixed-demo output, local draft restoration after refresh, readable recognition/tokens/symbols/AST/IR/bytecode, and the Raw JSON toggle. A browser-native confirmation used during an intermediate test blocked further native clicks; the final replacement controls are an inline, keyboard-accessible region and are covered by the interaction tests. Final physical pointer/touch and responsive checks are not claimed.
- JavaScript syntax and diff whitespace checks passed.

Drafts are local to the browser and server origin and retain the current program only. Saving source to a file remains the durable export. Concurrent edited tabs use the most recently saved draft; an unchanged older tab does not overwrite it merely by closing.

This update is local only; no GitHub push was performed.

## Slate workspace redesign — October 25, 2026

The workspace now uses a cool slate/blue theme in both light and dark modes. The desktop layout has a collapsible, searchable program sidebar, a resizable compiler explorer and independently scrolling docked output. The semantic AST shows actual node kinds, names and checked types, with lazy children. Compiler positions navigate into source, and source selections highlight the narrowest matching visible records. Uploaded bytecode does not link into unrelated editor source.

- Full Python regression suite: **259 passed**, including real loopback HTTP operations.
- Frontend suite: **41 passed**, including the earlier draft/diagnostic tests and new cases for searching and opening examples, sidebar persistence, keyboard pane resizing and limits, compiler/source links, multiline Unicode spans, unrelated bytecode locations, output clearing, theme persistence and focus-mode restoration.
- JavaScript syntax and diff whitespace checks passed. The compiler, server, worker and artifact format are unchanged.
- Live in-app browser verification ran `mixed_demo.poly` with its six expected output lines, opened the semantic AST, and navigated from its function node to the complete source range. Dragging the inspector divider increased its width from 600px to 700px; dragging the output divider increased its height from 190px to 260px. Sidebar collapse/restore, light/dark themes and focus-mode Escape restoration worked. Browser warning/error logs were empty.
- At measured CSS widths of 389px and 769px, document scroll width matched client width. At the smaller width, the Programs drawer searched for array examples, loaded `array_iteration.poly`, closed itself and ran the program with output `1` through `5`. The temporary viewport override was reset. Physical touch-device testing is not claimed.

All assets remain local. The optional Node/jsdom tools are development-only. The previous current-draft storage format remains readable, and the new layout preferences use a separate storage key. Changes are local only; no GitHub push was performed.

## Connected AST diagram — October 25, 2026

The AST tab now defaults to a node-and-connector diagram rather than a nested outline. Node indexing follows only real AST records and their semantic child fields, excluding metadata and source-location dictionaries. The layout preserves child order and parent relationships. It supports branch toggles, top-level subtree focus, left-to-right and top-to-bottom arrangements, bounded zoom, Fit, drag-to-pan and an expanded view. Outline and complete Raw JSON remain available. Large views render up to 250 actual nodes and report the subtree total.

- Frontend regression suite: **48 passed**. New coverage checks metadata exclusion, child-field attribution, non-overlapping layouts, correct edges, branch collapse, render limits, graph controls, focus/orientation, view cleanup and source navigation from the expanded canvas.
- Python checks available without a permission escalation: **249 passed, 10 network tests deselected**. The attempted full-suite rerun did not start because automatic permission review timed out. The previous 259-test full-suite result remains the baseline; compiler/server/worker files are unchanged.
- Live browser verification compiled `result = 1 + 2 * 3` and printed `7`. The graph placed multiplication under addition, with literals attached to the correct operator. The expanded top-to-bottom view displayed all nine nodes including the output statement.
- Dragging the graph background changed its vertical scroll position; selecting the literal `2` restored the normal view and selected exactly `2` in the editor. Browser error/warning logs were empty. At a measured 390px CSS width, both graph toolbars fitted their container and document scroll width equaled client width. Temporary viewport overrides were reset.
- JavaScript syntax and diff whitespace checks passed. No runtime dependency or compiler behavior was added or changed. No GitHub push was performed.

## Reference-informed compiler design lab — October 25, 2026

Reviewed primary materials from Compiler Explorer, AST Explorer and ComVis; the reference links and precise adaptations are recorded in `docs/ui-design.md`. The local IDE now exposes a result-based pipeline ribbon, syntax-family counts and normalized AST node kinds, phase input/output explanations, readable three-address IR, VM instruction explanations, a separate execution summary and four real project walkthroughs. No compiler, worker, server, artifact-format or language-semantic changes were made.

- Complete Python regression suite: **259 passed**, including loopback HTTP tests, in 6.29 seconds.
- Frontend suite: **54 passed**. Added real-compiler interaction coverage for compile-versus-run state, result invalidation, lexical/parser/semantic/runtime failure cutoffs, protected walkthrough loading, failed-stage diagnostic navigation, source-independent artifact inspection, phase navigation and readable instruction formatting.
- JavaScript syntax and diff whitespace checks passed. No runtime dependencies or remote assets were added.
- Live browser verification ran the six-syntax demo with its five expected output lines and measured representation counts. A three-address call linked to exactly `sum_values(values)` in the editor. The semantic-error demo retained available lexer/parser data, stopped Types & scopes at S004 and blocked IR/bytecode/VM; compilation was correctly distinguished from execution. Both light and dark layouts were reviewed.
- At a measured **389px CSS width**, document scroll width equaled client width. The pipeline scrolled inside its own region. The Programs drawer loaded the Braces + indentation walkthrough, closed itself and printed `22`; VM summary reported 219 executed instructions. Browser warning/error logs were empty and the temporary viewport override was reset.

The ribbon does not simulate phase timing. Recognition and AST are outputs of one parser pass. Execution is a run summary, not live stepping; a failed run does not invent an instruction count when the VM did not return one. Optimization and multiple-error recovery remain deferred. Changes remain local; no GitHub push was performed.

## Compiler optimization — October 26, 2026

Removed the coursework/module interface, syllabus catalog, teaching-only endpoint, VM recording, extra demo and related documents. The implementation now uses actual control-flow, liveness and next-use analysis inside the compiler's optimization pass before generating bytecode. The normal workspace and prior compiler views remain.

- Full Python suite: **296 passed** in 7.54 seconds. New differential cases cover constant arithmetic, Boolean branches, all valid bundled examples, calls/output ordering, short-circuit behavior, arrays, runtime diagnostics, floating overflow, negative remainder semantics, cross-block temporary liveness and overwritten definitions. Oversized functions retain original IR.
- Frontend suite: **54 passed**. The VM step-count expectation reflects actual optimized bytecode. Existing source recovery, diagnostics, AST/source navigation, pane controls and stage views still pass.
- Real HTTP checks confirm that default compilation optimizes, `optimize: false` disables it, and the removed coursework routes return 404.
- `print((2 + 3) * 4)` produces the same `20` output with **17 bytecode instructions unoptimized and 5 optimized**. The original IR remains available; optimized IR and actual pass counts can be inspected through CLI/API results.

Only proven primitive constants are folded. Constant branches can remove unreachable blocks; liveness and definition-sensitive next use remove safe unused constant temporaries. Reachable calls, loads, stores, output, array checks and potentially failing arithmetic/conversions are retained. The artifact version and source-independent execution remain compatible. No GitHub push was performed.
