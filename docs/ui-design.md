# Workspace design

## Direction and audit

An editor-first educational workspace, using native HTML/CSS/JavaScript. The initial redesign kept the Polyglot wordmark, green accent, operation labels, DOM integration IDs and compiler API. The earlier UI used Segoe UI/Consolas, green `#285d42`, small rounded controls and three columns. Large introductory copy competed with the editor; controls and compiler JSON lacked a clear hierarchy.

The current visual reference is the supplied [DESIGN.md](../DESIGN.md), copied without changes. Apply its Aether colors and surface treatment to Polyglot's existing UI. The user's restyling constraint takes precedence over reference instructions about composition, spacing, content or new effects: preserve the existing structure, layout and animations.

Settings: `DESIGN_VARIANCE: 5`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 6`. This is a product interface, so marketing-specific hero, imagery and scroll-animation rules do not apply. The textarea and its editing behavior are preserved.

The source area now uses the separately requested Polyglot Ember syntax palette and 15px/24px monospace metrics. The surrounding page continues to follow DESIGN.md. See [highlighting.md](highlighting.md) for tokenization, overlay synchronization, editing and limitations.

## Visual rules

- Dark mode uses reference amber `#F59E0B`, background `#050505`, surface `#1A1510`, white text, muted `#A1A1AA` and border `#27272A`. Main actions use reference amber with near-black text in both themes. The existing light theme uses warm neutrals and darker amber for readable accent text. Error colors express errors only.
- Inter and JetBrains Mono are the first font choices, with the existing locally available system fallbacks. Font sizes and line heights remain unchanged to preserve layout. No remote font requests or backend changes are introduced.
- Eight-pixel control and panel corners, square internal pane divisions. Pills are reserved for status and syntax tags.
- Source occupies the largest pane; output sits below; real compiler stages occupy a separate inspector.
- Light/dark tokens apply to the whole page. The initial theme follows the system; a manual toggle persists locally when storage is available.
- Hover, press and focus feedback only. Reduced-motion preferences remove transitions.
- Below 1024px the inspector moves below the editor; below 768px the sidebar becomes a compact top section. No horizontal page scrolling.

## Icons and backend boundary

Official regular-weight SVGs come from `@phosphor-icons/core@2.1.1`. Originals and MIT license are in `third_party/phosphor/`. `tools/vendor_phosphor.py` regenerates the inline HTML sprite. Icons inherit text color and are hidden from assistive technology; controls retain text or accessible labels.

The sprite works with the existing static-file allowlist and Content Security Policy. Server, worker, compiler, artifact format and API remain unchanged. Everyday development needs no Node installation or asset build step.
