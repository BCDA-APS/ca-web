# Architecture Overview

## Purpose

A browser-based control panel for beamline instruments. Renders caQtDM `.ui`
files in React via `cs-web-lib`'s EPICS Channel Access bindings, served over
a `pvws` WebSocket.

## Stack

React 18, TypeScript 5, Vite 7, npm. Key dependency:
`@diamondlightsource/cs-web-lib` (npm registry) for EPICS / Channel Access.
MUI for UI components, Redux Toolkit (re-exported by `cs-web-lib`) for state.

## Layout

```
src/
├── App.tsx                  # panel/overlay manager + error boundary
├── main.tsx                 # Redux + OutlineProvider wrapping
├── index.css                # global styles
├── lib/
│   ├── epics.ts             # PV value extractors (toDouble/toStr/fmt/toBool) + pvCtx menu
│   ├── pvwsWriter.ts        # pvws WebSocket write client
│   ├── theme.ts             # colors, font sizes
│   ├── uiParser.ts          # caQtDM .ui (XML) → JSON
│   └── UiRenderer.tsx       # parsed-UI → React widget tree (monolith)
├── widgets/
│   ├── EpicsWidgets.tsx     # RbvBox, SpBox, ChanRbvBox, ChanSpBox, TweakValue, …
│   ├── MotorCard.tsx        # full motor card
│   ├── MotorCardFlat.tsx    # minimal-decoration variant
│   ├── MotorCardRow.tsx     # compact horizontal variant
│   ├── MotorGrid.tsx        # 3-column grid container
│   ├── MotorRow.tsx         # PV-based motor row
│   ├── ReadbackRow.tsx      # simple readback row
│   └── StripChart.tsx       # multi-PV rolling time-series chart
└── deployments/
    ├── types.ts             # DeploymentConfig / Tab / PanelConfig / QuickLink
    ├── index.ts             # VITE_DEPLOYMENT selector
    ├── nefarian.tsx         # default simulated-IOC deployment
    └── 29id/                # 29ID beamline panels (grouped by domain)
```

## Rendering pipeline

caQtDM `.ui` XML → `lib/uiParser.ts` parses into a JSON tree →
`lib/UiRenderer.tsx` walks the tree, dispatches to the matching React
component for each `ca*` widget (`caLabel`, `caLineEdit`, `caGraphics`,
`caInclude`, `caFrame`, etc.), substitutes macros, and resolves nested
`.ui` paths against `baseDir`. The renderer is currently a single ~2.5k-line
file — splitting it into dispatch / layout / macros / path resolution
modules is future work.

## Widgets

- **PV-named** (`RbvBox`, `SpBox`) — use only for computed values not
  directly backed by a PV.
- **Channel-backed** (`ChanRbvBox`, `ChanSpBox`) — read precision from
  the channel metadata; use whenever displaying a PV value.
- Every `ChanRbvBox`/`ChanSpBox` must wire `onContextMenu={pvCtx(...)}`
  (see `lib/epics.ts`) to expose the right-click PV menu. No exceptions.
- Motor cards: three layout variants (`MotorCard`, `MotorCardRow`,
  `MotorCardFlat`) share status-color logic and tweak buttons; future
  work is to fold them into one component with a layout prop.

## Panels and overlays

`App.tsx` manages a draggable panel system:

- `DraggablePanel` — positions persisted to `localStorage` under
  `panel:<id>`; supports per-panel lock, z-index promotion on focus.
- `AppOverlayPanel` — overlay windows opened from motor "More" menus or
  the file picker; positions persisted under `overlay:<file>`.
- Saved layouts — named sets of panel positions, hidden panels, and open
  overlays serialized to `localStorage` under `panel:layouts` via the
  Settings panel.
- File picker — searchable list of `.ui` files from the NFS display path,
  opened as overlays with macro hint detection.

## State

Redux store is imported from `@diamondlightsource/cs-web-lib`
(`store({ PVWS_SOCKET, PVWS_SSL })` in `main.tsx`). PV subscriptions,
values, and metadata flow through that store. No local slices.

## Deployments

`src/deployments/index.ts` picks the `DeploymentConfig` at build time
based on `VITE_DEPLOYMENT`. Each deployment provides tabs, default panel
positions, hidden-panel defaults, quick-link `.ui` files, and a
`tabPanels` map (tab id → panel list). Add a deployment by exporting a
new `DeploymentConfig`, adding `.env.<name>` with `VITE_DEPLOYMENT`, and
registering it in `src/deployments/index.ts`.

Current deployments: `nefarian` (default, simulated IOC) and `29id`
(beamline).

## Error boundary

`AppErrorBoundary` (top of `App.tsx`) wraps the entire render tree.
When any descendant throws, the whole UI is replaced with a "Recovering
from render error…" screen and the error is logged with the
`[AppErrorBoundary] caught:` prefix. After 3 seconds the boundary
auto-resets and re-renders the app; a manual "Retry now" button is
also exposed. This is whole-app recovery, not per-panel isolation.

## External dependencies

- EPICS / Channel Access via `@diamondlightsource/cs-web-lib` (npm).
- `pvws` WebSocket service (Podman container) for PV transport. URL via
  `VITE_PVWS_SOCKET` (default `localhost:8080`).
- On-the-fly MEDM-to-`.ui` conversion via `/APSshare/bin/adl2ui` (dev
  server only; results cached in `.ui-cache/`).

## Open questions

- Should `UiRenderer.tsx` be split? Currently 2.5k lines.
- Should the three `MotorCard*` variants collapse to one component?
- Are server-side saved layouts needed, or is `localStorage` enough?
