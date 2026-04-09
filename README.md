# caqtdm-web

A React app that renders caQtDM `.ui` files in the browser, using `cs-web-lib` for EPICS PV connections via pvws.

## Development

Requires a conda environment with Node.js. Create one if needed:

```bash
conda create -n nodejs nodejs
```

Then activate and run:

```bash
cd ~/workspace/caqtdm-web
conda activate nodejs
npm run dev
```

## pvws Setup

pvws runs as a Podman container. It must be started with the following environment variables:

```bash
podman stop pvws && podman rm pvws
podman run --network=host -d --name pvws \
  -e PV_WRITE_SUPPORT=true \
  -e EPICS_CA_MAX_ARRAY_BYTES=8000000 \
  -e PV_ARRAY_THROTTLE_MS=1000 \
  pvws:latest
```

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

## Page Layout

Three tabs in the left sidebar:

| Tab | Section | Description |
|---|---|---|
| ⌂ Home | **Motors** | Table of 8 simulated motors (`fr:m1`–`fr:m8`). Each row has a `⋯` button that opens `motorx_tiny.ui` for that motor in a draggable overlay. |
| ⌂ Home | **Detector — Simulated Lorentzian** | Readback table + rolling strip chart for `fr:userCalc1.VAL`. |
| ⌂ Home | **Area Detector — myad:cam1** | Readback table alongside the live camera `.ui` (`29id_cam.ui`). The green `!` button in the camera panel opens `ADBase.ui`. |
| 🔬 Test | **Widget Test** | `test.ui` — exercises all implemented widget types against simulated PVs. |
| ⚛ 29ID-C | **ARPES** | `29idc_ARPES.ui` — real 29ID-C beamline screen. Requires pvws running on `mite`. |

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

### caCartesianPlot

Connects to up to 4 curve pairs via `channels_1`…`channels_4` (format: `"xPv;yPv"` — X channel may be empty, in which case sample index is used as X). Features:
- Auto-scaling axes
- Dashed red grid (matches caQtDM style)
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

### EPICS CALC syntax differences from JavaScript

caQtDM uses EPICS CALC syntax which differs from JavaScript in two ways that are normalised automatically:

- Single `=` means equality (`==`), not assignment — e.g. `A=1` means `A == 1`
- `AND` / `OR` keywords instead of `&&` / `||` — e.g. `C=0 AND A=1 OR B=2`

### caFrame visibility

A `caFrame` with visibility hides its entire group of children at once. In the parser, `caFrame` children are stored with positions relative to the frame (not flattened into the parent coordinate space), so the renderer can wrap them in a single clipping div and show/hide the whole group.
