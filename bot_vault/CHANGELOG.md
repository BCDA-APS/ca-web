# Changelog

## Unreleased

### Deployment config consolidation

- Each `src/deployments/<id>/` now uses a single `config.json` carrying
  all serializable config: `id`, `title`, `pvws`, `tabs`, `panelDefaults`,
  optional `defaultHiddenPanels`, optional `quickLinks`, and an optional
  nested `paths` block (formerly `paths.json`: `uiDirs` / `startupScript`
  / `adl2ui`). The per-deployment `paths.json` is gone.
- `index.tsx` is reduced to React components, the `tabPanels` mapping,
  and `export const config: DeploymentConfig = { ...deploymentFields, tabPanels }`.
  The `paths` field is destructured off `rawConfig` before the spread so
  build-time data doesn't leak into the runtime config object. The export
  sits near the top of each `index.tsx` for readability.
- `vite.config.ts`'s `loadDeploymentPaths()` reads `config.json` and looks
  under `parsed.paths` for the build-time fields. A malformed (non-object)
  `paths` value now throws instead of silently coercing to `{}`.
- New type `DeploymentConfigData` in `src/lib/deployment.ts` describes
  the on-disk JSON shape (runtime fields + optional `paths: unknown`).
- Residue: Vite imports `config.json` atomically, so the `paths` bytes
  still appear in the production bundle (~250 bytes for 29id). The
  runtime `config` object is clean; removing the bundled bytes would
  require a vite plugin to virtualise the JSON import — deferred.

### Bundle and structure pass (on `rafa-dev`)

Bundle before/after (`npm run analyze`):

| Asset                         | Before (raw) | Before (gz) | After (raw) | After (gz) |
| ----------------------------- | -----------: | ----------: | ----------: | ---------: |
| Entry / app chunk             |     2,719 kB |      851 kB |       86 kB |      25 kB |
| `react` vendor chunk          |            — |           — |      155 kB |      50 kB |
| `cs-web` vendor chunk         |            — |           — |    2,338 kB |     746 kB |
| Active deployment chunk (29id)|            — |           — |       91 kB |      19 kB |
| Other deployments (each)      |            — |           — |        4 kB |     1.4 kB |
| ReadbackRow shared chunk      |            — |           — |       14 kB |       4 kB |
| StripChart shared chunk       |            — |           — |       18 kB |       6 kB |

First load for an active deployment now downloads the entry + react +
cs-web + deployment chunk (~2.6 MB raw / ~840 kB gz) instead of a single
2.7 MB / 851 kB bundle — similar total but split so vendor cache survives
deployment switches and inactive deployments stay off the wire.

Phase summary:

- **Visibility**: added `rollup-plugin-visualizer` and an `npm run analyze`
  script (`ANALYZE=1 npm run build`) emitting `dist/stats.html`.
- **Lazy deployments**: `src/lib/deployment.ts` switched to
  `import.meta.glob({ eager: false })`; `loadDeployment(id)` and
  `listDeploymentIds()` replace the synchronous `REGISTRY`. `main.tsx`
  now async-boots; `DeploymentPicker` loads configs in parallel only
  when shown.
- **Vendor chunks**: `vite.config.ts` defines `manualChunks` for `react`,
  `mui`, and `cs-web` (Redux + cs-web-lib).
- **Render/connector split**: new `src/hooks/useMotor.ts` consolidates the
  12 PV subscriptions + status derivation + write actions formerly
  duplicated across `MotorCard`, `MotorCardRow`, `MotorCardFlat`. Each
  variant is now render-only on top of the hook. Convention documented in
  `architecture/overview.md`.
- **`App.tsx` decomposition**: 859 LOC → 186 LOC. Extracted into
  `src/shell/`: `DraggablePanel`, `OverlayPanel`, `Sidebar`,
  `SettingsPanel`, `FilePickerDialog` (+ `useUiFiles`), `PvContextMenu`,
  `PvInfoDialog`, `ErrorBoundary`. Dropped the `App` prefix on filenames
  since the folder carries that meaning.
- **ESLint**: installed `eslint` + `@typescript-eslint/parser` +
  `eslint-plugin-react-hooks`; flat config in `eslint.config.js`. Only
  `react-hooks/rules-of-hooks` is enforced for now. `npm run lint` added.
  The pre-existing `.claude/hooks/quality-gate.sh` already invoked
  `eslint` on staged files when present; it now actually runs.

