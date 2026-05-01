# ADR 000 -- Record architecture decisions

Date: 2026-05-01
Status: Accepted

## Context

We need a lightweight way to capture architectural decisions so future contributors (human or AI) understand why the system looks the way it does.

## Decision

Use Architecture Decision Records (ADRs) in `bot_vault/architecture/adr/`. One file per decision, numbered sequentially. Format: Context / Decision / Consequences.

## Consequences

- Minor overhead per decision.
- Future agents have grounded context for design choices.
- Decisions become reviewable and reversible.
