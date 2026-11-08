# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ca-web — a browser-based control panel for beamline instruments

## Directives

- Ask one question if ambiguous. Don't guess.
- Any plan must enumerate open questions up front and get them answered before execution.
- Minimum code. No speculative features. No single-use abstractions.
- Match existing style. Don't improve adjacent code.
- No emojis anywhere.
- Plans end with critique. Tasks end with critique + doc sync.
- After 5+ file changes, run `/agent critic` before committing unless the user says otherwise.
- Audit/research agents: 70/30 scan/report split. Reserve final 30% for the report.
- Project facts go in `docs/` (git-versioned). Claude memory is for behavioral feedback only.
- No silent degradation: every external dep must surface state via events/logs.
- Trunk-based on `main` by default. Cut a branch only for risky / multi-day / PR-review work.
- WCAG 2.1 AA is the standard to write to: semantic HTML, alt text, labels, keyboard navigation. Held by convention and review — there is no automated a11y check in the lint or commit path.
- Pre-commit runs whitespace/EOF/YAML/JSON hygiene hooks plus the local quality-gate (`tsc --noEmit` on the project, ESLint on staged TS/TSX). There is no formatter hook. It is not active in a fresh clone: run `pre-commit install` once per checkout. The gate also exits 0, with a message telling you to run `npm install`, when `node_modules/` is absent. Override with `SKIP=quality-gate git commit ...` only when the user requests it.
- When editing source under `src/lib/`, `src/widgets/`, or `src/deployments/`, update `CHANGELOG.md`, `docs/architecture.md`, or the relevant page under `docs/` if the change is architecturally visible. The doc-sync hook will warn if you forget.
- Use procedural skills under `.claude/skills/` (e.g. `new-deployment`, `running-the-quality-gate`, `verifying-before-completion`) when extending the repo so conventions stay consistent.
- `/ui/<...>` URLs in app code: prefer **search-path basename** (`/ui/<file>.ui`) → **uiDirs prefix** (`/ui/<key>/<file>.ui`, only when search path doesn't cover, version pinning, or name collision) → **embedded absolute** (`/ui/x//<abs>`, last resort). See [docs/display-path-resolution.md](docs/display-path-resolution.md#how-to-encode-a-ui-file-url-in-app-code).

## Stack

React 18, TypeScript 5, Vite 7, npm. Key dependency: `@diamondlightsource/cs-web-lib` (npm registry) for EPICS / Channel Access. MUI for UI components. State lives in the Redux store re-exported by `cs-web-lib`; no local slices.

## Commands

```bash
npm run dev       # start dev server
npm run build     # tsc + vite build
npm run preview   # preview production build
```

If your Node toolchain is provided by conda (e.g. on beamline hosts), activate the env first: `conda activate nodejs`.

## Widgets

- Use `ChanRbvBox` and `ChanSpBox` (from `src/widgets/EpicsWidgets.tsx`) whenever displaying a PV value — they read precision automatically from the channel metadata.
- Use `RbvBox` / `SpBox` only for computed values that are not directly backed by a PV.
- Every `ChanRbvBox` and `ChanSpBox` must have `onContextMenu={e => pvCtx("PV:NAME", raw, e)}` (import `pvCtx` from `../../lib/epics`). No exceptions.
- In every panel, align all columns consistently: labels and values must be explicitly left-aligned, right-aligned, or centered — never left to default browser flow. Boxes and buttons in the same row share the same height. Column headers use the same `gap` as data rows so they stay in sync with their fields.

## Docs

- Architecture: [docs/architecture.md](docs/architecture.md)
- ADRs: [docs/adr/](docs/adr/)
- Skills: [.claude/skills/](.claude/skills/)
- Cross-tool entry: [AGENTS.md](AGENTS.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

## Status

v0.1.0-dev. A working prototype running against real PVs at 29-ID, not a
production replacement for caQtDM.

## Skill routing

The skills this repo ships are the six under `.claude/skills/`
(`new-deployment`, `adding-a-panel`, `adding-a-widget`,
`debugging-pvws-connectivity`, `running-the-quality-gate`,
`verifying-before-completion`). Each declares its own triggers; use one when
the request matches rather than improvising the same work ad hoc.
