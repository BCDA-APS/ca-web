# caqtdm-web

A React app that renders caQtDM `.ui` files in the browser, using `cs-web-lib` for EPICS PV connections via pvws.

## Docs

- [docs/deployment.md](docs/deployment.md) — ops guide for beamline hosts (pvws container, mode setup, troubleshooting).
- [docs/how-to-start-pvws.md](docs/how-to-start-pvws.md) — how to start the pvws backend that ca-web connects to.
- [docs/roadmap.md](docs/roadmap.md) — feature roadmap.
- [docs/widgets.md](docs/widgets.md) — widget catalog and EPICS-binding rules.
- [docs/ui-rendering.md](docs/ui-rendering.md) — caQtDM `.ui` parsing and rendering pipeline.
- [docs/deployments.md](docs/deployments.md) — how to add a new beamline deployment.
- [docs/design-system.md](docs/design-system.md) — visual conventions.
- [docs/display-path-resolution.md](docs/display-path-resolution.md) — caQtDM display path lookup.
- [bot_vault/](bot_vault/) — architecture overview, ADRs, and bot-authored notes.

## Development

Requires Node.js (18+; tested with 24.x). Use whichever toolchain the host
provides:

- **System / nvm:** `node` and `npm` already on `PATH` — nothing extra to do.
- **conda** (typical on APS beamline hosts): create and activate the env first.

  ```bash
  conda create -n nodejs nodejs
  conda activate nodejs
  ```

Then install deps:

```bash
npm install
```

### Running the app

```bash
cd ~/workspace/ca-web
npm run dev
```

Then open `http://localhost:4200` in a browser. The first visit shows a
**deployment picker** listing every folder in `src/deployments/`. Click one to
enter it — the choice is remembered in `localStorage`, and you can deep-link
straight in with `?deployment=<id>` (for example
`http://localhost:4200/?deployment=29id`).

### Deployments

Each subfolder under `src/deployments/` is a self-contained deployment. The
folder name **must** match the `id` exported by its `index.tsx`. Committed
deployments:

| id | Title | pvws | Tabs |
|------|------|------|------|
| `example` | Example Deployment | `localhost:8080` | Home, Test (template) |
| `nefarian` | Nefarian | `localhost:8080` | Home, Test (simulated IOC) |
| `29id` | 29ID Beamline | `mite:8080` | 29ID-A, 29ID-C, 29ID-D |

To add a new deployment:

1. Copy `src/deployments/example/` to `src/deployments/<your-id>/`.
2. In the new `index.tsx`, set `id` to match the folder name, set `title`,
   and adjust `pvws.socket` for your PVWS server.
3. Replace `tabs`, `panelDefaults`, and `tabPanels` with your own panels.
4. (Optional) If the deployment needs to serve `.ui` files from external
   directories (e.g. NFS-mounted caQtDM display paths), add a
   `paths.json` alongside `index.tsx`:

   ```json
   {
     "uiDirs": { "mybeamline": "/net/host/path/to/ui" },
     "startupScript": "/net/host/path/to/start_epics_X",
     "adl2ui": "/APSshare/bin/adl2ui"
   }
   ```

   All fields are optional. `uiDirs[key]` makes `/ui/<key>/foo.ui` resolve
   against `<target>/foo.ui`. `startupScript` is a caQtDM startup script
   parsed to derive the display search path. `adl2ui` is the converter for
   on-the-fly `.adl` → `.ui`. Targets that don't exist on the current host
   are tolerated — the picker shows a "paths unreachable" hint for affected
   deployments.

That's it — the picker auto-discovers it. No registration step.

### Running on a laptop without beamline NFS

The repo has no machine-specific paths in trunk. `npm install && npm run build`
works on any host. In dev, deployments that declare unreachable external paths
(e.g. `29id` away from the beamline subnet) are still selectable; their
`/ui/*` requests cleanly 404 in the browser network panel. The picker shows
a small "N external paths unreachable" hint for those entries.

### Distributed mode (beamline access)

Run the app on `mite` (beamline subnet machine); any subnet browser can reach
it. Because the workspace is NFS-mounted, no code duplication is needed:

```bash
npm run dev
```

Then open `http://mite:4200/?deployment=29id` from any machine on the subnet.
pvws must also be running on `mite` (see [pvws Setup](#pvws-setup) below).

## pvws Setup

pvws runs as a podman container. From the repo root:

```bash
./scripts/start-pvws.sh                                              # workstation / nefarian
./scripts/start-pvws.sh --name pvws-29id --no-hosts --rootless-nfs   # mite / 29ID beamline
```

See [docs/how-to-start-pvws.md](docs/how-to-start-pvws.md) for env vars,
build/load steps, host-specific notes, and the pvws write protocol.

## Public UI File Layout

`.ui` files for the main 29-ID displays are served from `public/ui/`.

The dev server automatically resolves displays not found in `public/ui/` by searching
the same directory list that the desktop caQtDM uses. It does this by parsing the
caQtDM startup script (`/net/s29dserv/xorApps/ui/start_epics_29id`) and the sourced
release file (`release_6.3`) at startup — no paths are hardcoded. This covers all
synApps modules (motor, calc, sscan, optics, etc.), APSshare storage ring screens,
and site-specific paths.

If a display is only available in `.adl` (MEDM) format, it is converted on the fly
using `/APSshare/bin/adl2ui` and cached in `.ui-cache/` (git-ignored).

See `docs/display-path-resolution.md` for full details.

## Opening Displays

An "Open…" button in the header opens a searchable file picker listing all
`.ui` files from the NFS display search path. Selecting a file opens it as a
floating overlay. A macro input with auto-detected hints (scanned from the
`.ui` file) lets the user supply the correct macro set before opening.

## Implemented Widgets

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

Update rate is controlled by `PV_ARRAY_THROTTLE_MS` in pvws (see above).

### caCamera

Connects to `channelData`, `channelWidth`, `channelHeight` PVs. Features:
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
