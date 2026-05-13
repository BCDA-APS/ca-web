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
├── App.tsx                  # orchestrator: state wiring + composition of shell pieces
├── main.tsx                 # async boot: resolve deployment, lazy-load it, render
├── DeploymentPicker.tsx     # full-screen selector shown when no deployment is chosen
├── index.css                # global styles
├── shell/                   # App-shell components (chrome around the content)
│   ├── DraggablePanel.tsx
│   ├── OverlayPanel.tsx
│   ├── Sidebar.tsx
│   ├── SettingsPanel.tsx
│   ├── FilePickerDialog.tsx
│   ├── PvContextMenu.tsx
│   ├── PvInfoDialog.tsx
│   └── ErrorBoundary.tsx
├── hooks/                   # connector hooks: data only, no JSX
│   └── useMotor.ts          # motor PV subscriptions + derived state + write actions
├── lib/
│   ├── deployment.ts        # DeploymentConfig types + lazy LOADERS + loadDeployment + context
│   ├── epics.ts             # PV value extractors (toDouble/toStr/fmt/toBool) + pvCtx menu
│   ├── pvwsWriter.ts        # pvws WebSocket write client
│   ├── theme.ts             # colors, font sizes
│   ├── uiParser.ts          # caQtDM .ui (XML) → JSON
│   └── UiRenderer.tsx       # parsed-UI → React widget tree (monolith)
├── widgets/                 # render-only widgets (consume data via props or hooks)
│   ├── EpicsWidgets.tsx     # RbvBox, SpBox, ChanRbvBox, ChanSpBox, TweakValue, …
│   ├── MotorCard.tsx        # full motor card (consumes useMotor)
│   ├── MotorCardFlat.tsx    # minimal-decoration variant (consumes useMotor)
│   ├── MotorCardRow.tsx     # compact horizontal variant (consumes useMotor)
│   ├── MotorGrid.tsx        # 3-column grid container
│   ├── MotorRow.tsx         # PV-based motor row
│   ├── ReadbackRow.tsx      # simple readback row
│   └── StripChart.tsx       # multi-PV rolling time-series chart
└── deployments/             # one self-contained folder per deployment
    ├── example/             # copy-paste template
    │   ├── config.json      # all serializable config (id, title, pvws, tabs, panelDefaults, ...)
    │   └── index.tsx        # React components + tabPanels + DeploymentConfig export
    ├── nefarian/            # default simulated-IOC deployment
    │   ├── config.json
    │   └── index.tsx
    └── 29id/                # 29ID beamline panels (grouped by domain)
        ├── config.json      # includes nested `paths` block: external uiDirs/startupScript/adl2ui
        ├── index.tsx
        ├── chamber/
        ├── energy/
        ├── layout/
        ├── optics/
        └── scan/
