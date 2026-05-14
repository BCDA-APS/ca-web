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

`docs/architecture.md:67-83` codifies the split: data
lives in `src/hooks/`, render lives in `src/widgets/`. Two reasons:

1. PV subscriptions are stateful and ordered. If a widget calls
   `useConnection` itself, two copies in the same tree subscribe
   twice, double-count cs-web-lib's reconnect work, and bloat the
   Redux store.
2. The pvCtx right-click menu requires the caller to know the PV
   string. Render-only widgets accept `raw` as a prop and let the
   caller wire `onContextMenu`, so the PV name stays in the panel,
   not buried in a widget.

The exception is a **smart leaf** — a widget that takes `pv: string`
and is reused so widely that asking every caller to wire
`useConnection` would be churn (the `MotorCard*` family qualifies).
Those call their connector hook directly. Default to render-only;
choose smart-leaf only when the call-site burden justifies it.

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
   import { fmt, pvCtx } from "../lib/epics";
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

5. **Wire the pvCtx context menu.** Hard rule from `CLAUDE.md:45`,
   no lint enforces it:

   ```tsx
   <ChanRbvBox
     raw={raw}
     onContextMenu={e => pvCtx("ca://PV:NAME", raw, e)}
   />
   ```

   The PV string must include the `ca://` prefix; `pvCtx` opens the
   info dialog with that exact name. If the widget can't know its
   own PV (purely computed), use `RbvBox` and skip `onContextMenu`.

6. **Respect alignment.** Per `CLAUDE.md:46`:
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
import { fmt, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";

interface MyValueBoxProps {
  pv: string;          // for the context menu only
  raw: unknown;        // from useConnection in the caller
  connected: boolean;
  width?: number;
}

export function MyValueBox({ pv, raw, connected, width }: MyValueBoxProps) {
  const text = connected ? (fmt(raw) ?? "—") : "—";
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
return <MyValueBox pv="ca://my:pv" raw={raw} connected={connected} />;
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

- `docs/architecture.md` — connector/render convention
  in depth (lines 67-93).
- `src/widgets/EpicsWidgets.tsx` — `RbvBox`, `SpBox`, `ChanRbvBox`,
  `ChanSpBox` reference.
- `src/widgets/MotorRow.tsx` — render-only PV row, end-to-end.
- `src/hooks/useMotor.ts` — example of a connector hook the
  `MotorCard*` smart-leaf family consumes.
- `src/lib/epics.ts` — `fmt`, `toDouble`, `toStr`, `pvCtx`.
- `src/lib/theme.ts` — color tokens and font sizes.
