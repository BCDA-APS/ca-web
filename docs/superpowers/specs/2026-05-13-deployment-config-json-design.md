# Consolidate deployment config into a single `config.json`

Date: 2026-05-13
Status: Proposed

## Motivation

Each deployment currently spans two files:

- `src/deployments/<id>/index.tsx` — React components plus a `config` export typed as `DeploymentConfig` (id, title, pvws, tabs, panelDefaults, defaultHiddenPanels, quickLinks, tabPanels).
- `src/deployments/<id>/paths.json` — Build-time external paths (uiDirs, startupScript, adl2ui) read by `vite.config.ts`.

The split forces two reads, two parsers, and two places where `id` could drift. Most of the `DeploymentConfig` fields are pure data and could live next to `paths.json` data in a single per-deployment manifest. Only `tabPanels` references React components by value, so it must stay in TSX.

## Goal

Collapse the two files into one `config.json` per deployment that carries everything serializable. `index.tsx` keeps only what JSON cannot express: React component definitions and the `tabPanels` mapping. No runtime user-visible behavior changes.

## File layout

```
src/deployments/<id>/
  config.json     # all serializable config (replaces paths.json and most of the index.tsx config block)
  index.tsx       # React components + tabPanels mapping + exported DeploymentConfig
  ...subfolders...
```

`paths.json` is deleted from any deployment that has one (today: `29id` only).

## `config.json` schema

```json
{
  "id": "29id",
  "title": "29ID Beamline",
  "pvws": { "socket": "mite:8080", "ssl": false },
  "quickLinks": [
    { "label": "29ID", "file": "/ui/29id/29id.ui", "macros": {} }
  ],
  "tabs": [
    { "id": 3, "icon": "✴️", "label": "29ID-A", "color": "rgb(174,203,255)" },
    { "id": 1, "icon": "⚛",  "label": "29ID-C", "color": "rgb(170,170,255)" },
    { "id": 2, "icon": "💠", "label": "29ID-D" }
  ],
  "panelDefaults": {
    "29idc-chamber-v2": { "x": 100, "y": 55 }
  },
  "defaultHiddenPanels": ["29id-mirrors"],
  "paths": {
    "uiDirs": {
      "29id": "/net/s29dserv/xorApps/ui/29id"
    },
    "startupScript": "/net/s29dserv/xorApps/ui/start_epics_29id",
    "adl2ui": "/APSshare/bin/adl2ui"
  }
}
```

Field rules:

- `id`, `title`, `pvws`, `tabs`, `panelDefaults` — required (same as today).
- `quickLinks`, `defaultHiddenPanels` — optional (same as today).
- `paths` — optional. When present, all three of its sub-fields (`uiDirs`, `startupScript`, `adl2ui`) remain optional with the same semantics as today's `paths.json`.
- `tabPanels` — NOT in `config.json`. It is built in `index.tsx` because each entry carries a `Content: ComponentType` reference.

## `index.tsx` after the refactor

```tsx
import rawConfig from "./config.json";
import type { DeploymentConfig } from "../../lib/deployment";
// component imports...

// local component definitions (ArpesMotorsContent, SyncButtons, ...)

const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "29idc-chamber-v2", title: "Chamber", Content: ChamberDiagramV2 },
    // ...
  ],
  2: [{ id: "29idd-kappa", title: "29ID-D Kappa", Content: KappaContent }],
  3: [/* ... */],
};

export const config: DeploymentConfig = { ...rawConfig, tabPanels };
```

The literal `id`/`title`/`pvws`/`tabs`/`panelDefaults`/`defaultHiddenPanels`/`quickLinks` blocks disappear from TSX. The merge `{ ...rawConfig, tabPanels }` is the only structural code left.

TypeScript note: `import rawConfig from "./config.json"` produces a typed object thanks to `resolveJsonModule` (already enabled by Vite's default tsconfig in this repo). The spread merges cleanly into `DeploymentConfig` because `tabPanels` is the only key not in `rawConfig`.

## `src/lib/deployment.ts` changes

None. The module already loads `index.tsx` via `import.meta.glob` and validates `cfg.id` against the folder name. That validation continues to work — `id` now flows through `rawConfig` into the exported `config`, so the existing mismatch check still fires.

## `vite.config.ts` changes

The current `loadDeploymentPaths()` reads `paths.json` directly. Two targeted edits:

1. Read `config.json` instead of `paths.json`:
   ```ts
   const file = path.join(DEPLOYMENTS_DIR, id, "config.json");
   ```
2. Extract `parsed.paths` (an object or absent) and validate its keys against `VALID_KEYS` (`uiDirs`, `startupScript`, `adl2ui`). Top-level keys of `config.json` (`id`, `title`, etc.) are ignored — they are the runtime's concern, not vite's.

```ts
const pathsBlock = (parsed.paths && typeof parsed.paths === "object")
  ? (parsed.paths as Record<string, unknown>)
  : {};

for (const k of Object.keys(pathsBlock)) {
  if (!VALID_KEYS.has(k)) {
    throw new Error(
      `[deployments] ${file}: unknown key "paths.${k}". Allowed: ${[...VALID_KEYS].join(", ")}`
    );
  }
}

const ud = pathsBlock.uiDirs;
// ...rest of the existing logic, reading from pathsBlock instead of parsed...
```

Deployments without a `paths` block (today: `example`, `nefarian`) produce an empty `missing` array, exactly as they do today when `paths.json` is absent.

## Migration

Three deployments exist:

- `29id` — has `paths.json`. Add `config.json` with the extracted fields plus the nested `paths` block; delete `paths.json`; rewrite `index.tsx` to merge.
- `example`, `nefarian` — no `paths.json`. Add `config.json` (no `paths` block); rewrite `index.tsx` to merge.

Verification:

1. `npm run build` — tsc accepts the JSON import and the merge typechecks against `DeploymentConfig`.
2. `npm run dev` — DeploymentPicker lists all three deployments; the 29ID picker entry still shows any missing-paths hint; each deployment renders its panels.
3. Spot-check `/api/ui-files` for the 29ID deployment to confirm `uiDirs` resolution still works.

## Open questions

None. Resolved during brainstorming:

- `paths` is nested inside `config.json` (not flat at the top).
- File name is `config.json`.
- `quickLinks` and `defaultHiddenPanels` remain optional.

## Out of scope

- Moving `tabPanels` into JSON via a string→component registry. Considered, rejected — pure churn for no win until we have a reason to serialize tab structure (e.g. multiple variants per deployment).
- Schema validation at runtime (zod/ajv). Not added; the existing `cfg.id` check plus TypeScript's structural typing of the JSON import is sufficient for three internal deployments.
- Changes to `docs/deployment.md` or `docs/deployments.md` content. They will be updated as part of doc-sync after the change lands, but the spec is the design, not the doc.
