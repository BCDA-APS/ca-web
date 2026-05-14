# ADR 002 -- caQtDM `.ui` runtime rendering

Date: 2026-05-13
Status: Accepted

## Context

29ID (and other APS beamlines) maintain their operator screens as
caQtDM `.ui` files — Qt Designer XML with `ca*` widget classes that
bind to EPICS PVs. There are hundreds of such files per beamline, kept
under version control in the beamline's display tree and referenced
by includes and "related display" buttons.

We need to render those screens in the browser. Two broad options:

1. Port each `.ui` to native React (one component per screen).
2. Parse `.ui` XML and dispatch to a generic widget runtime at load time.

## Decision

Adopt option 2. Parse `.ui` files with `lib/uiParser.ts` and dispatch
to React widget renderers from `lib/UiRenderer.tsx` at runtime. Macro
substitution and nested-`.ui` (`caInclude`, `caRelatedDisplay`) path
resolution happen inside the renderer against a per-tree `baseDir`.

For UI surfaces that benefit from richer interaction or layout than
caQtDM provides (e.g. BeamlineLayout, ChamberDiagram, custom motor
cards), we hand-write native React panels alongside the runtime
renderer.

## Consequences

- One change to a `.ui` file ships to the browser without a redeploy of
  React code (during dev). Beamline engineers can keep authoring in
  caQtDM as before.
- Widget coverage is the gating factor: every `ca*` widget we want to
  render must have a dispatcher entry. New widgets land in
  `UiRenderer.tsx` as needed (see `README.md` "Implemented Widgets").
- `UiRenderer.tsx` is large (~2.5k lines) and growing. Splitting it
  into dispatch / layout / macros / path resolution modules is queued
  future work.
- Native React panels and the `.ui` runtime coexist; the deployment
  config decides which to use per panel.
- Visual fidelity follows caQtDM's intent, not Qt's exact metrics; some
  pixel-perfect alignment work has been needed (M3R alignment, beam
  paths, slit blades).
