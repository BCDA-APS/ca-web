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
- Never hardcode model names in code. Use a settings/env value.
- Project facts go in `bot_vault/` (git-versioned). Claude memory is for behavioral feedback only.
- No silent degradation: every external dep must surface state via events/logs.
- Trunk-based on `main` by default. Cut a branch only for risky / multi-day / PR-review work.
- WCAG 2.1 AA enforced. Semantic HTML, alt text, labels, keyboard navigation mandatory.
- `docs/` is human-authored. Bots MUST NOT modify it without explicit instruction.
- Pre-commit runs format checks and the local quality-gate (tsc + ESLint) automatically. Override with `SKIP=quality-gate git commit ...` only when the user requests it.
- When editing source under `src/lib/`, `src/widgets/`, or `src/deployments/`, update `bot_vault/CHANGELOG.md`, `bot_vault/architecture/overview.md`, or the relevant page under `docs/` if the change is architecturally visible. The doc-sync hook will warn if you forget.
- Use procedural skills under `bot_vault/skills/` (e.g. `running-the-quality-gate.md`, `verifying-before-completion.md`) when extending the repo so conventions stay consistent.

## Stack

React 18, TypeScript 5, Vite 7, npm. Key dependency: `@diamondlightsource/cs-web-lib` (npm registry) for EPICS / Channel Access. MUI for UI components, Redux Toolkit for state.

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

- Architecture: [bot_vault/architecture/overview.md](bot_vault/architecture/overview.md)
- Rules: [bot_vault/entry.md](bot_vault/entry.md)
- ADRs: [bot_vault/architecture/adr/](bot_vault/architecture/adr/)
- Skills: [bot_vault/skills/](bot_vault/skills/)
- Changelog: [bot_vault/CHANGELOG.md](bot_vault/CHANGELOG.md)

## Status

v0.1.0-dev (initial scaffold).

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
