# ADR 001 -- Panel state persistence via localStorage

Date: 2026-05-13
Status: Accepted

## Context

The app exposes draggable panels (`DraggablePanel`), overlay windows
(`AppOverlayPanel`), and named layout snapshots. These need to survive
page refreshes so operators don't re-arrange the UI every time they
open the dev server. There is no application backend — the only server
is `pvws`, which transports PV values and has no notion of UI state.

## Decision

Persist panel and overlay state in browser `localStorage`:

- `panel:<id>` — `{ x, y, locked }` per `DraggablePanel`.
- `overlay:<file>` — `{ x, y, locked }` per `AppOverlayPanel`.
- `panel:layouts` — array of named `SavedLayout` records (positions,
  hidden panels, open overlays), managed by the Settings panel.

State is read once on mount (`useState` initializer) and written on
every change.

## Consequences

- No server work, no schema migrations, zero deploy coupling.
- Layouts are per-browser-profile — they do not follow a user across
  machines or browsers. Acceptable today; revisit if operators need
  shared layouts.
- localStorage is synchronous and small. Large state (e.g. many
  overlays with deep macro maps) is fine for now; if growth becomes an
  issue, move to `IndexedDB` or `pvws`-adjacent persistence.
- Clearing browser storage resets the UI to deployment defaults from
  `DeploymentConfig.panelDefaults` — a deliberate fallback, not a bug.
