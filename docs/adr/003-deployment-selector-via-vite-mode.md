# ADR 003 -- Deployment selector via Vite mode

Date: 2026-05-13
Status: Superseded by ADR 004

## Context

A single ca-web codebase needs to run as different "deployments":
different beamlines, simulated IOCs, and ad-hoc test rigs. Each
deployment has its own pvws endpoint, tab layout, panel defaults,
hidden-by-default panels, and quick-link `.ui` files.

Options considered:

1. URL/query-string switch at runtime.
2. Build-time environment selector.
3. Multi-package monorepo, one bundle per deployment.

## Decision

Use Vite mode + `import.meta.env.VITE_DEPLOYMENT` as a build-time
selector. Each deployment has:

- A `DeploymentConfig` exported from `src/deployments/<name>.tsx` (or
  `<name>/index.tsx` for larger deployments).
- A `.env.<name>` file at the repo root with `VITE_DEPLOYMENT=<name>`
  and `VITE_PVWS_SOCKET=...`.
- A registration in `src/deployments/index.ts`.

Run with `npm run dev -- --mode <name>` (or `npm run build --
--mode <name>`); Vite picks up `.env.<name>` automatically.

Current deployments: `nefarian` (default, simulated IOC) and `29id`
(beamline). Concrete pvws addresses live in the matching `.env.<mode>`
files, not in this ADR — they change with beamline ops.

## Consequences

- One artifact per deployment — no runtime branching, no surprise
  config drift between environments.
- Adding a deployment is mechanical: write a `DeploymentConfig`, add
  the env file, register it. See `docs/deployments.md`.
- Switching deployment requires a server restart (Vite mode is fixed
  at startup).
- Env files live at repo root (Vite convention). Moving them to a
  subdir would require setting `envDir` in `vite.config.ts` and is not
  worth the friction.
