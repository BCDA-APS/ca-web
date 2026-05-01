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

## Stack

React 18, TypeScript 5, Vite 7, npm (via conda env `nodejs`). Key dependency: `@diamondlightsource/cs-web-lib` (local tgz) for EPICS / Channel Access. MUI for UI components, Redux Toolkit for state.

## Commands

```bash
conda activate nodejs && npm run dev       # start dev server
conda activate nodejs && npm run build     # tsc + vite build
conda activate nodejs && npm run preview   # preview production build
```

Note: npm is not available system-wide. Always activate the `nodejs` conda env first.

## Docs

- Architecture: [bot_vault/architecture/overview.md](bot_vault/architecture/overview.md)
- Rules: [bot_vault/entry.md](bot_vault/entry.md)
- ADRs: [bot_vault/architecture/adr/](bot_vault/architecture/adr/)
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
