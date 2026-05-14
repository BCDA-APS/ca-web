<!-- /autoplan restore point: /home/beams/RODOLAKIS/.gstack/projects/caqtdm-web/main-autoplan-restore-20260410-115058.md -->
# Plan: Per-Deployment App Configuration (Roadmap #12)

## Problem

`App.tsx` hardcodes everything for both deployments — the 29ID beamline (mite) and
the simulated IOC (nefarian). As deployments grow, the file becomes a grab-bag of
deployment-specific logic. `UiRenderer.tsx` and `uiParser.ts` are already fully
generic; `App.tsx` is not.

## Goal

Split deployment-specific content out of `App.tsx` into per-deployment files.
`App.tsx` becomes a thin generic shell. Vite's mode system selects the active
deployment at build/dev time via `VITE_DEPLOYMENT`.

## What Is Deployment-Specific Today

From `App.tsx`:
- `TABS` array (tab IDs, icons, labels)
- Tab content (what renders on each tab — panels, PV tables, UiRenderer files)
- Header title (`"29ID Beamline"`)
- `PANEL_DEFAULTS` (initial positions for draggable panels)
- Hardcoded PV lists: `MOTORS`, `LORENTZIAN`, `AREA_DETECTOR`, `MOTOR_DISPLAYS`

## What Stays Generic

- `DraggablePanel` component
- `AppOverlayPanel` component
- `FilePickerDialog` component
- `SettingsPanel` component
- `AppErrorBoundary` component
- Overlay open/close/tab-scoping logic
- `useUiFiles()` hook

## Implementation Plan

### Step 1: Define the deployment interface

Create `src/deployments/types.ts`:

```ts
export interface Tab {
  id: number;
  icon: string;
  label: string;
}

export interface DeploymentConfig {
  title: string;       // header bar title
  tabs: Tab[];
  panelDefaults: Record<string, { x: number; y: number }>;
  TabContent: React.FC<{ tabId: number; layoutKey: number }>;
}
```

### Step 2: Create deployment files

**`src/deployments/nefarian.tsx`** — simulated IOC (motors fr:m1–8, myad camera, lorentzian)
**`src/deployments/29id.tsx`** — 29ID beamline (29idc-arpes, 29idd-kappa)

Each file exports a `DeploymentConfig` object.

### Step 3: Deployment selector

Create `src/deployments/index.ts` using **static imports + ternary** (NOT template
literal dynamic imports, which Vite cannot statically analyze):

```ts
import { config as nefarianConfig } from "./nefarian";
import { config as config29id } from "./29id";

export const config = import.meta.env.VITE_DEPLOYMENT === "29id"
  ? config29id
  : nefarianConfig;
```

Vite resolves `import.meta.env.VITE_*` at build time and can tree-shake the
unused branch.

### Step 4: Refactor App.tsx

- Remove all deployment-specific constants and tab content
- Import `config` from `src/deployments/index.ts`
- Pass `config.tabs` to `Sidebar` as a `tabs` prop (Sidebar currently reads
  module-level TABS — this prop must be threaded through)
- Pass `config.panelDefaults` to `SettingsPanel` as a `panelDefaults` prop
  (SettingsPanel currently reads module-level PANEL_DEFAULTS/PANEL_IDS —
  this prop must be threaded through)
- Pass `config.title` to the header span
- Render `<config.TabContent tabId={activeTab} layoutKey={layoutKey} />`

### Step 5: Add env files

```
.env.nefarian    VITE_PVWS_SOCKET=localhost:8080  VITE_DEPLOYMENT=nefarian
.env.29id        VITE_PVWS_SOCKET=mite:8080       VITE_DEPLOYMENT=29id
```

Both committed. Existing `.env` stays gitignored.

### Step 6: Update docs

Update README.md to document the `--mode` flag usage.
Mark ROADMAP #12 as done.

## Key Technical Concern (from CEO Review)

**`src/deployments/index.ts` must use static imports, not dynamic template literals.**

Template literal dynamic imports (`import(\`./deployments/${deployment}\`))` are NOT
statically analyzable by Vite and break tree-shaking. The correct pattern:

```ts
import { config as nefarianConfig } from "./nefarian";
import { config as config29id } from "./29id";

export const config = import.meta.env.VITE_DEPLOYMENT === "29id"
  ? config29id
  : nefarianConfig;
```

Vite resolves `import.meta.env.VITE_*` at build time and can dead-code-eliminate
the unused branch.

**`SettingsPanel` needs `panelDefaults` threaded through.**

Currently `SettingsPanel` uses module-level `PANEL_IDS` (derived from `PANEL_DEFAULTS`).
After refactoring, `panelDefaults` comes from the deployment config and must be passed
to `SettingsPanel` as a prop.

## Files Changed

| File | Action |
|------|--------|
| `src/deployments/types.ts` | Create |
| `src/deployments/nefarian.tsx` | Create |
| `src/deployments/29id.tsx` | Create |
| `src/deployments/index.ts` | Create |
| `src/App.tsx` | Refactor (remove deployment-specific code) |
| `.env.nefarian` | Create |
| `.env.29id` | Create |
| `README.md` | Update |
| `ROADMAP.md` | Mark #12 done |

## Constraints

- `UiRenderer.tsx` and `uiParser.ts` — do not touch
- The dynamic import approach for deployment selection must be Vite-compatible
  (i.e., `import.meta.env.VITE_DEPLOYMENT` is a static string at build time)
- No runtime switching between deployments (not needed)
- The existing `.env` file stays gitignored; `.env.nefarian` and `.env.29id`
  are committed (no secrets)
