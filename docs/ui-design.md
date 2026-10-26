# Slate workspace

## Direction

The current interface is a compact, viewport-based IDE with a slate and blue palette. The October 25 request to redesign the workspace and change the theme supersedes the older Aether styling and geometry guidance in `DESIGN.md`; that file is retained as a historical reference.

The editor and compiler explorer share the available width instead of sitting inside large cards. A searchable program list replaces the static introduction and always-visible support information. Output is docked below the editor and remains visible during normal use. The original textarea, native editing, undo history, compiler API and offline assets are preserved.

## Layout and controls

- The desktop page has a 58px header, an 84px pipeline ribbon, a flexible workspace and a 30px footer. Source, examples, compiler records and output scroll independently.
- The Programs button collapses the 216px sidebar (200px on narrower desktops). Examples are searchable by their actual filenames. Language support is a disclosure at the bottom, alongside file actions.
- The compiler explorer starts at approximately 32% of viewport width, bounded by available editor space. Its vertical separator supports pointer dragging, Left/Right, Shift for larger steps, Home and End. The editor retains at least 400px in desktop layouts.
- The output divider supports dragging, Up/Down, Shift, Home and End in both normal and focus modes. Height bounds preserve room for editing. The output heading includes its line count and Clear action.
- Sidebar state and divider sizes persist under `polyglot-layout-v1` when browser storage is available. Corrupted or unavailable storage falls back to usable defaults.
- Focus mode keeps the same textarea and output, hides surrounding panels, and restores through the maximize button or Escape.
- At 1000px and below, the inspector stacks beneath the editor and Programs opens a drawer with a backdrop. The drawer closes after loading an example. The desktop inspector width is preserved while stacked. Smaller screens retain Run, Check, Build and focus controls without page-width overflow.

## Theme and typography

Both themes use blue `#2563eb` primary actions with white text. Dark mode uses slate backgrounds (`#0b1019`, `#111925`, `#0d1420`), soft blue highlights, mint success feedback and rose errors. Light mode uses white and cool gray surfaces with darker syntax colors. The system preference remains the default and the existing manual theme selection persists.

The source editor uses 15px/24px local monospace text, with a 13px adaptation below 600px. Token categories retain their existing meaning, with theme-aware purple keywords, blue functions, teal types, green strings and warm numeric literals. Source padding and font metrics remain identical in the textarea and overlay.

Controls use compact six-pixel corners and restrained borders. Status color communicates compiler results, not decorative emphasis. Focus indicators remain visible, forced-color mode exposes native source text, and reduced-motion preferences suppress animation.

## Compiler explorer

Recognition, tokens and symbols use tables. IR and bytecode show collapsible functions with instruction tables. The default AST view draws actual compiler nodes as connected cards. Branch controls expand or collapse descendants; a focus selector isolates a top-level subtree. Horizontal and vertical layouts, zoom, Fit, background panning and an expanded canvas make larger trees navigable. Nodes show their kind, name, checked type and source line. Outline is an optional alternative. The graph renders at most 250 nodes per view and reports the visible/total subtree count, so large programs should be explored through focus and branch controls. Every view retains a Raw JSON toggle with the original compiler representations. Brief descriptions explain each stage; empty states direct users to Run or Check.

Source position buttons navigate to the corresponding range, accounting for Unicode columns and multiline spans. Selecting source highlights the narrowest matching visible compiler records. Collapsed AST descendants do not hide a matching visible ancestor. Selecting a diagram node from the expanded canvas first restores the inspector so the source selection is visible. Graph observers and keyboard handlers are removed when switching views. Editing invalidates these records through the existing revision checks. Uploaded bytecode cannot create source-navigation links into unrelated editor text.

Tables reveal 200 rows at a time, and tree collections reveal 100 children at a time. Rendering uses text nodes throughout, including source strings that resemble HTML.

## Assets and backend boundary

Official, regular-weight Phosphor symbols are reused from the existing inline sprite. No icon family, remote font, external asset or runtime package has been added. Originals and licenses remain in `third_party/phosphor/`. `tools/vendor_phosphor.py` regenerates the sprite.

