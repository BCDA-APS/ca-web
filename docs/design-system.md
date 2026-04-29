# EPICS UI Design System

Conventions for building consistent panels in caqtdm-web.
The app uses a **light theme** — background `rgb(222,222,227)`, with blue readbacks and dark-blue setpoints.

---

## Files

| File | Purpose |
|---|---|
| `src/lib/epics.ts` | PV data extraction utilities and right-click context menu |
| `src/lib/theme.ts` | Color tokens and font-size constants |
| `src/widgets/EpicsWidgets.tsx` | Ready-made React components for common EPICS widgets |

---

## Utilities — `src/lib/epics.ts`

```ts
import { toDouble, toStr, fmt, toBool, pvCtx } from "../../lib/epics";
```

| Function | Returns | Use for |
|---|---|---|
| `toDouble(rawData)` | `number \| null` | Numeric PVs (positions, energies, currents…) |
| `toStr(rawData)` | `string \| null` | String / enum PVs |
| `fmt(n, prec?)` | `string` | Formatting a number for display; returns `"—"` for null |
| `toBool(rawData)` | `boolean` | On/Off PVs — checks string label first (handles reversed EPICS enums where 0="On") |
| `pvCtx(pvName, rawData, e)` | `void` | Right-click handler; opens the PV info dialog via App.tsx |

### `pvCtx` usage

```tsx
<RbvBox value={rbv} prec={2} width={110} onContextMenu={e => pvCtx("29idmono:ENERGY_MON", rbvRaw, e)} />
```

Attach directly to the value box (not the whole row) so right-click only triggers on the specific PV element. Shows a popup with value, timestamp, alarm severity, and units. `RbvBox`, `SpBox`, and `TweakValue` all accept `onContextMenu` as a prop.

---

## Theme tokens — `src/lib/theme.ts`

```ts
import { colors, fontSize } from "../../lib/theme";
```

### Colors

| Token | Value | Use for |
|---|---|---|
| `colors.rbvText` | `rgb(10,37,159)` | RBV readback text (dark blue) |
| `colors.rbvBg` | `rgb(236,236,236)` | RBV background (light gray) |
| `colors.rbvBorder` | `rgb(160,168,215)` | RBV border |
| `colors.spText` | `rgb(228,228,228)` | Setpoint text (light) |
| `colors.spBg` | `rgb(0,53,132)` | Setpoint background (dark blue) |
| `colors.spBorder` | `rgb(0,35,90)` | Setpoint border |
| `colors.inputBg` | `rgb(0,53,132)` | Active text input background |
| `colors.inputBorder` | `rgb(0,35,90)` | Active text input border |
| `colors.tweakBg` | `#2060a0` | Tweak ‹ › button background |
| `colors.tweakFg` | `#cce0ff` | Tweak ‹ › button text |
| `colors.tweakBorder` | `#1a4a7a` | Tweak ‹ › button border |
| `colors.relatedBg` | `rgb(210,220,240)` | Related display button background |
| `colors.relatedBorder` | `rgb(160,180,220)` | Related display button border |
| `colors.relatedFg` | `rgb(0,53,132)` | Related display button text |
| `colors.unit` | `#444444` | Unit labels (eV, mA, Torr…) |
| `colors.label` | `#333333` | Row labels, motor names |
| `colors.dim` | `#666666` | Dimmed / secondary text |
| `colors.sectionHdr` | `#7c6fa0` | Section header text |
| `colors.cardBg` | `rgb(200,200,205)` | Motor card background |
| `colors.cardBgDisabled` | `rgb(185,185,190)` | Disabled motor card background |
| `colors.cardBarBg` | `rgb(175,175,180)` | Motor position bar track |
| `colors.cardBarThumb` | `rgb(0,53,132)` | Motor position bar thumb |
| `colors.statusOk` | `#4caf50` | OK / done / green |
| `colors.statusWarn` | `#f9a825` | Warning / busy / amber |
| `colors.statusError` | `#e53935` | Error / hard limit / red |

### Font sizes

| Token | px | Use for |
|---|---|---|
| `fontSize.mono` | 14 | RBV and SP numeric values |
| `fontSize.label` | 11 | Row labels, units, status text |
| `fontSize.small` | 10 | Small status badges |
| `fontSize.badge` | 12 | GRT/mirror/mode labels |

---

## Widgets — `src/widgets/EpicsWidgets.tsx`

```tsx
import { RbvBox, SpBox, TweakValue, TweakButton, UnitLabel, RelatedDisplay, Row } from "../../widgets/EpicsWidgets";
```

