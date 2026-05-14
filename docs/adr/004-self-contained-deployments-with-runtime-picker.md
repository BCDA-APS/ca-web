# ADR 004 -- Self-contained deployments with runtime picker

Date: 2026-05-13
Status: Accepted
Supersedes: ADR 003

## Context

ADR 003 selected the active deployment at build time via Vite mode and a
project-root `.env.<name>` file, with the registry hand-maintained in
`src/deployments/index.ts`. In practice this meant:

- Switching beamlines required a server restart.
- Deployment-specific configuration was spread across three places
  (deployment file, env file at repo root, registry import).
- `src/deployments/` mixed framework code (`types.ts`, `index.ts`) with
  the deployment folders themselves, blurring the contract.

The user wanted every subfolder of `src/deployments/` to be a complete,
drop-in deployment with the same shape — drop a folder, it appears in
the app — and selection at runtime so a single build can serve any
beamline.

## Decision

A deployment is `src/deployments/<id>/index.tsx`, exporting:

```ts
export const config: DeploymentConfig = {
  id: "<id>",                                // must match folder name
  title: "...",
  pvws: { socket: "...", ssl: false },
  tabs, panelDefaults, tabPanels, ...
};
```

No other files are required inside the folder. PVWS settings live in the
config object; there are no `.env` files.

`src/lib/deployment.ts` is the framework: it owns the type definitions,
loads every `src/deployments/*/index.tsx` via `import.meta.glob(..., { eager: true })`,
validates that `config.id` matches its folder, builds a `REGISTRY` map
keyed by id, and exposes `resolveActiveId()` and `DeploymentContext`.

Selection at runtime: `resolveActiveId()` reads `?deployment=<id>` from
the URL (winning and persisted to `localStorage`), else falls back to
`localStorage`, else returns `null`. `main.tsx` renders
`<DeploymentPicker />` when `null`, otherwise wraps `<App />` in
`<DeploymentContext.Provider value={cfg}>` and builds the Redux store
from `cfg.pvws`. `App.tsx` reads the config via `useContext`.

An `example/` deployment is committed as a copy-paste template.

## Consequences

- One build serves every deployment; switching is a URL change or
  picker click — no server restart, no rebuild.
- `src/deployments/` contains only deployment folders. Adding a deployment
  is: copy `example/`, rename, edit. No registry edit, no env file.
- All deployments live in every bundle. Acceptable today; if a future
  deployment is heavy, switch the glob to `{ eager: false }` and
  dynamically import after `resolveActiveId()`.
- Picker UI is reload-driven: a click sets the URL param and reloads, so
  `main.tsx`'s one-shot store creation stays simple. In-place switching
  is possible but rejected as needless complexity for now.
- A `localStorage` key (`ca-web.deployment`) persists the choice. Clearing
  it (or visiting `?deployment=` with an invalid id) re-shows the picker.
- Folder-name / `config.id` mismatch is a startup error — the glob loader
  throws. Keeps the URL contract honest.

## Notes

- `../deployments.md` predates this change and still references
  `VITE_DEPLOYMENT` / `--mode`. Flagged for a refresh.
