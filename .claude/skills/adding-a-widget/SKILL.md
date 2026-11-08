---
name: adding-a-widget
description: Add a new reusable PV widget under src/widgets/ in ca-web. Use
  whenever the user wants to wrap an EPICS field in a reusable React
  component — "add a widget", "create a PV widget", "wrap a new EPICS
  field", "new ChanRbvBox", "I need a component for <pv-pattern>", or any
  task that creates a new file under src/widgets/. Encodes the
  connector/render split (data via hooks, render is pure), the pvCtx
  context-menu rule (no lint enforces it — easy to forget), alignment
  conventions, and exact import paths. Read this BEFORE writing widget code
  — the rules are tribal and a one-line miss breaks the right-click menu
  silently.
---

# Adding a widget

## When to use

Adding a new component under `src/widgets/` — a value display, a
multi-PV motor control, a small interactive cell — that other panels
and deployments will reuse. Not for one-off panel code that lives
inside a deployment's `index.tsx`; for that, just inline the widget.

## Why the conventions matter

The "Render vs connector convention" section of
`docs/architecture.md` sets out the intended split: data in
`src/hooks/`, render in `src/widgets/`. The reason is the pvCtx
right-click menu — it needs the caller to know the PV string, so a
render-only widget takes `raw` as a prop and lets the caller wire
`onContextMenu`, keeping the PV name in the panel rather than buried
in a widget.

Be aware the current tree does not follow this. Only `useMotor` was
ever extracted, so the `MotorCard*` family is the sole user of
`src/hooks/`, while `BlepsSector`, `CameraViewer`, `DetectorSpectrum`,
`TempController`, `StripChart`, `ScanViewChart`, `ReadbackRow` and
`MotorRow` all call `useConnection` directly. Prefer render-only for
new widgets, but do not expect neighbouring code to match, and do not
"fix" it as a side effect of adding something.

## Steps

1. **Decide the shape.** Render-only (preferred) or smart-leaf
   (justify why). Render-only widgets accept already-resolved props
   (`value`, `raw`, primitives); smart-leaf widgets accept `pv:
   string` and call their hook internally.

2. **Pick the file name.** `src/widgets/<PascalCase>.tsx`. One
   component per file unless variants share a styles block (see
   `MotorCard.tsx` / `MotorCardRow.tsx` / `MotorCardFlat.tsx`).

3. **Write the imports.** Use these exact paths — anything else
   breaks the convention:

   ```tsx
   // Render-only widget — no useConnection here.
   import { fmt, toDouble, pvCtx } from "../lib/epics";
   import { colors, fontSize } from "../lib/theme";

   // Smart-leaf widget only:
   import { useConnection } from "@diamondlightsource/cs-web-lib";
   // …or, if a hook already exists for this domain:
   import { useMotor } from "../hooks/useMotor";

   // If the widget writes back to a PV:
   import { pvwsWriter } from "../lib/pvwsWriter";
   ```

4. **For PV-backed values, use `ChanRbvBox` / `ChanSpBox`.** These
   are in `src/widgets/EpicsWidgets.tsx`. They read precision from
   channel metadata automatically. **`RbvBox` / `SpBox` are for
   computed values that have no PV behind them.** Don't reach for
   `RbvBox` just because it's shorter.

5. **Wire the pvCtx context menu.** Hard rule from `CLAUDE.md:44`,
   no lint enforces it:

   ```tsx
   <ChanRbvBox
     raw={raw}
     onContextMenu={e => pvCtx("PV:NAME", raw, e)}
   />
   ```

   Pass the bare PV name, with no `ca://` prefix — `pvCtx` shows that
   exact string in the info dialog, and every call site in `src/`
   uses the bare form. (`useConnection` does need the
   `ca://` form, and `pvwsWriter.write` adds the prefix itself.) If the widget
   can't know its own PV (purely computed), use `RbvBox` and skip
   `onContextMenu`.

6. **Respect alignment.** Per `CLAUDE.md:45`:
   - Every cell is explicitly left/right/center-aligned. No relying
     on default browser flow.
   - Box and button heights match within a row.
   - Column headers use the same `gap` as data rows so they stay in
     sync with their fields.

   Look at `MotorRow.tsx`'s `styles` block (lines 165-180) for a
   reference — `width` is fixed per column, `textAlign` is explicit,
   buttons and inputs share box-sizing.

7. **Handle disconnection.** `useConnection` returns `[, connected, , raw]`.
   A widget should render a visible placeholder (`"—"`) when
   `!connected || value === null`, not just a blank or a previous
   stale value. See `MotorRow.tsx:38` for the pattern:
   ```tsx
   const posStr = connected && position !== null
     ? position.toFixed(4)
     : "—";
   ```

8. **Avoid `cs-web-lib`'s built-in widgets** unless you have a
   specific reason. ca-web's widgets exist because the library's
   defaults didn't match the alignment / context-menu / theme rules.

9. **Test in a deployment.** Add the widget to one panel in
   `src/deployments/example/index.tsx` or `src/deployments/nefarian/index.tsx`
   so it gets exercised. The pre-commit gate type-checks the whole
   project, but you also want a visual confirmation in `npm run dev`.

## Render-only template

A minimal starting shape — copy, rename, fill in the gaps:

```tsx
// src/widgets/MyValueBox.tsx
import { fmt, toDouble, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";

interface MyValueBoxProps {
  pv: string;          // for the context menu only
  raw: unknown;        // from useConnection in the caller
  connected: boolean;
  width?: number;
}

export function MyValueBox({ pv, raw, connected, width }: MyValueBoxProps) {
  const text = connected ? fmt(toDouble(raw)) : "—";
  return (
    <div
      onContextMenu={e => pvCtx(pv, raw, e)}
      style={{
        fontFamily: "monospace",
        fontSize: fontSize.mono,
        color: colors.rbvText,
        background: colors.rbvBg,
        border: `1px solid ${colors.rbvBorder}`,
        borderRadius: 3,
        padding: "4px 6px",
        textAlign: "right",
        boxSizing: "border-box",
        flexShrink: 0,
        cursor: "context-menu",
        ...(width !== undefined ? { width } : {}),
      }}
    >
      {text}
    </div>
  );
}
```

The caller (a panel) wires the subscription:

```tsx
const [, connected, , raw] = useConnection("my-value", "ca://my:pv");
return <MyValueBox pv="my:pv" raw={raw} connected={connected} />;
```

## Verification

- `npx tsc --noEmit` exits 0 — the type-check covers the new file.
- `npm run dev`, navigate to a deployment that uses the new widget,
  confirm it renders.
- Right-click the new widget — the pvCtx info dialog opens.
- Disconnect pvws (stop the container) and reload — the widget shows
  `"—"`, not a stale value or empty cell.
- The pre-commit gate runs clean (`pre-commit run --all-files`).

See [verifying-before-completion](../verifying-before-completion/SKILL.md)
for the broader evidence rule.

## See also

- `docs/architecture.md` — connector/render convention in depth
  ("Render vs connector convention").
- `src/widgets/EpicsWidgets.tsx` — `RbvBox`, `SpBox`, `ChanRbvBox`,
  `ChanSpBox` reference.
- `src/widgets/MotorRow.tsx` — compact PV row; note it subscribes
  with `useConnection` itself rather than taking `raw` as a prop.
- `src/hooks/useMotor.ts` — example of a connector hook the
  `MotorCard*` smart-leaf family consumes.
- `src/lib/epics.ts` — `fmt`, `toDouble`, `toStr`, `pvCtx`.
- `src/lib/theme.ts` — color tokens and font sizes.
