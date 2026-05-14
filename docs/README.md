# ca-web docs

## Architecture

- [architecture.md](architecture.md) — system overview, stack, conventions.
- [adr/](adr/) — architecture decision records.

## Guides

- [deployment.md](deployment.md) — ops guide for beamline hosts: pvws
  container setup, deployment modes, troubleshooting.
- [how-to-start-pvws.md](how-to-start-pvws.md) — start the pvws backend
  (build/load, env vars, host recipes, pitfalls).
- [roadmap.md](roadmap.md) — feature roadmap.
- [deployments.md](deployments.md) — how to add a new beamline deployment.

## Reference

- [widgets.md](widgets.md) — widget catalog, EPICS-binding rules, and the
  `pvCtx` right-click contract.
- [ui-rendering.md](ui-rendering.md) — high-level overview of the caQtDM
  `.ui` parsing and rendering pipeline.
- [design-system.md](design-system.md) — visual conventions.
- [display-path-resolution.md](display-path-resolution.md) — how the dev
  server resolves displays from the caQtDM startup script.
