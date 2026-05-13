# Agent Workflow

Mandatory reading order before any non-trivial change.

## Before you start

1. Read [overview.md](overview.md) -- stack, layout, subsystems.
2. Read the relevant module/service doc under `architecture/`.
3. Skim recent entries in [adr/](adr/) -- decisions you must respect.

## When to update docs

- After adding/removing a module or major component: update
  `architecture/overview.md`.
- After a non-trivial design decision: write a new ADR in `adr/`.
- After a phase or milestone: update `CHANGELOG.md`.

## When to write a plan

- Multi-step task crossing multiple files or services.
- Anything risky, multi-day, or needing review.
- Plans live in `.claude/plans/` (per the harness convention) and end
  with an "Open questions" list answered before execution.

## When NOT to use bot_vault

- User-facing README, getting-started, contributor docs -> `docs/` or repo root.
- Source code comments -- write the code clearly instead.
