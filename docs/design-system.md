# EPICS UI Design System

Conventions for building consistent panels in caqtdm-web.

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
<Row onContextMenu={e => pvCtx("29idmono:ENERGY_MON", rbvRaw, e)}>
  ...
</Row>
```

Attach to a `Row` (or any element) to make right-click show the PV info popup with value, timestamp, alarm severity, and units.

---

## Theme tokens — `src/lib/theme.ts`

```ts
import { colors, fontSize } from "../../lib/theme";
```

### Colors

| Token | Hex | Use for |
|---|---|---|
| `colors.rbvText` | `#80deea` | RBV readback text (cyan) |
| `colors.rbvBg` | `#1a2a3a` | RBV background |
| `colors.rbvBorder` | `#2a3a4a` | RBV border |
| `colors.spText` | `#ffffff` | Setpoint text |
| `colors.spBg` | `#1a3258` | Setpoint background |
| `colors.spBorder` | `#2a5a9a` | Setpoint border |
| `colors.inputBg` | `#1a3a4a` | Active text input background |
| `colors.inputBorder` | `#4a90d9` | Active text input border |
| `colors.tweakBg` | `#2060a0` | Tweak ‹ › button background |
| `colors.tweakFg` | `#cce0ff` | Tweak ‹ › button text |
| `colors.tweakBorder` | `#1a4a7a` | Tweak ‹ › button border |
| `colors.relatedBg` | `#0d2a4a` | Related display button background |
| `colors.relatedBorder` | `#2a5a9a` | Related display button border |
| `colors.relatedFg` | `#90caf9` | Related display button text / secondary values |
| `colors.unit` | `#7a9ab8` | Unit labels (eV, mA, Torr…) |
| `colors.label` | `#cce0ff` | Row labels, motor names |
| `colors.dim` | `#546e8a` | Dimmed / secondary text |
| `colors.sectionHdr` | `#7c6fa0` | Section header text |
| `colors.cardBg` | `#1e3a5c` | Motor card background |
| `colors.cardBgDisabled` | `#111e30` | Disabled motor card background |
| `colors.statusOk` | `#4caf50` | OK / done / moving green |
| `colors.statusWarn` | `#f9a825` | Warning / soft limit amber |
| `colors.statusError` | `#e53935` | Error / hard limit red |

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

### `TweakValue` — step size editor

```tsx
<TweakValue value={twv} onCommit={n => pvwsWriter.write("pv:TWV", n)} style={{ width: 54 }} />
```

Click to edit. `↑` multiplies by 10, `↓` divides by 10.

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

Renders with the canonical dark-blue button style (same as Gauge/Pump in the chamber panel).

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
| `onContextMenu` | `(e) => void` | — | Right-click on the whole row |

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

      <Row onContextMenu={e => pvCtx("29id:myMotor.RBV", rbvRaw, e)}>
        <RbvBox value={rbv} prec={4} width={110} />
        <UnitLabel width={32}>mm</UnitLabel>
      </Row>

      <Row onContextMenu={e => pvCtx("29id:myMotor.VAL", spRaw, e)}>
        <SpBox value={sp} prec={4} width={110} onCommit={n => pvwsWriter.write("29id:myMotor.VAL", n)} />
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
- **Right-click PV info** is handled globally by `App.tsx`. Any element that dispatches a `"pv-context"` custom event (via `pvCtx`) will show the dark-themed PV info dialog automatically.
