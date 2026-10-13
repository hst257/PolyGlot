# Workspace design

## Direction and audit

An editor-first educational workspace, using native HTML/CSS/JavaScript. The redesign keeps the Polyglot wordmark, green accent, operation labels, DOM integration IDs and compiler API. The previous UI used Segoe UI/Consolas, green `#285d42`, small rounded controls and three columns. Large introductory copy competed with the editor; controls and compiler JSON lacked a clear hierarchy.

Settings: `DESIGN_VARIANCE: 5`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 6`. This is a product interface, so marketing-specific hero, imagery and scroll-animation rules do not apply. The textarea and its editing behavior are preserved.

## Visual rules

- One green accent across a neutral workspace. Error colors express errors only.
- Segoe UI/system sans for controls; Consolas/system monospace for source, output and inspection. No remote fonts.
- Eight-pixel control corners, twelve-pixel panel corners, square internal pane divisions. Pills are reserved for status and syntax tags.
- Source occupies the largest pane; output sits below; real compiler stages occupy a separate inspector.
- Light/dark tokens apply to the whole page. The initial theme follows the system; a manual toggle persists locally when storage is available.
- Hover, press and focus feedback only. Reduced-motion preferences remove transitions.
- Below 1024px the inspector moves below the editor; below 768px the sidebar becomes a compact top section. No horizontal page scrolling.

## Icons and backend boundary

Official regular-weight SVGs come from `@phosphor-icons/core@2.1.1`. Originals and MIT license are in `third_party/phosphor/`. `tools/vendor_phosphor.py` regenerates the inline HTML sprite. Icons inherit text color and are hidden from assistive technology; controls retain text or accessible labels.

The sprite works with the existing static-file allowlist and Content Security Policy. Server, worker, compiler, artifact format and API remain unchanged. Everyday development needs no Node installation or asset build step.
