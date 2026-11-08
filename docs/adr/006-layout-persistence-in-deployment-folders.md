# ADR 006 -- Layout persistence in deployment folders

Date: 2026-11-04 (decision shipped 2026-05-14; recorded here after the fact)
Status: Accepted
Supersedes: ADR 001

## Context

ADR 001 put panel and overlay state in browser `localStorage`, on the
reasoning that there is no application backend to write to.

This ADR is written after the fact. The commit that made the change
(`8b981af`, 14 May 2026) says only "persist layouts to deployment folder;
retire bot_vault for docs/", so the motivation below is **inferred from the
code and the deployment setup, not recorded at the time** — treat it as
reconstruction rather than as the original reasoning:

- `localStorage` is per-browser-profile, so a layout does not follow a user
  between machines or browsers. ADR 001 names this as a known cost and says
  to revisit it if operators need shared layouts.
- There was no way to save a curated arrangement and hand it to someone else,
  or to keep one as a known-good starting point.
- ADR 004 made each `src/deployments/<id>/` folder self-contained. UI state
  was the one piece of deployment data still living outside it.

What is not in doubt is that the "no backend" premise was weaker than it
looked: the app always runs from inside the repo, under `npm run dev` or
`vite preview`, and the Vite server already serves site `.ui` files through a
custom plugin. A second plugin can serve layout JSON the same way.

## Decision

Persist layout state as JSON files under `src/deployments/<id>/layouts/`,
served by a `layouts-api` Vite plugin registered in both `configureServer`
and `configurePreviewServer`.

- `current.json` — live state, auto-saved on a 250 ms debounce after any
  change.
- `<name>.json` — named drafts saved from the gear menu.

Both share one flat shape: a record keyed by suffix (`panel:<id>`,
`overlay:<file>`, `panel-hidden`, `stripchart:<id>`, and the `__overlays__`
array used to restore overlay panels).

Routes are `GET /api/layouts/<id>` to list and `GET`/`PUT`/`DELETE`
`/api/layouts/<id>/<name>` for one file. The handler is deliberately
narrow: writes are scoped to the deployment's own `layouts/` directory,
atomic via tmp-and-rename, capped at 1 MB, and rejected unless the name
matches `[a-z0-9-]{1,64}`. `current` cannot be deleted. Only deployment IDs
that exist as folders resolve, so the URL space is closed and path traversal
cannot escape the deployments root.

`src/lib/layoutStorage.ts` owns the client half. `main.tsx` calls
`hydrateLayouts(id)` after `loadDeployment()` and before the first render;
`layoutGet` / `layoutSet` / `layoutDelete` are synchronous accessors over the
in-memory cache that fetch populated.

Two deliberate behaviors at the edges:

- **Migration.** When no `current.json` exists, `drainLegacyLocalStorage()`
  picks up any `ca-web.<id>.*` keys left by a pre-folder build, writes them
  through once, and clears them.
- **No silent fallback.** If the API is unreachable at boot, the failure is
  logged loudly and writes are disabled. The session still works against
  in-memory state, but nothing persists and nothing pretends to. Falling back
  to `localStorage` here would reintroduce exactly the per-profile divergence
  this ADR removes.

## Consequences

- Layouts follow the deployment rather than the browser. Any staff member on
  any workstation opens the same arrangement.
- Layout persistence works under both `npm run dev` and `vite preview`,
  because `layouts-api` is registered for both. Note this is not true of
  the `ui-search-path` plugin, which is dev-only, so `vite preview` loses
  `.ui` rendering and the file picker even though layouts keep working.
- The app now requires a writable checkout to persist anything. Serving
  `dist/` from a plain web server would lose layouts, and the signal is
  weaker than it should be: the boot failure and every later write failure
  are `console.error` only. There is no on-screen banner, unlike the pvws
  gateway check, which does render one. A user would see their arrangement
  silently fail to stick. Worth fixing if a static deploy ever happens.
- `ca-web.deployment` is the only remaining `localStorage` key, and it holds
  the picker choice, not UI state.
- Named drafts are files, so they can be diffed, copied between deployments,
  and deleted from the filesystem as well as from the gear menu.

## Notes

- `DeploymentConfig.layouts` (shared layouts shipped inside `config.json`)
  still loads, for backward compatibility with layouts curated before this
  change.
- Publishing a *shared* layout is a manual step. `src/deployments/*/layouts/`
  is gitignored, so a draft cannot be shared by committing it; the contents
  have to be pasted into the `layouts` array of the deployment's
  `config.json` by hand. The gear menu has no export action, and the
  "Copy as JSON" workflow referred to in the comment at
  `src/lib/deployment.ts:154` was never built.
