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

`.ui` files are served from `public/ui/`. Two symlinks provide access to external screen libraries:

| Path | Points to |
|---|---|
| `public/ui/motors` | motor screens (`motorApp/op/ui/autoconvert/`) |
| `public/ui/ADCore` | area detector screens (`ADCore/ADApp/op/ui/`) |
| `public/ui/29id` | 29-ID beamline screens (`/net/s29dserv/xorApps/ui/29id/`) |

## Page Layout

| Section | Description |
|---|---|
| **Motors** | Table of 8 simulated motors (`fr:m1`–`fr:m8`). Each row has a `⋯` button that opens `motorx_tiny.ui` for that motor in a draggable overlay. |
| **Detector — Simulated Lorentzian** | Readback table + rolling strip chart for `fr:userCalc1.VAL`. |
| **Area Detector — myad:cam1** | Readback table alongside the live camera `.ui` (`29id_cam.ui`). The green `!` button in the camera panel opens `ADBase.ui`. |

## Implemented Widgets

| Widget | Notes |
|---|---|
| `caLabel` | Static text |
| `caLineEdit` | Readback; supports hex format (`0x…`) |
| `caTextEntry` | Writeable PV input |
| `caGraphics` | Rectangle/frame decorations |
| `caChoice` | Enum dropdown |
| `caMenu` | Variable dropdown with 3D relief |
| `caMessageButton` | Momentary write button |
| `caRelatedDisplay` | Opens overlay panels; `stackingMode="Hidden"` renders as transparent overlay |
| `caPolyLine` | SVG decorative lines |
| `caByte` | Bit field display (colored squares, startBit..endBit) |
| `caCamera` | Live area detector image display (see below) |
| `caInclude` | Embeds another `.ui` file inline; inherits parent macros |
| `caCartesianPlot` | XY line/dot chart for waveform PVs; auto-scales axes; up to 4 curves |
| `caLed` | Boolean indicator; color from `trueColor`/`falseColor` props (default: red/grey) |
| `caThermo` | Vertical bar gauge; reads `maxValue` from `.ui`; navy/blue theme |
| `caSpinbox` | Numeric spin control with ▲/▼ buttons; respects `stepSize` |
| `caSlider` | Horizontal/vertical slider; limits from LOPR/HOPR (then DLLM/DHLM, then `.ui` min/max) |
| `caToggleButton` | Checkbox that writes 0/1 to a PV |
| `caTable` | Multi-PV readback table (name · value · units); up to 16 PVs |
| `caStripPlot` | Rolling time-series chart; SVG with grid, axes, ticks, legend; `period` prop sets window (default 60 s) |

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
