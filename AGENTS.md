# AGENTS.md

Cross-tool entry point for AI assistants working in ca-web. Read by
OpenCode, Cursor, Aider, and Codex. Claude Code also reads this file but
its richer instructions live in `CLAUDE.md` alongside.

ca-web is a browser-based control panel for beamline instruments.

## Stack

React 18, TypeScript 5, Vite 7, npm. Key dependency:
`@diamondlightsource/cs-web-lib` for EPICS / Channel Access. MUI for UI,
Redux Toolkit for state.

## Commands

```bash
npm run dev       # start dev server (http://localhost:4200)
npm run build     # tsc + vite build
npm run preview   # preview production build
```

## Skills

Reusable procedural skills live under `.claude/skills/<name>/SKILL.md`.
Each one declares its own "When to use" trigger in the body. Claude Code
auto-discovers them via the Skill tool. Other tools: read the file
directly when its triggers match.

- **`new-deployment`** — scaffold a new beamline deployment under
  `src/deployments/<id>/`. Triggers: "new deployment", "create a
  deployment", "scaffold a deployment", "add a beamline". Walks the
  user through id/title/pvws/tabs/panels/PVs and writes `config.json`
  and `index.tsx`.
- **`adding-a-panel`** — add a draggable panel to an *existing*
  deployment. Triggers: "add a panel to <deployment>", "new tab
  content", "extend <deployment>". Encodes the stable-id-slug rule
  (panel ids are localStorage keys) and the config.json / index.tsx
  sync.
- **`adding-a-widget`** — add a reusable PV widget under
  `src/widgets/`. Triggers: "add a widget", "create a PV widget",
  "wrap a new EPICS field". Encodes the connector/render split, the
  pvCtx context-menu rule, and the alignment conventions.
- **`debugging-pvws-connectivity`** — diagnose blank dashboards / red
  wsDown banners. Triggers: "PVs aren't connecting", "red banner",
  "No connections for ca://", "pvws is broken". Walks the boot probe
  / stub flow and a four-step diagnostic recipe.
- **`running-the-quality-gate`** — run `pre-commit` and interpret its
  output. Triggers: before any commit; "run the quality gate"; commit
  blocked by the gate.
- **`verifying-before-completion`** — evidence-before-claims rule with
  a claim-to-command table. Triggers: before saying anything is "done",
  "fixed", "passing", or "shipped".

## Project rules

- **No emojis** in any code, doc, or commit message.
- **WCAG 2.1 AA**: semantic HTML, alt text on images, labels on form
  fields, full keyboard navigation. Non-negotiable.
- **PV widgets need context menus.** Every `ChanRbvBox` / `ChanSpBox`
  must include `onContextMenu={e => pvCtx("PV:NAME", raw, e)}` (import
  `pvCtx` from `../../lib/epics`). No exceptions.
- **Use `ChanRbvBox` / `ChanSpBox`** (from `src/widgets/EpicsWidgets.tsx`)
  for any PV-backed value — they read precision from channel metadata.
  Use `RbvBox` / `SpBox` only for computed values.
- **Alignment**: in every panel, labels and values must be explicitly
  left/right/center-aligned. Box and button heights match within a row.
  Column headers share the same `gap` as data rows.
- **`docs/`** is the single doc tree (architecture, ADRs, guides,
  reference). Bots may edit it as part of source changes — the
  doc-sync hook will nudge you when you forget.
- **Trunk-based on `main`.** Branch only for risky / multi-day / PR-review
  work.
- **Pre-commit gate** runs `tsc --noEmit` plus ESLint on staged TS/TSX
  files. Override with `SKIP=quality-gate git commit ...` only when the
  user requests it (parallel-agent contention, etc.).
- **No silent degradation.** Every external dependency must surface its
  state via events or logs.
- **Never hardcode model names.** Use a settings or env value.

## Pointers

- Project rules in depth: `CLAUDE.md` (Claude Code reads this too).
- Architecture: `docs/architecture.md`.
- ADRs: `docs/adr/`.
- Changelog: `CHANGELOG.md`.
- Claude Code hooks: `.claude/hooks/`.
- Claude Code subagents: `.claude/agents/`.
