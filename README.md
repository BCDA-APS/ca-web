# caqtdm-web

A React app that renders caQtDM `.ui` files in the browser, using `cs-web-lib` for EPICS PV connections via pvws.

## Development

Requires a conda environment with Node.js. Create one if needed:

```bash
conda create -n nodejs nodejs
```

### Local mode (default)

Run Vite and pvws on the same machine; open the app in a browser on that machine.
The default `.env` uses `localhost:8080` so each machine connects to its own pvws:

```bash
cd ~/workspace/caqtdm-web
conda activate nodejs
npm run dev
```

Then open `http://localhost:4200` in a browser on the same machine.

### Deployment modes

Tab layouts and pvws addresses are configured per deployment using Vite's mode system.
Two deployment env files are committed:

| Mode | File | pvws | Tabs |
|------|------|------|------|
| `nefarian` (default) | `.env.nefarian` | `localhost:8080` | Motors, Lorentzian, Area Detector |
| `29id` | `.env.29id` | `mite:8080` | 29ID-C ARPES, 29ID-D Kappa |

```bash
npm run dev -- --mode nefarian   # simulated IOC (default)
npm run dev -- --mode 29id       # 29ID beamline on mite
```

Running `npm run dev` without `--mode` uses the gitignored `.env` (localhost pvws,
nefarian tabs). Deployment files contain no secrets and are committed.

To add a new deployment, create `src/deployments/<name>.tsx` exporting a
`DeploymentConfig`, add a `.env.<name>` file, and register it in
`src/deployments/index.ts`.

### Distributed mode (beamline access)

Run the app on `mite` (beamline subnet machine) with the `29id` mode so any subnet
browser can reach real 29ID PVs. Because the workspace is NFS-mounted, no code
duplication is needed:

```bash
npm run dev -- --mode 29id
```

Then open `http://mite:4200` from any machine on the subnet. pvws must also be running
on `mite` (see pvws Setup below).

## pvws Setup

pvws runs as a Podman container.

### On nefarian (simulated IOC)

```bash
podman stop pvws && podman rm pvws
podman run --network=host -d --name pvws \
  -e PV_WRITE_SUPPORT=true \
  -e EPICS_CA_MAX_ARRAY_BYTES=8000000 \
  -e PV_ARRAY_THROTTLE_MS=1000 \
  pvws:latest
```

### On mite (29ID beamline)

`/etc/hosts` is not writable by regular users on the beamline machines, so
`--no-hosts` is required. A distinct container name avoids conflicts with other
instances on the shared machine.

```bash
podman stop pvws-29id && podman rm pvws-29id
podman run --network=host --no-hosts -d --name pvws-29id \
  -e PV_WRITE_SUPPORT=true \
  -e EPICS_CA_MAX_ARRAY_BYTES=8000000 \
  -e PV_ARRAY_THROTTLE_MS=1000 \
  pvws:latest
```

### Environment variables

- **`PV_WRITE_SUPPORT=true`** — enables PV write support (required for caTextEntry, caMessageButton, etc.)
- **`EPICS_CA_MAX_ARRAY_BYTES=8000000`** — required for area detector waveform PVs (e.g. `ArrayData`). The container does **not** inherit the host shell's environment. Without this, the default is 16 KB and image PVs will connect but return 0 elements.
- **`PV_ARRAY_THROTTLE_MS=1000`** — maximum update rate for waveform/array PVs (default is 10000 ms = 10 s, which makes strip charts and line profiles sluggish). Set to 1000 ms for ~1 Hz updates; lower values (e.g. 200) give faster updates at the cost of more bandwidth.

### pvws write protocol

- A PV must be **subscribed** on the same WebSocket connection before a write will be accepted. pvws returns `{"type":"error","message":"Cannot write unknown PV <name>"}` otherwise.
- PV names must use the `ca://` prefix (e.g. `ca://fr:m1.VAL`).

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
