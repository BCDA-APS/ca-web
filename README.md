# ca-web

A React app that renders caQtDM `.ui` files in the browser and adds
native React panels for beamline control. EPICS PV connections go
through pvws via `cs-web-lib`.

## Docs

- [docs/deployment.md](docs/deployment.md) — ops guide for beamline hosts (SSH-tunnel access, pvws container, troubleshooting).
- [docs/deployments.md](docs/deployments.md) — how to add a new beamline deployment.
- [docs/how-to-start-pvws.md](docs/how-to-start-pvws.md) — how to start the pvws backend.
- [docs/architecture.md](docs/architecture.md) — architecture overview.
- [docs/widgets.md](docs/widgets.md) — React widget catalog and EPICS-binding rules.
- [docs/ui-rendering.md](docs/ui-rendering.md) — caQtDM `.ui` parsing and rendering pipeline.
- [docs/display-path-resolution.md](docs/display-path-resolution.md) — caQtDM display path lookup.
- [docs/design-system.md](docs/design-system.md) — visual conventions.
- [docs/roadmap.md](docs/roadmap.md) — feature roadmap.
- [docs/adr/](docs/adr/) — architecture decision records.

## Development

Requires Node.js (18+; tested with 24.x):

- **System / nvm:** `node` and `npm` already on `PATH`.
- **conda** (typical on APS beamline hosts): `conda activate nodejs`.

Then install deps:

```bash
npm install
```

### Running the app

```bash
cd ~/workspace/ca-web
npm run dev
```

