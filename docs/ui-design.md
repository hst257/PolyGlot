# Slate workspace

## Direction

The current interface is a compact, viewport-based IDE with a slate and blue palette. The October 25 request to redesign the workspace and change the theme supersedes the older Aether styling and geometry guidance in `DESIGN.md`; that file is retained as a historical reference.

The editor and compiler explorer share the available width instead of sitting inside large cards. A searchable program list replaces the static introduction and always-visible support information. Output is docked below the editor and remains visible during normal use. The original textarea, native editing, undo history, compiler API and offline assets are preserved.

## Layout and controls

- The desktop page has a 58px header, a flexible workspace and a 30px footer. Source, examples, compiler records and output scroll independently.
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

Recognition, tokens and symbols use tables. IR and bytecode show collapsible functions with instruction tables. AST nodes show their actual kind, name and checked type, with children loaded on expansion. Every view retains a Raw JSON toggle with the original compiler representations. Brief descriptions explain each stage; empty states direct users to Run or Check.

Source position buttons navigate to the corresponding range, accounting for Unicode columns and multiline spans. Selecting source highlights the narrowest matching visible compiler records. Collapsed AST descendants do not hide a matching visible ancestor. Editing invalidates these records through the existing revision checks. Uploaded bytecode cannot create source-navigation links into unrelated editor text.

Tables reveal 200 rows at a time, and tree collections reveal 100 children at a time. Rendering uses text nodes throughout, including source strings that resemble HTML.

## Assets and backend boundary

Official, regular-weight Phosphor symbols are reused from the existing inline sprite. No icon family, remote font, external asset or runtime package has been added. Originals and licenses remain in `third_party/phosphor/`. `tools/vendor_phosphor.py` regenerates the sprite.

The compiler, server, worker, API and artifact format are unchanged. Node and jsdom are optional development tools for the editor interaction tests; the running app still requires only Python.
