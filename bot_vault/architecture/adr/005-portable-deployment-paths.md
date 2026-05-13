# ADR 005 -- Portable deployment paths

Date: 2026-05-13
Status: Accepted (the `paths.json` file format was later merged into the
per-deployment `config.json` under a nested `paths` key — see the
"Deployment config consolidation" entry in `bot_vault/CHANGELOG.md`. The
plugin behavior, search-path logic, `virtual:deployment-path-status`
contract, and "Switch deployment…" button described below are unchanged.)

## Context

After ADR 004 made deployments self-contained, three site-specific artifacts
still tied the repo to the 29ID beamline NFS network:

- Three committed symlinks in `public/ui/` (`29id`, `ADCore`, `motors`)
  pointing to absolute paths under `/net/...` and `/APSshare/...`. On a host
  without those mounts, Vite's `prepare-out-dir` stat'd the dangling symlinks
  and failed `npm run build` with ENOENT.
- `STARTUP_SCRIPT = "/net/s29dserv/xorApps/ui/start_epics_29id"` hardcoded in
  `vite.config.ts`, parsed by the `ui-search-path` plugin to build the
  caQtDM display search path.
- `ADL2UI = "/APSshare/bin/adl2ui"` hardcoded in `vite.config.ts` for
  on-the-fly `.adl` → `.ui` conversion.

The goal is one-shot portability: `git clone && npm install && npm run build`
must succeed on any laptop, with `nefarian` and `example` fully runnable, and
`29id` cleanly degrading when its NFS targets aren't reachable.

## Decision

Build-time site paths move into an optional **`paths.json`** alongside each
deployment's `index.tsx`:

```json
{
  "uiDirs":        { "<prefix>": "<absolute target>" },
  "startupScript": "<absolute path>",
  "adl2ui":        "<absolute path>"
}
```

`vite.config.ts` gains a `loadDeploymentPaths()` helper that scans
`src/deployments/*/paths.json` at config-load time and produces:

- A merged `uiDirs` map. Two deployments declaring the same key with
  different targets throws (loud failure with both deployment ids and
  paths). Identical targets are deduped.
- A list of `startupScripts` that exist on disk; unioned across deployments
  for `buildSearchPaths()`.
- A first-existing `adl2ui`.
- A per-deployment `missing` list for the picker.

The `ui-search-path` plugin gains a prefix-mapping first pass: if the URL
is `/ui/<key>/<rest>` and `<key>` is in `uiDirs`, serve directly from
`<target>/<rest>` (with `.adl` fallback via `convertAdl`). This replaces
what the deleted `public/ui/<key>` symlinks did, without ever touching the
filesystem.

A second tiny plugin exposes the missing-paths map to the browser as a
virtual module `virtual:deployment-path-status`. The `DeploymentPicker`
imports it and renders a grey "N external paths unreachable on this host"
line under affected deployment entries.

The header also gains a "Switch deployment…" button that calls
`clearActive()` and reloads, returning the user to the picker (closing a
follow-up flagged in ADR 004).

## Consequences

- A fresh clone runs on any computer: `npm install && npm run build`
  succeeds; `npm run dev` shows the picker; `nefarian` and `example` work
  end-to-end against a local pvws.
- `29id` remains a first-class deployment on the beamline host (all
  declared paths reachable; behavior identical to before). Off-network,
  it loads but its `/ui/*` requests 404 cleanly.
- "Add a beamline that needs NFS targets" becomes "copy `example/`, edit
  `index.tsx`, drop a `paths.json`." No vite-config edits.
- `paths.json` is intentionally JSON (no schema-typed `paths.ts`) to keep
  `vite.config.ts` dependency-free. A small `validatePaths()` rejects
  unknown top-level keys.
- The virtual module couples picker UX to Vite. A non-Vite test runner
  won't resolve it; acceptable today (no test runner). If that changes,
  fall back to a generated `src/.deployment-path-status.ts` file.
- "Paths missing" is computed at Vite config-load; it doesn't refresh
  mid-session if NFS comes back online. Reload handles that.

## Notes

- `docs/deployments.md` (human-authored) was last touched before ADR 004
  and is now doubly out of date. Flagged for a human refresh.