Use `VITE_POLL=1 npm run dev` when editing source over NFS (the
inotify watcher doesn't fire on NFS clients).

Open `http://localhost:4200` in a browser. The first visit shows a
**deployment picker**; the choice is remembered in `localStorage`.
Deep-link straight in with `?deployment=<id>`, e.g.
`http://localhost:4200/?deployment=29id`.

### Deployments

Each subfolder under `src/deployments/` is a self-contained
deployment. Folder name **must** match the `id` in its `config.json`.

| id | Title | pvws | Notes |
|---|---|---|---|
| `example` | Example Deployment | `localhost:8080` | Template; copy this when adding a new deployment. |
| `nefarian` | Nefarian | `localhost:8080` | Simulated IOC for local dev. |
| `29id` | 29ID Beamline | `localhost:8080` | Production. Run on mite; reach from a workstation via SSH tunnel (see below). |
| `29id_dev` | 29ID dev | `localhost:8080` | Sandbox copy of 29id for caqtdm-porting work. |

To add a new deployment, copy `src/deployments/example/`, rename the
folder, edit `config.json` and `index.tsx`. The picker
auto-discovers — no registration step. Full walkthrough:
[docs/deployments.md](docs/deployments.md).

### Production access (SSH)

ca-web on `mite` (and pvws on the same host) binds only to
`127.0.0.1`. Staff reach it through an SSH rather than a
direct subnet connection. A launcher script handles that:

```bash
ca-web-29id start     # opens SSH + Firefox at http://localhost:4200
ca-web-29id status
ca-web-29id stop
```

Install it once per beamline host (NFS-shared, so one install covers
all four):

```bash
cp scripts/ca-web-29id ~29iduser/bin/ca-web
chmod +x ~29iduser/bin/ca-web
```

Staff then run `ca-web start|stop|status` (the installed name drops
the `-29id` suffix since each beamline only sees its own launcher).
See [docs/deployment.md](docs/deployment.md) for the full bring-up.

## pvws Setup

pvws runs as a podman container on the same host as the dev server:

```bash
./scripts/start-pvws.sh                                # workstation / nefarian
./scripts/start-pvws.sh --name pvws-29id --no-hosts    # mite / 29ID beamline
```

See [docs/how-to-start-pvws.md](docs/how-to-start-pvws.md) for env
vars, build/load steps, and host-specific notes.

## What's in the app

### caQtDM `.ui` rendering

The `Open ui…` button in the top bar opens a searchable file picker
listing every `.ui` under the deployment's configured display paths.
Selecting a file opens it as a floating overlay; macros can be
supplied with auto-detected hints. The parser+renderer supports a
broad subset of caQtDM widgets — see the table below.

### React panels and widgets

Each deployment registers static React panels in `tabPanels`
(per-tab singletons) and optional spawn-on-demand `templates` in the
"Open react…" picker. Built-in spawnable widgets:

- **CameraViewer** — full-featured AreaDetector image with crosshair,
  contrast controls, settings gear, multiple instances. Cameras list
  per deployment (e.g. `src/deployments/29id/cameras.ts`).
- **StripChart** — multi-PV rolling time-series with sidebar, Y-mode
  toggle, log scale, manual range, hover crosshair, wrapping legend.
- **ScanViewChart** — sscan-record analog of StripChart: plots
  selected detectors (`.D{NN}CV`) against the positioner readback
  (`.R1CV`) or point index. Same crosshair / legend / Y-mode model
  as StripChart.

### Sidebar tabs

Each deployment declares its static tabs in `config.json`. Staff can
also create their own **"+" tabs** at runtime via the sidebar — type a
name, pick an icon, and the tab persists across reloads. Saved
layouts capture user tabs and their panels.

### Saved layouts

The gear menu lets staff save the current arrangement (panel
positions, hidden state, borrowed-onto-other-tab panels, spawned
chart/camera state, user-created tabs) as a named layout. Restore or
delete from the same menu. Layouts persist to the deployment folder
under `layouts/`.

## Implemented caQtDM widgets

| Widget | Notes |
|---|---|
| `caLabel` | Static text; supports visibility |
| `caLineEdit` | Readback; uses PV PREC for formatting; switches to exponential for values < 0.01 or ≥ 1e5 (matches caQtDM decimal format); supports hex format (`0x…`) |
| `caTextEntry` | Writeable PV input |
| `caGraphics` | Rectangle, circle/ellipse (via `borderRadius: 50%`), filled or outlined; dashed border; supports visibility |
| `caChoice` | Enum dropdown |
| `caMenu` | Variable dropdown with 3D relief |
| `caMessageButton` | Momentary write button |
| `caRelatedDisplay` | Opens overlay panels; `stackingMode="Hidden"` renders as transparent overlay |
| `caPolyLine` | SVG polylines and filled polygons; dash styles (Dot, Dash, BigDash); filters INT_MIN sentinel points; supports visibility |
| `caByte` | Bit field display (colored squares, startBit..endBit) |
| `caCamera` | Live area detector image display (see below) |
| `caFrame` | Grouping container; children are positioned relative to the frame; supports visibility (hides entire group) |
| `caInclude` | Embeds another `.ui` file inline; inherits parent macros; supports `stacking=Column/Row` with `numberOfItems` for side-by-side or stacked copies each with their own macro set; supports visibility |
| `caImage` | Static image file (GIF, PNG, etc.) referenced by `filename` prop; supports visibility |
| `QTabWidget` | Tabbed container with clickable tab bar; defaults to `currentIndex`; children positioned relative to tab page |
| `caCartesianPlot` | XY line/dot chart for waveform PVs; auto-scales axes; up to 4 curves |
| `caLed` | Boolean indicator; color from `trueColor`/`falseColor` props (default: red/grey) |
| `caThermo` | Vertical bar gauge; reads `maxValue` from `.ui`; navy/blue theme |
| `caSpinbox` | Numeric spin control with ▲/▼ buttons; respects `stepSize` |
| `caSlider` | Horizontal/vertical slider; limits from LOPR/HOPR (then DLLM/DHLM, then `.ui` min/max) |
| `caToggleButton` | Checkbox that writes 0/1 to a PV |
| `caTable` | Multi-PV readback table (name · value · units); up to 16 PVs |
| `caStripPlot` | Rolling time-series chart; SVG with grid, axes, ticks, legend; `period` × `units` (Second/Minute/Hour) sets time window; per-slot colors from `color_N` props; legend shows last two colon-separated PV name segments |
| `caCalc` | Computed readback: evaluates an EPICS CALC expression (`calc` prop) using up to 4 PV inputs (A–D via `channel`/`channelB`/`channelC`/`channelD`); displays numeric result formatted like `caLineEdit` |
| `caWaveTable` | Read-only waveform array grid; `numberOfRows` × `numberOfColumns` cells each showing one array element formatted with `precision` decimal places |

### caCartesianPlot

Connects to up to 4 curve pairs via `channels_1`…`channels_4` (format: `"xPv;yPv"` — X channel may be empty, in which case sample index is used as X). Features:

- Auto-scaling axes
- Dashed grid (matches caQtDM style)
- Title and X/Y axis labels (`Title`, `TitleX`, `TitleY` props)
- Per-curve color (`color_1`…) and style (`Style_N`: Lines or Dots)
- Multiple overlays can be open simultaneously

Update rate is controlled by `PV_ARRAY_THROTTLE_MS` in pvws (see
[docs/how-to-start-pvws.md](docs/how-to-start-pvws.md)).

### caCamera

Connects to `channelData`, `channelWidth`, `channelHeight` PVs. The
parser-driven `.ui` widget is separate from the React `CameraViewer`
described above; both render AD image data but `CameraViewer` is the
full-featured multi-instance one used by deployments.

Features:

- Grayscale rendering to HTML Canvas
- Auto-levels (min/max from frame data) with manual override
- FPS counter
- Cursor readout (x/y/pixel value on hover)
- Zoom sidebar (1x–8x, fit-to-viewport)

## Visibility System

caQtDM widgets can be conditionally hidden via four properties:

| Property | Description |
|---|---|
| `channel` / `channelB` / `channelC` / `channelD` | PVs mapped to variables A, B, C, D in the calc expression |
| `visibility` | Mode: `ifNotZero` (show when A≠0), `ifZero` (show when A=0), `Calc` (evaluate `visibilityCalc`) |
| `visibilityCalc` | EPICS CALC expression using A–D; result `false`/`0` hides the widget |

Supported widgets: `caGraphics`, `caLabel`, `caPolyLine`, `caImage`, `caFrame`, `caInclude`.

### caFrame visibility

A `caFrame` with visibility hides its entire group of children at once. In the parser, `caFrame` children are stored with positions relative to the frame (not flattened into the parent coordinate space), so the renderer can wrap them in a single clipping div and show/hide the whole group.
