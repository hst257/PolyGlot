# Polyglot Ember editor

## Implementation

The existing textarea remains the editable source of truth. A read-only, `aria-hidden` highlighted layer sits underneath it. The combined visual tokenizer and editor integration live in `src/polyglot/web/static/app.js`; no library, build step, CDN or new server route is required.

Tokenization covers keywords, implemented primitive/type aliases, function declarations/calls, exact built-in output APIs, Boolean constants, integers/floats/exponents, operators, punctuation/arrays, quoted strings and all three comment styles. String/comment scanning precedes code classification. Types use exact names rather than capitalization. Function colors use declaration/call context.

Strings end at a real newline; Polyglot has no supported multiline/triple-quoted strings. Block comments may span lines. Incomplete input stays readable without synthetic error markers. Deferred BASIC `THEN`/`GOTO` receive visual keyword colors only; unsupported constructs and null-like constants retain the existing compiler behavior.

Error emphasis uses the Ember error color only after the compiler/VM reports an actual failure for the current source. Editing clears that emphasis; live tokenization never invents red syntax errors.

Every rendered source segment uses `textContent` or a text node. No source is parsed as HTML. The overlay has an invisible final-line sentinel; the textarea alone supplies source to Check, Run, Build and downloads.

## Editing and appearance

The requested Ember palette applies only to the source area. Code uses 15px monospace with 24px line height, matching four-space tabs, an amber caret, active-line background, readable line numbers and matched-bracket backgrounds. The gutter expands for larger line counts. The page's Aether palette, Phosphor icons and panel arrangement remain intact.

The textarea and overlay share font metrics and padding. Their scroll positions and viewport sizes synchronize on scrolling/resizing; bracket decoration uses cached pairs. Tokenization and gutter rebuilding occur only when source changes. Files above 16,000 characters debounce rendering for 70ms and show current plain text while pending. Above 262,144 characters, highlighting falls back to plain text (already beyond the compiler's 128KiB input limit). Forced-colors mode also exposes readable native text.

Custom Tab, Shift+Tab, Enter and indentation Backspace use text editing commands to retain native undo history in the verified Chromium browser. An older-browser `setRangeText` compatibility fallback retains editing but cannot guarantee undo for these custom operations. See [MDN editing command documentation](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand) for the deprecated API's undo behavior. Native typing, selection, clipboard operations and deletion remain textarea operations; the editable DOM is never rebuilt.

## Verification and maintenance

Run `node --test tests/web/highlighting.test.cjs` for the dependency-free visual tokenizer tests. Node is a development/test tool, not an IDE runtime requirement. Run `python -m pytest -q` for compiler/API regressions.

`examples/ember_demo.poly` contains the requested mixed-language sample; its output is `0`, `1`, `3`, `6`, `12`, `Polyglot works!` on separate lines. The IDE also bundles it in its example selector. `p1_mixed.poly` demonstrates all six syntax families.

Highlighting is lexical, not compiler validation or language inference. The compiler remains authoritative for syntax, types, unsupported constructs and executable artifacts. Add visual-token tests when extending frontend vocabulary; do not enable compiler features through highlighting changes.
