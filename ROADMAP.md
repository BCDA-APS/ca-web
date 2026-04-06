# Roadmap

## 1. More widget types

Open real `.ui` files and see what fails to render. Remaining candidates:

- `caWaveTable` — editable waveform table
- `caDoubleTabWidget` — specialised tab container
- `caScriptButton` — button that runs a script

A good test: open `ADBase.ui` and audit what renders vs. what shows nothing.

## 2. Macro inheritance in related displays

When a `caRelatedDisplay` opens a screen with `args="P=$(P),R=cam1:"`,
the `$(P)` is substituted at parse time by the parent macros — this works
for one level. But if that child screen opens another screen, the chain
may break because the overlay `UiRenderer` is given only the parsed args
as macros, not the full parent macro set.

Fix: in `CaRelatedDisplayWidget`, merge parent macros (from `MacrosContext`)
with the parsed item macros before passing them to the overlay.

## 3. Open arbitrary `.ui` files

The app is currently hardcoded to specific screens. Options:

- **URL parameter** — `?ui=/ui/ADCore/autoconvert/ADBase.ui&P=myad:&R=cam1:`
  so any screen can be loaded by URL
- **File picker** — a UI element to browse available `.ui` files from the
  `motors/` and `ADCore/` symlink trees
- **Config-driven** — a YAML/JSON config listing the screens to show on
  the main page (revive `display.yaml` but actually load it)

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

## 8. Distributed access across the beamline subnet

Demonstrate that the app is accessible from any computer on the beamline
subnet, not just localhost. Steps:

- Bind Vite dev server (or a production build served by nginx/caddy) to
  `0.0.0.0` so it's reachable by IP
- Ensure pvws is similarly bound and that `VITE_PVWS_SOCKET` in `.env`
  points to the server's hostname/IP rather than `localhost`
- Document the setup in README so any beamline workstation can connect

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

## 11. QTabWidget support

`.ui` files that use `QTabWidget` as a container currently render all tab
pages stacked on top of each other (the parser flattens them). Proper support
would:

- Detect `QTabWidget` in the parser and emit it as a typed container node
  (rather than flattening children into the widget list)
- Render it as a real tab bar with clickable tabs, respecting `currentIndex`
  as the initially selected tab
- Handle nested `QTabWidget` (tabs within tabs, as seen in `test.ui`)
- Preserve absolute positioning of child widgets within each tab page