### `RbvBox` — read-only readback

```tsx
<RbvBox value={rbv} prec={3} width={110} onContextMenu={e => pvCtx("pv:name", raw, e)} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `number \| null` | — | Numeric value to display |
| `prec` | `number` | `3` | Decimal places |
| `width` | `number` | (fills container) | Fixed width in px |
| `onContextMenu` | `(e) => void` | — | Right-click handler |
| `style` | `CSSProperties` | — | Style overrides |

### `SpBox` — click-to-edit setpoint

```tsx
<SpBox value={sp} prec={3} width={110} onCommit={n => pvwsWriter.write("pv:name", n)} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `number \| null` | — | Current setpoint value |
| `prec` | `number` | `3` | Decimal places |
| `width` | `number` | (fills container) | Fixed width in px |
| `onCommit` | `(n: number) => void` | — | Called when user presses Enter |
| `disabled` | `boolean` | `false` | Prevents editing |
| `onContextMenu` | `(e) => void` | — | Right-click handler |

### `TweakValue` — step size editor

```tsx
<TweakValue value={twv} onCommit={n => pvwsWriter.write("pv:TWV", n)} style={{ width: 54 }} onContextMenu={e => pvCtx("pv:TWV", raw, e)} />
```

Click to edit. `↑` multiplies by 10, `↓` divides by 10. Styled to match `SpBox` (dark blue background, light text).

### `TweakButton` — ‹ / › tweak button

```tsx
<TweakButton onClick={() => pvwsWriter.write("pv:TWR", 1)} size={24}>‹</TweakButton>
<TweakButton onClick={() => pvwsWriter.write("pv:TWF", 1)} size={24}>›</TweakButton>
```

### `UnitLabel` — unit text

```tsx
<UnitLabel width={32}>eV</UnitLabel>
```

### `RelatedDisplay` — opens a related panel

```tsx
<RelatedDisplay label="Ring Info" onClick={openRingInfo} />
```

Renders with the canonical related display button style (`relatedBg/Fg/Border` tokens): light blue-gray background with dark blue text.

### `Row` — flex layout row

```tsx
<Row mt={2} onContextMenu={e => pvCtx("pv:name", raw, e)}>
  <RbvBox ... />
  <UnitLabel>eV</UnitLabel>
</Row>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | — | Row contents |
| `mt` | `number` | `0` | Top margin in px |
| `onContextMenu` | `(e) => void` | — | Right-click on the whole row (prefer attaching to the specific value box instead) |

---

## Example — minimal panel section

```tsx
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";
import { toDouble, pvCtx } from "../../lib/epics";
import { colors, fontSize } from "../../lib/theme";
import { RbvBox, SpBox, UnitLabel, Row } from "../../widgets/EpicsWidgets";

function MySection() {
  const [,,,  rbvRaw] = useConnection("my-rbv", "ca://29id:myMotor.RBV");
  const [,,, spRaw]  = useConnection("my-sp",  "ca://29id:myMotor.VAL");

  const rbv = toDouble(rbvRaw);
  const sp  = toDouble(spRaw);

  return (
    <div>
      <div style={{ fontSize: fontSize.label, fontWeight: 700, color: colors.sectionHdr, marginBottom: 6 }}>
        My Motor
      </div>

      <Row>
        <RbvBox value={rbv} prec={4} width={110} onContextMenu={e => pvCtx("29id:myMotor.RBV", rbvRaw, e)} />
        <UnitLabel width={32}>mm</UnitLabel>
      </Row>

      <Row>
        <SpBox value={sp} prec={4} width={110} onCommit={n => pvwsWriter.write("29id:myMotor.VAL", n)} onContextMenu={e => pvCtx("29id:myMotor.VAL", spRaw, e)} />
        <UnitLabel width={32}>mm</UnitLabel>
      </Row>
    </div>
  );
}
```

---

## Notes

- **ChamberDiagram** is SVG-based so it cannot use the HTML widget components, but it does import `toDouble`, `toStr`, and `pvCtx` from `epics.ts`. Use `colors.*` tokens for SVG `fill` and `stroke` attributes.
- **Import paths** depend on where your panel lives. Panels in `src/deployments/29id/` use `../../lib/...` and `../../widgets/...`.
- **Right-click PV info** is handled globally by `App.tsx`. Any element that dispatches a `"pv-context"` custom event (via `pvCtx`) will show the PV info dialog automatically.
- **TweakValue and SpBox share the same colors** (`spBg/spText/spBorder`) to signal they are both editable inputs. If you ever need to differentiate them, add dedicated tokens to `theme.ts`.
