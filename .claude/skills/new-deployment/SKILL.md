---
name: new-deployment
description: Scaffold a new ca-web beamline deployment under src/deployments/.
  Use whenever the user says "new deployment", "create a deployment",
  "scaffold a deployment", "add a beamline", "set up a new instrument
  panel", or asks to populate an empty src/deployments/<id>/ folder — even
  if they don't say "scaffold" explicitly. Interviews for id, title, pvws
  socket, tabs, panels, and PVs; optionally ingests an external UI directory
  for quick-links; writes config.json and index.tsx. Do NOT use to edit an
  existing deployment (use adding-a-panel for that).
---

# Scaffolding a new deployment

## When to use

The user wants a new beamline deployment in `src/deployments/<id>/`.
Triggers include "new deployment", "create a deployment", "scaffold a
deployment", "add a beamline", or any request to set up an unfamiliar
folder under `src/deployments/`. The skill refuses to overwrite an
existing deployment.

Do not use for editing or refactoring an existing deployment — that's a
plain code task. This skill is for the *initial* scaffold.

## Why this exists

`docs/deployments.md` documents the copy-and-customize path. Doing it by
hand is error-prone: `config.json` must match `DeploymentConfig` exactly,
the folder name must equal `config.id` (`src/lib/deployment.ts:90`), panel
`id` slugs are localStorage keys that must not be renamed casually, and
`index.tsx` has a particular shape (strip the build-time `paths`, build
`tabPanels`, spread back into the export). An interactive walk-through
keeps every new deployment in shape.

## Steps

1. **Preflight.** Verify the working directory is ca-web:

   - `src/deployments/` exists.
   - `src/lib/deployment.ts` exists.

   If either is missing, stop and tell the user: "This skill only runs
   inside the ca-web repo."

2. **Pick a template deployment.**

   - List `src/deployments/*/` to enumerate available templates.
   - Default to `example` (the canonical template per
     `src/deployments/example/index.tsx`).
   - Read the chosen template's `config.json` and `index.tsx` so the
     answers can merge into the same shape. The template tells you the
     defaults for `tabs`, `panelDefaults`, and the import block.

3. **Interview — core fields.** Use one `AskUserQuestion` batch:

   - `id` — lowercase slug, hyphens allowed. Must match the folder
     name (enforced at runtime by `loadDeployment` in
     `src/lib/deployment.ts:90`). Once the user picks an id, recheck
     step 1's overwrite-protection against the chosen slug before
     proceeding.
   - `title` — human-readable name shown in the picker and header.
   - `pvws.socket` — host:port for the pvws gateway. Default:
     `localhost:8080` (matches the `example` template).
   - `pvws.ssl` — boolean. Default: `false`.

4. **Interview — tabs.** First ask: how many tabs? (1–3 is typical.)
   Then, for each tab, ask `id` (integer, starting from 1), `icon`
   (single character or emoji-free glyph), `label`, and optional
   `color`. Reuse the template's defaults so the user can accept them
   in one shot.

5. **Interview — panels.** Loop until the user says "done":

   For each panel, ask in one batch:

   - `id` — kebab-case slug. **These are localStorage keys** —
     `src/lib/layoutStorage.ts` stores panel positions under
     `ca-web.<deploymentId>.panel:<panelId>`, with no rename migration.
     Pick once, keep stable across releases. See
     [adding-a-panel](../adding-a-panel/SKILL.md) for the trap in depth.
   - `title` — display name on the panel header.
   - `widget` — one of the catalog rows below, or `Custom` for a
     placeholder.
   - `tab` — which tab id the panel belongs to.
   - `panelDefaults.x` and `panelDefaults.y` — initial position. Start
     near `108, 56` and offset by ~400 horizontally / ~400 vertically.

   After each panel, ask "another panel?" If no, move on.

6. **Interview — PVs.** First ask the beamline PV prefix (e.g.
   `29idc:`). Then, based on the widget chosen for each panel in
   step 5:

   - `MotorGrid` / `MotorRow` → ask for a list of motors. Per motor:
     `label`, `suffix` (e.g. `m1`), optional `macros` (key/value pairs
     like `{ P: "fr:", M: "m1" }`).
   - `StripChart` → ask for a list of traces: `pv`, `label`,
     `enabled` (default true).
   - `ReadbackRow` → ask for a single PV and label.

7. **Optional — scan an external UI folder.** Ask: "Is there an
   external folder of `.ui` screens to seed quick-links from? Paste a
   path or skip."

   If the user supplies a path:

   - List `*.ui` files under that path (one level, no recursion).
   - If the path doesn't exist or is empty, skip gracefully and tell
     the user "no .ui files found, skipping quick-links".
   - For each file found, propose a `quickLinks` entry:
     `{ "label": "<filename without ext>", "file": "<path>", "macros": {} }`
   - Ask the user which to include (multi-select). The chosen entries
     go into `config.json` under `quickLinks`.

   If the user skips, `quickLinks` is omitted from `config.json`.

