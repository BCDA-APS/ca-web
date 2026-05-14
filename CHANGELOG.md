# Changelog

## Unreleased

### caQtDM 29-ID port: new `29id_dev` deployment, four reusable widgets

- New deployment `src/deployments/29id_dev/` — a clone of `29id` used as
  a staging area for porting screens from the caQtDM tree at
  `/net/s29dserv/xorApps/ui/29id`. Production `29id` is unchanged. Move
  panels from `29id_dev` → `29id` one at a time once they're proven.
- New tabs in `29id_dev`: **29ID-E** (coherent beamline) and
  **29ID-BLEPS** (vacuum interlocks). The existing 29ID-A / C / D tabs
  in `29id_dev` gain ~16 additional panels (default hidden) covering
  diagnostics, scan progress, PV history, apertures, M3R alignment,
  detector spectra, sample-temperature PID, and beam-profile cameras.
- Four new reusable widgets under `src/widgets/`:
  - `BlepsSector.tsx` — vacuum sector schematic: gate-valve cells
    (OPEN/CLOSED/FAULT color states), ion-gauge / ion-pump / vacuum-trip
    interlock LEDs, optional summary banner.
  - `DetectorSpectrum.tsx` — MCA/DXP/Vortex spectrum plot with ROIs,
    real/live/dead-time stats, and Start/Stop/Erase buttons.
  - `TempController.tsx` — LakeShore 331/340 / Si9700 PID card with
    setpoint, heater output, ramp, range, and P/I/D entries.
  - `CameraViewer.tsx` — AreaDetector image viewer (MJPEG stream or
    waveform-driven canvas fallback) with crosshair overlay and
    exposure / gain / acquire controls.
- Phase-2 native panels wired in `src/deployments/29id_dev/index.tsx`:
  `bleps-sector-{a..e}` (BlepsSector), `29idd-dxp-saturn`
  (DetectorSpectrum, mca1 + 4 ROIs), `29idd-si9700` (TempController,
  tc1 loop with P/I/D), `29idc-cam-live` and `29ide-lightfield`
  (CameraViewer), `29idd-mpa` (DetectorSpectrum + CameraViewer
  composite).
- The remaining new panels (`29id-bl-diag`, `29id-apertures`,
  `29id-scan-progress`, `29id-pv-history`, `29id-m3r-align`,
  `29idc-ses`, `29idc-stripchart-t`, `29idc-motors-detail`,
  `29idd-stripchart-t`, `29idd-scan-progress`, `29idd-quantar`,
  `29ide-overview`, `29ide-motors`, `29ide-scan`, `29ide-apertures`,
  `bleps-faults`) load via `UiRenderer` from `/ui/29id/<file>.ui` for
  immediate breadth; React rewrites are deferred.
- Already-covered caQtDM screens are explicitly **not** re-ported (see
  the inventory in `/home/rafa/.claude/plans/i-want-to-investigate-mellow-fog.md`):
  layouts, energy, mirrors, slits, chamber, Kappa, ARPES motors,
  CA-1..15 strip chart, scan records.

### Layouts move from `localStorage` to per-deployment JSON files

- Live state (panel positions, lock, hidden, overlay positions, strip
  chart settings) is now persisted to
  `src/deployments/<id>/layouts/current.json` instead of
  `localStorage`. Saved layouts are one file per draft at
  `src/deployments/<id>/layouts/<name>.json`, so they version-control,
  diff, and `mv`/`rm` like any other config artifact.
- New Vite plugin `layouts-api` (inline in `vite.config.ts`) serves
  `GET /api/layouts/<id>` (list), and `GET/PUT/DELETE
  /api/layouts/<id>/<name>` in both `vite dev` and `vite preview`.
  Names are slugged to `[a-z0-9-]{1,64}`; `current` cannot be deleted;
  bodies cap at 1 MB; writes are atomic via tmp+rename.
- `src/lib/layoutStorage.ts` rewritten: `hydrateLayouts(id)` fetches
  `current.json` once at boot into an in-memory cache; `layoutGet` /
  `layoutSet` are sync accessors; writes are debounced (~250ms) and PUT
  back. `listLayouts` / `readLayout` / `writeLayout` / `deleteLayout`
  drive named drafts. Legacy `ca-web.<id>.*` localStorage keys are
  drained on first boot, then cleared. Server-unreachable disables
  writes loudly via `console.error` — no silent fallback.
- `SettingsPanel` drops the "Copy as JSON" button (drafts are already
  files on disk) and renames "My drafts" → "Saved layouts".

### Skills relocated to `.claude/skills/`

- New `.claude/skills/` directory holds per-skill subfolders with
  `SKILL.md` (Claude design frontmatter: `name`, `description`). Claude
  Code auto-discovers them via the Skill tool; other tools read them
  through `AGENTS.md` at the repo root.
- New skill `new-deployment` — interactive scaffold for
  `src/deployments/<id>/`. Interviews the user for
  id/title/pvws/tabs/panels/PVs, optionally ingests an external `.ui`
  directory for `quickLinks`, then writes `config.json` and `index.tsx`.