The compiler, server, worker, API and artifact format are unchanged. Node and jsdom are optional development tools for the editor interaction tests; the running app still requires only Python.

## Reference-informed compiler lab

The October 25 compiler-design update uses these primary references, reviewed on October 25, 2026:

| Reference | Pattern adapted for Polyglot |
| --- | --- |
| [Compiler Explorer](https://github.com/compiler-explorer/compiler-explorer/blob/main/docs/WhatIsCompilerExplorer.md) | Keep source beside generated instructions, preserve source mapping, and explain instructions at the point of inspection. Polyglot's bytecode rows explain their stack effect and resolve constant values, function names and jump offsets. |
| [AST Explorer](https://github.com/fkling/astexplorer#more-features) and [its live interface](https://astexplorer.net/) | Keep readable tree and raw representations together, with links between nodes and source. Polyglot retains the connected diagram, optional outline and complete JSON, plus an explanation of AST versus grammar derivation. |
| [ComVis intermediate-code visualizer](https://comvis.pr.ac.rs/makeTree.jsp) | Make teaching stages, syntax-tree inspection, symbol information and three-address code explicit. Polyglot adds a real-result pipeline ribbon, phase explanations and runnable project demonstrations. |

These are interaction references, not copied source or assets. No external compiler, service, AI-generated stage data or runtime dependency was introduced.

The ribbon shows Lexer → Syntax map → AST → Types & scopes → Typed IR → Bytecode → VM execution. Syntax map and AST belong to the same parser pass; the disclosure says so explicitly. It is navigation over returned results, not a simulated compiler animation. Counts come from actual compiler records. Parser failure leaves recognition incomplete because that output is published only after parsing finishes. Lexical, parser and semantic diagnostics identify the stopped view; later representations are blocked. Unknown/internal/request failures do not invent a completed or failed phase. Editing invalidates the result. A successful Check/Build leaves the VM marked Not run. An uploaded artifact exposes no source-stage data or links into unrelated editor text.

The Syntax map groups distinctive and shared syntax families without double-counting candidate groups. Its table includes the actual normalized node kind, letting a presenter follow different spellings into common compiler structures. Typed IR is formatted as three-address notation with temporary names, types, storage slots, labels, branches and named calls. The bytecode listing distinguishes static generated instructions from the VM's dynamic instruction count. Every original operand remains available in JSON.

Project walkthrough is a sidebar disclosure containing four existing examples. Loading one runs the real compiler and selects the relevant view; the existing edited-source replacement guard also applies. Phase disclosures explain input, output and key concepts. Previous/Next controls supplement keyboard-operable tabs. The VM view is a result summary; it does not claim instruction stepping, live stack tracing or an optimizer.

At small widths the pipeline scrolls horizontally within its own region and the inspector stays below the editor. The sidebar drawer begins below the ribbon and closes after a demo loads. The existing theme, focus mode, draft recovery and pane resizing remain available.

## Syllabus coursework view

The October 26 Coursework view is a modal workspace with six syllabus modules, explicit coverage labels, optional live analyses and whitelisted implementation excerpts. It uses the same local theme and official Phosphor sprite. Background controls are inert while it is open; focus is trapped, Escape closes it, and source links close it before selecting editor text. The sidebar becomes a horizontal module scroller below 800px. Inner tables, diagrams and code excerpts scroll without widening the page.

Analysis is opt-in through the worker, calculated by a shared Python module, and never rewrites bytecode. CFG cards have real directed connectors and selectable block facts. Next-use information reports only within-block positions and conservative live-out state. VM playback moves through captured pre-instruction snapshots, including complete short examples and clearly bounded prefixes. It is recorded playback, not a paused execution debugger. Source edits and older response revisions invalidate associated data through the existing result lifecycle.

The catalog documents all 35 distinct screenshot topics, including missing LLVM/Lex/DFA/parser-generator/optimizer/register-allocation features. It describes procedural type attributes and Pratt parsing precisely instead of labeling them as different formal algorithms. Details and presentation guidance live in `docs/syllabus.md`.
