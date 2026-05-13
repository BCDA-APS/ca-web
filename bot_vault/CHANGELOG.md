# Changelog

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

### Deployments
- `VITE_DEPLOYMENT` build-time selector; targets `nefarian` (default) and
  `29id`.
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