- Existing skills `running-the-quality-gate` and
  `verifying-before-completion` moved out of `bot_vault/skills/` (now
  removed). Bodies are unchanged; frontmatter and per-skill
  subfolders added.
- New `AGENTS.md` at the repo root: cross-tool entry summarising stack,
  commands, skills, and project rules for OpenCode / Cursor / Aider /
  Codex.
- `CLAUDE.md` directives + Docs links updated to point at the new
  location.

### Additional skills

- `adding-a-widget` — encodes the connector/render split, the
  `pvCtx` context-menu rule (no lint enforces it), alignment
  conventions, and exact import paths. Includes a render-only
  template the user can copy.
- `adding-a-panel` — extends an existing deployment with a new
  draggable panel. Calls out the localStorage-key trap up front
  (panel `id` slugs have no rename migration in
  `src/lib/layoutStorage.ts`) and the `config.json` / `index.tsx`
  sync.
- `debugging-pvws-connectivity` — diagnostic flow for blank
  dashboards and the red `wsDown` banner. Documents the
  boot-time probe (`src/lib/pvwsProbe.ts`) and the WebSocket stub
  (`src/lib/wsStub.ts`), then walks a four-step recipe (config
  socket, `curl` healthcheck, `wscat`, EPICS_CA_ADDR_LIST). Links
  to `docs/how-to-start-pvws.md` for operator setup.
- `AGENTS.md` Skills list updated with the three new entries.

### Dead-code sweep

- Deleted unused `ChamberDiagram.tsx` and `ChamberDiagramLight.tsx`
  under `src/deployments/29id/chamber/` (~860 lines combined). The
  29id deployment uses `ChamberDiagramV2` exclusively.
- Dropped `js-yaml`, `@types/js-yaml`, and `@reduxjs/toolkit` from
  `package.json`. None had direct imports; `@reduxjs/toolkit` still
  resolves transitively via `@diamondlightsource/cs-web-lib`'s own
  `dependencies`.
- Moved `public/ui/test.ui` to `src/ui/test.ui`. The `example` and
  `nefarian` deployments now import it via Vite `?url`
  (`import testUiUrl from "../../ui/test.ui?url"`) instead of
  hard-coding the public path. Build emits the .ui as a fingerprinted
  asset.
- Moved `public/aps-logo.png` to `src/assets/aps-logo.png`; `App.tsx`
  imports it directly (`import apsLogoUrl from "./assets/aps-logo.png"`).
  `public/` directory removed entirely — all static assets now flow
  through the Vite asset pipeline.
- Removed `docs/superpowers/` (untracked planning artefacts) and
  added `docs/superpowers/` to `.gitignore` alongside `.superpowers/`.

### Resilient, per-deployment layout storage

- Layouts can now ship with a deployment: `DeploymentConfig.layouts?:
  SavedLayout[]` in `src/lib/deployment.ts`. Entries committed to
  `src/deployments/<id>/config.json` render in the gear menu under
  "Shared (deployment)" and survive cleared browsers, new machines,
  and redeploys since they live in the JS bundle. The team-curation
  workflow: author a draft in the menu, click "JSON" to copy it,
  paste into `config.json`, commit.
- All panel/overlay/strip-chart storage moves under
  `ca-web.<deploymentId>.<suffix>` so switching deployments at
  runtime doesn't mix layout data. Keys touched:
  `panel:layouts`, `panel:<panelId>`, `overlay:<file>`,
  `panel-hidden`, `stripchart:<id>`. New helper
  `src/lib/layoutStorage.ts` owns the prefixer and a one-time
  migration that copies legacy non-namespaced keys under the
  active deployment's namespace on first load.
- `SettingsPanel` is split into "Save current layout…", "Reset to
  default positions", "Shared (deployment)" (read-only, tagged),
  and "My drafts" (saveable, deletable, with a "JSON" copy button).
- App.tsx renamed its local `layoutKey` state to `layoutBump` to
  avoid shadowing the new helper import.

### pvws gateway pre-flight gate

- `src/main.tsx` probes `ws[s]://<socket>/pvws/pv` once with a 3s timeout
  (`src/lib/pvwsProbe.ts`) before initializing cs-web-lib. If the probe
  fails, `installPvwsWebSocketStub(wsUrl)` (new `src/lib/wsStub.ts`)
  pins that URL to a no-op `WebSocket` that stays in `CONNECTING` and
  never fires open/close/error. The library's hardcoded 500ms reconnect
  loop and queued `sendMessage` calls both fall through silently (the
  library guards every send with `readyState === OPEN`), so PVs render
  in their default disconnected state and the cascade of
  "No connections for ca://…" errors disappears.
- `App` accepts `wsDown` / `wsUrl` props and shows a red banner above
  the existing header (offset to `top: 32`) with a Retry button. The
  shell, panels, and templates remain visible and navigable.
- Scope: startup-only. A connection that opens at boot but later drops
  still falls through to the library's reconnect behaviour.

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
