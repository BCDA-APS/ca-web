# UI Rendering Pipeline

High-level overview of how a caQtDM `.ui` file becomes a React tree.
Implementation lives in `src/lib/uiParser.ts` and `src/lib/UiRenderer.tsx`.

## Pipeline

```
.ui (Qt Designer XML)
  └─ uiParser.ts  → ParsedUi { nativeWidth, nativeHeight, widgets[] }
       └─ UiRenderer.tsx → React tree
            ├─ widget dispatch (caLabel, caLineEdit, …)
            ├─ macro substitution ($(VAR))
            ├─ baseDir resolution for caInclude / caRelatedDisplay
            ├─ visibility evaluation (channel / visibility / visibilityCalc)
            └─ tab and frame layout
```

## Parser

`uiParser.ts` walks Qt Designer XML and emits a typed `ParsedWidget`
tree:

```ts
interface ParsedWidget {
  class: string;            // "caLineEdit", "caGraphics", …
  name: string;
  geometry: { x, y, width, height };
  props: Record<string, string>;   // all properties; colors as "rgba(…)"
  zIndex: number;
  tabs?: ParsedTab[];       // QTabWidget only
  children?: ParsedWidget[]; // caFrame only — children are positioned
                             //   relative to the frame, not flattened
}
```

Geometry is absolute Qt pixels. The renderer scales the parsed tree to
fit the host container while preserving aspect ratio.

## Renderer

`UiRenderer.tsx` is currently a single ~2.5k-line module. It contains:

- **Contexts** — `OpenContext` (opens nested displays as overlays),
  `BaseDirContext` (anchor for resolving relative `.ui`/`.adl`/image
  paths), `MacrosContext` (the active macro map for `$(VAR)`
  substitution).
- **Widget dispatch** — a switch on `widget.class` that picks the React
  component for each `ca*` widget. The widget catalog is in the project
  [README](../README.md#implemented-widgets).
- **Layout** — positions children with absolute coordinates derived
  from parsed geometry, with special handling for `caFrame` (renders
  children relative to the frame so visibility can clip the group) and
  `QTabWidget` (children positioned relative to the tab page).
- **Macro substitution** — `applyMacros` is exported from `uiParser.ts`
  and used by the renderer when substituting prop values, channel
  names, and include filenames.
- **Path resolution** — `caInclude` and `caRelatedDisplay` reference
  other `.ui` files by relative or absolute path; resolution is
  anchored on `BaseDirContext`. `.adl` files are converted on the fly
  via `/APSshare/bin/adl2ui` and cached in `.ui-cache/`. See
  [display-path-resolution.md](display-path-resolution.md).
- **Visibility** — `caGraphics`, `caLabel`, `caPolyLine`, `caImage`,
  `caFrame`, and `caInclude` support `visibility`/`visibilityCalc`
  conditional rendering against up to four PV variables (`A`/`B`/`C`/`D`
  from `channel`/`channelB`/`channelC`/`channelD`).

## Future work

`UiRenderer.tsx` is the biggest file in the codebase. Splitting it
into smaller modules (`renderer/`, `widgets/caDispatch.tsx`,
`pathResolver.ts`, `macroSubstitution.ts`) is queued — see the
"Open questions" section in
[../bot_vault/architecture/overview.md](../bot_vault/architecture/overview.md).
Until then, treat it as a single dispatch surface and keep changes
local to the relevant widget block.