8. **Render and write.**

   **`src/deployments/<id>/config.json`** — merge the answers into the
   template's shape. Required keys: `id`, `title`, `pvws`, `tabs`,
   `panelDefaults`. Include `quickLinks` only if step 7 produced any.
   Omit the build-time `paths` block — add a one-line comment in the
   chat after writing that the user should add `paths.uiDirs` /
   `startupScript` / `adl2ui` manually if they need NFS macros (see
   `src/deployments/29id/config.json` for the shape; `vite.config.ts`
   reads it at build time).

   **`src/deployments/<id>/index.tsx`** — mirror the structure of
   `src/deployments/example/index.tsx`:

   - Import only the widgets you actually use (per step 5 choices).
   - Always import the type:
     `import type { DeploymentConfig, DeploymentConfigData } from "../../lib/deployment";`
   - `import rawConfig from "./config.json";`
   - Strip the build-time `paths` block:
     ```ts
     const { paths: _paths, ...deploymentFields } = rawConfig as DeploymentConfigData;
     void _paths;
     ```
   - Declare PV arrays as `const` near the top (mirror the `MOTORS`,
     trace lists in `example/index.tsx`).
   - Build the `tabPanels: DeploymentConfig["tabPanels"]` object,
     keying by tab id.
   - For each Content component, emit a small `function <Name>Content()`
     that renders the chosen widget with the PV data from step 6.
   - End with:
     ```ts
     export const config: DeploymentConfig = { ...deploymentFields, tabPanels };
     ```

   Use the **Write** tool for both files. Do not start the dev server.

9. **Hand off.** Print the verification commands and stop.

## Widget catalog

When step 5 asks for a `widget`, choose one of these. Always re-read the
source `.tsx` before composing imports if a signature looks off — the
table can drift.

| Widget        | Source                          | Props                                                         |
|---------------|---------------------------------|---------------------------------------------------------------|
| `MotorGrid`   | `src/widgets/MotorGrid.tsx`     | `prefix: string`, `motors: string[]`, `columns?: number`      |
| `MotorRow`    | `src/widgets/MotorRow.tsx`      | `label`, `pv`, `displays?`, `macros?` (rendered in a table)   |
| `StripChart`  | `src/widgets/StripChart.tsx`    | `id`, `initialPvs: { pv, label, enabled }[]`                  |
| `ReadbackRow` | `src/widgets/ReadbackRow.tsx`   | `label`, `pv` (renders one `<tr>`; wrap in a `<table>`)       |
| Custom        | `src/deployments/<id>/<area>/…` | placeholder `() => <div>TODO</div>` the user fleshes out      |

If a custom panel uses `ChanRbvBox` or `ChanSpBox`, it **must** include
`onContextMenu={e => pvCtx("PV:NAME", raw, e)}` (import `pvCtx` from
`../../lib/epics`). This is a hard rule per `CLAUDE.md`. No exceptions.

## Behavioral guardrails

- **Never overwrite.** If `src/deployments/<id>/` exists, refuse and ask
  for a different id.
- **Batch questions.** Use `AskUserQuestion` with multiple questions per
  call where the answers are independent (e.g. all four core fields in
  one batch). The exception is the per-panel loop — each panel is its
  own batch because the next panel's questions depend on the previous
  panel's widget choice.
- **No emojis** in any generated content. Repo rule (`CLAUDE.md`).
- **No dev server.** Do not run `npm run dev` after writing. Print the
  verification commands and let the user run them.
- **Panel id slugs are stable.** They're localStorage keys. If the
  user wants to rename a panel later, that's a separate task with
  migration.

## Verification

After writing, confirm with:

- `ls src/deployments/<id>/config.json src/deployments/<id>/index.tsx`
  — both exist.
- `npx tsc --noEmit` exits 0.
- `npm run dev`, then open `http://localhost:4200/?deployment=<id>` —
  the picker lists `<id>`, the title and tabs match, and at least one
  panel renders without console errors.

See [verifying-before-completion](../verifying-before-completion/SKILL.md)
for the broader evidence rule and the full claim-to-command table.

## See also

- `docs/deployments.md` — the "Adding a new deployment" guide.
  Complements this skill (manual instructions vs. interactive
  scaffold). Update it when the scaffold's contract changes.
- `src/lib/deployment.ts` — the `DeploymentConfig` type and the glob
  loader that discovers `src/deployments/*/index.tsx` automatically.
- `src/deployments/example/` — the canonical template the skill reads
  in step 2.
