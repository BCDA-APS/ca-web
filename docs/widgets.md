# Widget Catalog

Higher-level reference for `src/widgets/`. For colors, font tokens, and
the full prop tables for `RbvBox`/`SpBox`/`TweakValue`, see
[design-system.md](design-system.md).

## Two flavors of EPICS-bound widget

The widget library distinguishes between **PV-named** boxes (you pass a
plain number) and **channel-backed** boxes (you pass the raw channel
object so the widget can read precision and other metadata).

| Widget | Source | Use when |
|---|---|---|
| `RbvBox` | `EpicsWidgets.tsx` | Computed values not directly backed by a PV |
| `SpBox` | `EpicsWidgets.tsx` | Computed setpoint values not directly backed by a PV |
| `ChanRbvBox` | `EpicsWidgets.tsx` | Any PV-backed readback (preferred) |
| `ChanSpBox` | `EpicsWidgets.tsx` | Any PV-backed setpoint (preferred) |

`ChanRbvBox` and `ChanSpBox` accept the raw channel object directly,
read `display.precision` from the PV metadata, and fall back to a prop
default if it is unavailable. Use them whenever you have a PV — they
remove the need to wire precision by hand.

```tsx
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { ChanRbvBox, ChanSpBox } from "../../widgets/EpicsWidgets";
import { pvCtx } from "../../lib/epics";
import { pvwsWriter } from "../../lib/pvwsWriter";

const [,,, rbvRaw] = useConnection("rbv", "ca://29id:m1.RBV");
const [,,, spRaw]  = useConnection("sp",  "ca://29id:m1.VAL");

<ChanRbvBox
  raw={rbvRaw}
  width={110}
  onContextMenu={e => pvCtx("29id:m1.RBV", rbvRaw, e)}
/>
<ChanSpBox
  raw={spRaw}
  width={110}
  onCommit={n => pvwsWriter.write("29id:m1.VAL", n)}
  onContextMenu={e => pvCtx("29id:m1.VAL", spRaw, e)}
/>
```

## Mandatory rules

These are project-wide invariants. Code review will reject violations.

1. **Every `ChanRbvBox` and `ChanSpBox` must wire `onContextMenu={pvCtx(...)}`.**
   The `pvCtx` handler (from `lib/epics.ts`) dispatches the
   `pv-context` event that `App.tsx` listens for. Without it the
   right-click PV info dialog will not appear.

2. **Use `ChanRbvBox`/`ChanSpBox` for PV values.** Reach for
   `RbvBox`/`SpBox` only when displaying a computed value (e.g. a sum
   of two PVs) where no single PV provides precision metadata.

3. **Align all columns explicitly.** Inside a panel, every cell is
   left-aligned, right-aligned, or centered — never left to default
   browser flow. Boxes and buttons in the same row share the same
   height. Column headers use the same `gap` as the data rows so they
   stay in sync.

## Motor cards

Three layout variants in `src/widgets/`:

| File | Layout | Notes |
|---|---|---|
| `MotorCard.tsx` | Full card | Position, readback, setpoint, tweak buttons, status border |
| `MotorCardRow.tsx` | Compact horizontal row | Status border on the left |
| `MotorCardFlat.tsx` | Minimal decoration | For dense grids |

They share status-color derivation and tweak button logic. Consolidating
them into one component with a layout prop is queued work (see
`architecture.md`).

`MotorGrid.tsx` is a 3-column container that you can drop motor cards
into. `MotorRow.tsx` is a PV-name-based row (not raw-channel-based) that
is older than the `Chan*` wrappers and may eventually move to using them.

## Other widgets

- `ReadbackRow.tsx` — single readback label + value, for simple readouts.
- `StripChart.tsx` — multi-PV rolling time-series chart with sidebar,
  Y-axis modes, and per-PV persistence. Custom implementation
  (separate from the `caStripPlot`-from-`.ui` renderer).

## Where the `ca*` widgets live

Widgets used by parsed `.ui` files (`caLineEdit`, `caGraphics`,
`caStripPlot`, etc.) are dispatched from `src/lib/UiRenderer.tsx`, not
from `src/widgets/`. See [ui-rendering.md](ui-rendering.md). The full
list of supported `ca*` widgets is documented in the project
[README](../README.md#implemented-widgets).