Deferred (off-limits this pass — would touch `src/deployments/`):

- Folding `MotorCard*` variants into one file with a `layout` prop.
- Extracting `useChamber`, `useLayoutSection`, `useEnergy` hooks from the
  29id chamber, layout, and energy panels.

## v0.1.0-dev -- 2026-05-13

### Scaffold
- Initial `bot_vault` scaffold with `entry.md`, `architecture/overview.md`,
  `architecture/agent_workflow.md`, and ADR `000`.
- CLAUDE.md directives in place.
- Critic agent installed.

### Toolchain
- Dropped conda hard requirement; documented npm and conda as parallel
  toolchain options.
- Switched `@diamondlightsource/cs-web-lib` from a local tarball to the
  npm registry (`0.10.6`).

### Panels and overlays (App.tsx)
- `DraggablePanel` with `localStorage` position persistence per panel id.
- Saved layouts (named sets of positions + hidden panels + open overlays)
  stored under `localStorage` key `panel:layouts`.
- Panel visibility persisted in saved layouts.
- UI overlays save/restore as part of layouts; 29ID quick-link button.
- Top-level `AppErrorBoundary` with auto-reset.

### Portability
- Pulled 29ID-site paths out of trunk: deleted `public/ui/{29id,ADCore,motors}`
  symlinks and `vite.config.ts` STARTUP_SCRIPT / ADL2UI constants. Each
  deployment may now declare external paths in an optional
  `src/deployments/<id>/paths.json` (uiDirs / startupScript / adl2ui).
- Vite unions these at config-load time; conflicting `uiDirs` keys throw.
- A virtual module `virtual:deployment-path-status` feeds the picker a
  "N external paths unreachable" hint per deployment.
- `npm install && npm run build` now works on any host. ADR 005.
- New "Switch deployment…" header button (calls `clearActive()` + reload).

### Deployments
- Self-contained deployment folders under `src/deployments/<id>/`, each
  with its own `index.tsx` exporting a `DeploymentConfig` (including `id`
  and `pvws`). Framework moved to `src/lib/deployment.ts` (types, glob
  registry, resolver, React context). `src/deployments/` now contains
  only deployment folders.
- Runtime selection: `?deployment=<id>` URL param or first-run picker
  screen (`src/DeploymentPicker.tsx`); choice persisted in `localStorage`.
  One build serves every deployment.
- New `example` deployment as a copy-paste template. `nefarian` and `29id`
  preserved with their previous behavior.
- Replaces the prior `VITE_DEPLOYMENT` build-time selector and per-mode
  `.env.<name>` files (deleted).
- `29id/` deployment: tabs for 29ID-A, 29ID-C ARPES, 29ID-D Kappa, with
  BeamlineLayout, BeamlineEnergy / BeamlineEnergyA, Mirrors, Slits,
  DiaGon, ScanRecords, and ChamberDiagram panels.

### 29ID panels
- BLLayout series (AB, C, D, E) — pixel-aligned beamline schematic with
  M3R alignment fixes, beam-path color logic.
- BeamlineLayout combines E+D+C+AB into full beamline.
- ChamberDiagram variants: original, light theme, V2 (hybrid HTML+SVG).
- Mirrors panel with status/homing color-coding and `+/-` tweak buttons.
- Slits panel with 2B/1A tabs and accurate 4-blade schematic.
- DiaGon panel with cam buttons and motor cards; "More" dropdown
  replaces inline shortcut buttons.
- ScanRecords panel with right-aligned scan controls.
- BeamlineEnergy / BeamlineEnergyA with QP and Earth coils wiring,
  "Sync encoders" conditional indicator, gear-button related displays
  (Ring Info, ID Machine Physics).

### Widget conventions
- `ChanRbvBox` / `ChanSpBox` read precision from PV channel metadata.
- Right-click `pvCtx` menu wired across all `ChanRbvBox`/`ChanSpBox`
  instances.
- Design system unified on light-theme SP/input/tweak colors.
- `StripChartWidget.tsx` replaced with `StripChart.tsx` — multi-PV
  chart with sidebar, Y-axis modes, and per-PV persistence.

### Fixes
- `toDouble` no longer crashes on NaN.
- Panels scroll with the page.
- Various beam-path alignment and color-logic fixes across BLLayout series.
