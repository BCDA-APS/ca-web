# Roadmap

## 1. More widget types

Open real `.ui` files and see what fails to render. Likely candidates:

- `caSpinbox` — numeric input with up/down arrows
- `caSlider` — horizontal/vertical slider for PV writes
- `caToggleButton` — button that toggles between two states
- `caTable` — tabular display of multiple PVs
- `caCartesianPlot` — XY plot widget
- `caStripPlot` — strip chart embedded in a `.ui` file
- `caLed` — indicator light (on/off based on PV value)
- `caThermo` — thermometer-style bar widget

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
