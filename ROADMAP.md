# Roadmap

## 1. More widget types

Open real `.ui` files and see what fails to render. Remaining candidates:

- `caWaveTable` — editable waveform table
- `caDoubleTabWidget` — specialised tab container
- `caScriptButton` — button that runs a script

## 2. Macro inheritance in related displays

`parseUi` already applies macro substitution to all property values at parse
time, including the `args` string in `caRelatedDisplay`. So `$(P)` in args is
resolved before `CaRelatedDisplayWidget` ever reads it — the chain works for
the common case. The only gap is when a child's related display has empty args
but the grandchild still needs macros from the grandparent (never explicitly
forwarded). Not yet observed in practice at 29-ID.

## 3. ~~Open arbitrary `.ui` files~~ ✓ Done

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

See `DEPLOYMENT.md` for the full setup including known pitfalls 
(NFS overlay storage, `--no-hosts`, etc.).

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

## 12. Per-deployment App configuration

Currently `App.tsx` hardcodes tabs for both the simulated IOC (nefarian) and
29ID (mite). As deployments multiply, these should be separated.

**Approach:** keep one repo on NFS; split tab/panel definitions into
`src/deployments/29id.tsx`, `src/deployments/nefarian.tsx`, etc. `App.tsx`
becomes a generic shell that imports the active deployment selected by
`VITE_DEPLOYMENT`. `UiRenderer.tsx` and `uiParser.ts` remain fully shared.

Use Vite's native mode support for per-deployment config — no shell variable
overrides needed:

```
.env.nefarian   VITE_PVWS_SOCKET=localhost:8080  VITE_DEPLOYMENT=nefarian
.env.29id       VITE_PVWS_SOCKET=mite:8080       VITE_DEPLOYMENT=29id
```

```bash
npm run dev -- --mode nefarian   # on nefarian
npm run dev -- --mode 29id       # on mite
```

Both files can be committed (no secrets). The existing `.env` stays gitignored
as a generic local fallback.