```

## Render vs connector convention

Two layers, kept separate:

- **`src/hooks/`** — connector hooks. Each takes a PV prefix or PV name(s),
  calls `useConnection()` internally, and returns typed already-formatted
  state. Never returns JSX. Owns its private formatting helpers.
- **`src/widgets/`** — render-only. Components receive plain props or call a
  hook from `src/hooks/`. No `useConnection` inside the render code path.

Smart-leaf exception: a widget that takes a `pv: string` and is reused
site-wide (the `MotorCard` family) can call its connector hook directly. This
keeps the call sites concise. The data layer still lives in `src/hooks/`.

`ChanRbvBox` / `ChanSpBox` are already render-only — they take a `raw` prop
and don't subscribe themselves. The caller (typically a panel) does the
`useConnection` and passes the raw value in.

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
  `MotorCardFlat`) all consume `useMotor(pv)` for data; only the render
  differs. Folding them into one component with a `layout` prop is
  deferred — call sites live in deployments and need a separate pass.

## Panels and overlays

`App.tsx` orchestrates a draggable panel system; the pieces live in
`src/shell/`:

- `DraggablePanel` — positions persisted to `localStorage` under
  `panel:<id>`; supports per-panel lock, z-index promotion on focus.
- `OverlayPanel` — overlay windows opened from motor "More" menus or the
  file picker; positions persisted under `overlay:<file>`.
- `SettingsPanel` — saves and restores named layouts (panel positions,
  hidden panels, open overlays) under `localStorage` key `panel:layouts`.
- `FilePickerDialog` — searchable list of `.ui` files from the NFS display
  path, opened as overlays with macro hint detection.
- `PvContextMenu` / `PvInfoDialog` — right-click PV menu and details
  dialog.
- `ErrorBoundary` — top-level error boundary (see below).

## State

Redux store is imported from `@diamondlightsource/cs-web-lib`
(`store({ PVWS_SOCKET, PVWS_SSL })` in `main.tsx`). PV subscriptions,
values, and metadata flow through that store. No local slices.

## Deployments

`src/deployments/` contains one folder per deployment. Each folder has:

- `config.json` — all serializable deployment data: `id`, `title`,
  `pvws: { socket, ssl }`, tabs, default panel positions, hidden-panel
  defaults, quick-link `.ui` files, and an optional nested `paths` block
  (build-time only, see below). The folder name must match `config.id`.
- `index.tsx` — imports `config.json` as `rawConfig`, defines the React
  components for each panel, builds the `tabPanels` map (which references
  components by value and can't be JSON), strips the build-time `paths`
  field off `rawConfig`, and exports
  `const config: DeploymentConfig = { ...deploymentFields, tabPanels }`.
  The export sits near the top of the file for readability.

`src/lib/deployment.ts` auto-discovers every `src/deployments/*/index.tsx`
with `import.meta.glob({ eager: false })` and exposes `LOADERS`,
`listDeploymentIds()`, and `loadDeployment(id)`. Each deployment becomes
its own Rollup chunk and is fetched on demand. `main.tsx` calls
`resolveActiveId()` (URL `?deployment=<id>` wins, then `localStorage`),
then `await loadDeployment(id)` before rendering. If no active id matches,
`<DeploymentPicker />` renders instead and loads all configs in parallel
to list them. The chosen config flows through `DeploymentContext` and is
read by `App.tsx` via `useContext`. PVWS socket/SSL come from the chosen
`config.pvws`, so one build serves every deployment.

To add a deployment: copy `src/deployments/example/` to
`src/deployments/<your-id>/`. Edit `config.json` (`id` must match the
new folder name; set `title`, `pvws`, `tabs`, `panelDefaults`) and
`index.tsx` (rewrite `tabPanels` for your panels). No registration step.

If the deployment needs to serve `.ui` files from external directories
(e.g. site NFS mounts), add an optional `paths` block to `config.json`
declaring `uiDirs`, `startupScript`, and/or `adl2ui`. `vite.config.ts`
reads these from `parsed.paths` and unions them across all deployments
at config-load time. `uiDirs[key]` makes `/ui/<key>/foo.ui` resolve
against `<target>/foo.ui` (replaces the old `public/ui/<key>` symlinks).
Targets missing on the current host are tolerated and surfaced to the
picker through a virtual module (`virtual:deployment-path-status`) as
a "paths unreachable" hint.

Current deployments: `example` (template), `nefarian` (simulated IOC), `29id`
(beamline).

## Error boundary

`ErrorBoundary` (in `src/shell/ErrorBoundary.tsx`, wrapped at the root of
`App.tsx`) wraps the entire render tree. When any descendant throws, the
whole UI is replaced with a "Recovering from render error…" screen and
the error is logged with the `[ErrorBoundary] caught:` prefix. After 3
seconds the boundary auto-resets and re-renders the app; a manual "Retry
now" button is also exposed. This is whole-app recovery, not per-panel
isolation.

## External dependencies

- EPICS / Channel Access via `@diamondlightsource/cs-web-lib` (npm).
- `pvws` WebSocket service (Podman container) for PV transport. URL set
  by the active deployment's `config.pvws.socket`.
- On-the-fly MEDM-to-`.ui` conversion via `/APSshare/bin/adl2ui` (dev
  server only; results cached in `.ui-cache/`).

## Build and bundle

- `npm run build`: `tsc && vite build`.
- `npm run analyze`: same build with `ANALYZE=1`, emits `dist/stats.html`
  via `rollup-plugin-visualizer`.
- `npm run lint`: ESLint with `eslint.config.js` (flat config). Currently
  only `react-hooks/rules-of-hooks` is enforced.
- Vendor chunks are split via `build.rollupOptions.output.manualChunks`
  into `react` (~50 kB gz), `cs-web` (~746 kB gz, includes Redux + MUI),
  and per-deployment chunks.

## Open questions

- Should `UiRenderer.tsx` be split? Currently 2.5k lines.
- Should the three `MotorCard*` variants collapse to one component now
  that they share a hook? Deferred — call sites live in `src/deployments/`.
- Are server-side saved layouts needed, or is `localStorage` enough?
