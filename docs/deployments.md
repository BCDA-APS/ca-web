# Deployments

A "deployment" is a build-time configuration that selects which tabs,
panels, panel positions, hidden-by-default panels, and quick-link
`.ui` files the app shows. The pvws endpoint is configured separately
through `VITE_PVWS_SOCKET` in the matching `.env.<mode>` file; the
`DeploymentConfig` object itself has no pvws field. Each beamline (and
the simulated-IOC dev rig) is its own deployment.

## Picking a deployment

```bash
npm run dev -- --mode nefarian   # simulated IOC (default)
npm run dev -- --mode 29id       # 29ID beamline on mite
```

Vite reads `.env.<mode>` from the repo root. Each deployment env file
sets:

- `VITE_DEPLOYMENT=<name>` — used by `src/deployments/index.ts` to pick
  the `DeploymentConfig`.
- `VITE_PVWS_SOCKET=<host:port>` — pvws WebSocket address.
- `VITE_PVWS_SSL=true|false` — optional, defaults to `false`.

Running `npm run dev` without `--mode` falls back to the gitignored
`.env` (typically `localhost:8080` and `VITE_DEPLOYMENT=nefarian`).

Architectural rationale: see
[adr/003-deployment-selector-via-vite-mode.md](adr/003-deployment-selector-via-vite-mode.md).

## Anatomy of a deployment

A `DeploymentConfig` (`src/deployments/types.ts`):

```ts
interface Tab {
  id: number;
  icon: string;
  label: string;
  color?: string;                 // optional top-bar accent when active
}

interface DeploymentConfig {
  title: string;                  // window title
  tabs: Tab[];                    // sidebar tabs
  panelDefaults: Record<string, { x: number; y: number }>;
  defaultHiddenPanels?: string[]; // panel ids hidden on first load
  quickLinks?: QuickLink[];       // header "open .ui" shortcuts
  tabPanels: Record<number, PanelConfig[]>; // tab id → panels
}
```

Each `PanelConfig` provides `id`, `title`, and a `Content` React
component. Panel ids are the keys used in `localStorage` (`panel:<id>`)
for position persistence — keep them stable across releases.

Existing examples:
- `src/deployments/nefarian.tsx` — single-file, minimal.
- `src/deployments/29id/index.tsx` — multi-tab, references panel
  components from sibling subfolders (`layout/`, `energy/`, `chamber/`,
  `optics/`, `scan/`).

## Adding a new deployment

1. **Pick a name** — short, lower-case, matches the env-file suffix.
   For multi-panel deployments, create a folder; for single-file
   deployments, a single `.tsx` is enough.

2. **Write the config**. For a single-file deployment, put it in
   `src/deployments/<name>.tsx` and import types from `./types`; for a
   multi-file deployment, put it in `src/deployments/<name>/index.tsx`
   and import types from `../types`. Example (multi-file form):

   ```tsx
   import type { DeploymentConfig } from "../types";
   import { MyPanel } from "./MyPanel";

   export const config: DeploymentConfig = {
     title: "My Beamline",
     tabs: [{ id: 1, icon: "M", label: "Main" }],
     panelDefaults: { mine: { x: 40, y: 40 } },
     tabPanels: {
       1: [{ id: "mine", title: "My Panel", Content: MyPanel }],
     },
   };
   ```

3. **Add `.env.<name>`** at the repo root:

   ```
   VITE_DEPLOYMENT=<name>
   VITE_PVWS_SOCKET=<host:port>
   ```

4. **Register in `src/deployments/index.ts`** by importing the new
   config and adding it to the selector ternary (or extending it to a
   map if more than two deployments are needed).

5. **Run `npm run dev -- --mode <name>`** and verify the tabs and
   panels load. Right-click a PV widget to confirm `pvCtx` wiring.

## Ops-side details

For host setup, pvws container configuration, NFS display path, and
troubleshooting on beamline machines, see
[deployment.md](deployment.md).
