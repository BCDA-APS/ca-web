---
name: adding-a-panel
description: Add a new draggable panel to an existing ca-web deployment
  under src/deployments/<id>/. Use whenever the user wants to extend an
  already-built deployment with a new view — "add a panel to <deployment>",
  "new tab content", "extend <deployment> with X", "surface <thing> in
  <deployment>", "add motors/chamber/scan/etc. to <deployment>". Read this
  BEFORE editing config.json or index.tsx: panel id slugs are localStorage
  keys with no rename migration, and a single typo between config.json and
  index.tsx silently breaks position persistence for every user. Do not
  use for scaffolding a new deployment (use new-deployment for that).
---

# Adding a panel to an existing deployment

## When to use

The user wants a new draggable panel inside a deployment that already
exists (`src/deployments/<id>/`). For *scaffolding a new deployment*
from scratch, use [new-deployment](../new-deployment/SKILL.md)
instead. For *building a new reusable widget*, use
[adding-a-widget](../adding-a-widget/SKILL.md).

## The trap to know about first

Panel `id` slugs are **localStorage keys**. `src/lib/layoutStorage.ts`
namespaces every stored position as
`ca-web.<deploymentId>.panel:<panelId>` (and the same for hidden
panels, overlays, strip-chart per-instance state). The migration in
`migrateOldKeys` (lines 29-48) only moves *legacy unprefixed* keys
forward; it does not handle renames of existing panel ids.

Practical effect:

- Pick the id once, in kebab-case, and never rename it after release.
- If you must rename, every user with a saved layout for that panel
  loses their position. There is no automatic migration.
- The id in `config.json` `panelDefaults` must match the id in
  `index.tsx` `tabPanels` exactly. A mismatch means the panel
  renders but its position never persists (the storage write goes
  to a key nothing reads).

## Steps

1. **Read the deployment.** Open `src/deployments/<id>/config.json`
   and `src/deployments/<id>/index.tsx`. Note the existing `tabs`,
   `panelDefaults` ids, and the `tabPanels` keys in TSX. You're
   going to add to all three (or two, if the panel isn't hidden by
   default).

2. **Pick the tab.** Decide which tab id (from `config.json` `tabs`)
   the panel belongs on. If no tab fits, you're probably adding a
   tab too — that's an extension of this skill, see "Adding a tab"
   below.

3. **Pick the slug.** Kebab-case, descriptive,
   collision-free against existing `panelDefaults` keys. Examples
   from the codebase: `motors`, `lorentzian`, `area-detector`,
   `29idc-chamber-v2`, `29id-strip-tool`. Aim for a name that
   doesn't need to change if the panel's contents evolve — once
   shipped, this slug is durable.

4. **Update `config.json`.** Add an entry to `panelDefaults` with an
   initial position. Offset from existing panels so the new one
   isn't covered:

   ```json
   "panelDefaults": {
     "existing-panel":  { "x": 108, "y":  56 },
     "your-new-panel":  { "x": 108, "y": 460 }
   }
   ```

   If the panel should be hidden by default, also add the slug to
   `defaultHiddenPanels`:

   ```json
   "defaultHiddenPanels": ["your-new-panel"]
   ```

5. **Update `index.tsx`.** Inside the `tabPanels` object, add an
   entry under the chosen tab id:

   ```tsx
   const tabPanels: DeploymentConfig["tabPanels"] = {
     1: [
       // …existing panels…
       { id: "your-new-panel", title: "Your Panel", Content: YourPanelContent },
     ],
   };
   ```

   Then declare the `Content` component below the export:

   ```tsx
   function YourPanelContent() {
     return <div>…panel content…</div>;
   }
   ```

   If the panel uses PV-backed widgets, follow the rules in
   [adding-a-widget](../adding-a-widget/SKILL.md): use `ChanRbvBox`
   / `ChanSpBox`, wire `onContextMenu={e => pvCtx("ca://PV", raw, e)}`,
   keep alignment explicit.

6. **Confirm the id matches in both files.** A typo here is the most
   common bug — the panel renders but its position resets on every
   reload. `grep "your-new-panel" src/deployments/<id>/` should
   return exactly two hits: one in `config.json`, one in `index.tsx`.

## Adding a tab (extension)

If the new panel needs a brand-new tab:

1. Add the tab to `config.json` `tabs` with a fresh integer `id`,
   single-character `icon` (no emojis per `CLAUDE.md`), `label`, and
   optional `color`.
2. Use that `id` as the key in `tabPanels` in `index.tsx`.
3. Tab ids are stable too — they appear in URLs and could be wired
   into user habits. Don't renumber existing tabs.

## Verification

- `npx tsc --noEmit` exits 0.
- `npm run dev`, open `http://localhost:4200/?deployment=<id>`,
  navigate to the chosen tab — the panel appears at the position
  set in `panelDefaults`.
- Drag the panel to a new position, reload the page — the new
  position persists. (If it resets, the id mismatched between
  `config.json` and `index.tsx`.)
- If the panel uses PV widgets, right-click one — the pvCtx info
  dialog opens.
- The pre-commit gate runs clean.

See [verifying-before-completion](../verifying-before-completion/SKILL.md)
for the broader evidence rule.

## See also

- [new-deployment](../new-deployment/SKILL.md) — for the *initial*
  scaffold of a deployment, not an extension.
- [adding-a-widget](../adding-a-widget/SKILL.md) — for the
  per-widget conventions any PV-backed panel must follow.
- `src/lib/layoutStorage.ts` — the namespacing and migration that
  make id-stability matter.
- `src/lib/deployment.ts` — `DeploymentConfig` and `PanelConfig` types.
- `src/deployments/example/{config.json,index.tsx}` — the canonical
  shape to mirror.
