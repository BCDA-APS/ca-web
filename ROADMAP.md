# Roadmap

## 1. More widget types

Open real `.ui` files and see what fails to render. Remaining candidates:

- `caWaveTable` — editable waveform table
- `caDoubleTabWidget` — specialised tab container
- `caScriptButton` — button that runs a script

A good test: open `ADBase.ui` and audit what renders vs. what shows nothing.

## 2. Macro inheritance in related displays

`parseUi` already applies macro substitution to all property values at parse
time, including the `args` string in `caRelatedDisplay`. So `$(P)` in args is
resolved before `CaRelatedDisplayWidget` ever reads it — the chain works for
the common case. The only gap is when a child's related display has empty args
but the grandchild still needs macros from the grandparent (never explicitly
forwarded). Not yet observed in practice at 29-ID.

## 3. ~~Open arbitrary `.ui` files~~ ✓ Done

An "Open…" button in the header opens a searchable file picker listing all
`.ui` files from the NFS display search path. Selecting a file opens it as a
floating overlay. A macro input with auto-detected hints (scanned from the
`.ui` file) lets the user supply the correct macro set before opening.

## 4. caCamera polish

- **Color maps** — jet, hot, cool, viridis in addition to grayscale
- **Histogram** — display pixel value distribution to help set min/max
- **ROI display** — draw a region-of-interest overlay
- **Data type awareness** — currently assumes uint8; handle uint16
  (values > 255) and float data correctly

## 5. General rendering improvements

- **sizePolicy support** — widgets with `MinimumExpanding` should stretch
  to fill available space (currently only caCamera does this via `right:0`)
- **Visibility conditions** — `caQtDM` supports showing/hiding widgets
  based on PV values; `visibilityCalc` is partially parsed but not fully
  wired up for all widget types
- **Font scaling** — verify that font sizes match caQtDM across all widget
  types at different scales

## 6. ~~Movable / lockable panels~~ ✓ Done

## 7. ~~Tabbed sidebar navigation~~ ✓ Done

## 8. ~~Distributed access across the beamline subnet~~ ✓ Done

pvws runs on `mite` (beamline machine on the 29ID private subnet). Vite dev
server binds to `0.0.0.0:4200`. Any browser on the subnet can open
`http://mite:4200` and reach real 29ID PVs. See `DEPLOYMENT.md` for the
full setup including known pitfalls (NFS overlay storage, `--no-hosts`, etc.).

## 9. Line profile on images

On the caCamera canvas, allow the user to draw a horizontal or vertical line
by clicking and dragging. Display the pixel intensity profile along that line
in a small chart below or beside the image. Useful for beam alignment and
diagnostics.

## 10. Click-to-move on line scans and images

- **Line scan** (strip chart / caCartesianPlot): clicking on a point in a
  scan curve writes the corresponding motor position to the motor's `.VAL` PV,
  moving the motor to that position.
- **Camera image**: clicking on a pixel writes the corresponding X/Y motor
  positions (requires a coordinate mapping configuration linking pixel
  coordinates to motor PV pairs).

## 11. ~~QTabWidget support~~ ✓ Done

Parser emits `QTabWidget` as a structured widget with per-tab widget lists.
Renderer shows a clickable tab bar; active tab defaults to `currentIndex`.
Child widget positions are relative to the tab page content area.
