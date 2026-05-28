# Deployments

A "deployment" is one beamline's configured app: which tabs appear in
the sidebar, which static panels live on each tab, where pvws is, what
`.ui` files staff can quick-open, and which spawn-on-demand templates
the picker offers. Each deployment lives in its own folder under
`src/deployments/<id>/`.

Existing deployments (`src/deployments/`):

- `example/` — minimal template; copy this when adding a new one.
- `nefarian/` — simulated IOC for local development.
- `29id/` — 29ID production: 3 tabs, ARPES chamber, beamline layout,
  scan records, cameras.
- `29id_dev/` — 29ID staging sandbox for caqtdm-porting work.

## Picking a deployment

At runtime, not build time:

- **First load**: the in-app picker shows the available deployments;
  the choice is saved to `localStorage` (`ca-web.deployment`).
- **URL override**: `?deployment=<id>` forces a particular deployment
  and updates the saved preference.
- **Switch later**: gear menu → Deployment → Switch deployment…

The picker auto-discovers any folder under `src/deployments/` that
exposes an `index.tsx` with `export const config` (see
`src/lib/deployment.ts:94-106` for the glob loader).

## Anatomy of a deployment

Two files at minimum:

### `src/deployments/<id>/config.json`

Static, serializable settings — read by both the runtime and
`vite.config.ts` (for the `paths` block):

```json
{
  "id": "29id",
  "title": "29ID Beamline",
  "pvws":  { "socket": "localhost:8080", "ssl": false },
  "tabs": [
    { "id": 3, "icon": "✴️", "label": "29ID-A", "color": "rgb(174,203,255)" },
    { "id": 1, "icon": "⚛️", "label": "29ID-C", "color": "rgb(170,170,255)" },
    { "id": 2, "icon": "💠", "label": "29ID-D" }
  ],
  "panelDefaults": { "29idc-chamber": { "x": 100, "y": 55 }, "...": "..." },
  "defaultHiddenPanels": ["29id-mirrors", "29id-slits", "..."],
  "quickLinks": [{ "label": "29ID", "file": "/ui/29id/29id.ui", "macros": {} }],
  "paths": {
    "uiDirs": { "29id": "/net/s29dserv/xorApps/ui/29id" },
    "startupScript": "/net/s29dserv/xorApps/ui/start_epics_29id"
  }
}
```

### `src/deployments/<id>/index.tsx`

Hoists React components (which can't live in JSON), then merges with
the config.json data and exports the final `DeploymentConfig`:

```tsx
import { MyPanel } from "./MyPanel";
import type { DeploymentConfig, DeploymentConfigData, PanelTemplate } from "../../lib/deployment";
import { spawnCameras } from "./cameras";  // optional
import rawConfig from "./config.json";

// `paths` is build-time only (vite reads it directly from config.json);
// strip it from the runtime bundle.
const { paths: _paths, ...deploymentFields } = rawConfig as DeploymentConfigData;
void _paths;

const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "my-panel", title: "My Panel", Content: MyPanel,
      defaultSize: { w: 700, h: 400 }, scale: "transform" },
  ],
};

const templates: PanelTemplate[] = [
  { id: "tmpl-cameras", title: "Cameras", spawn: () => spawnCameras() },
];

export const config: DeploymentConfig = { ...deploymentFields, tabPanels, templates };
```

## DeploymentConfig shape

Defined in `src/lib/deployment.ts`:

| Field | Required | Notes |
|---|---|---|
| `id: string` | yes | must match folder name |
| `title: string` | yes | shown in the top bar |
| `pvws: { socket, ssl }` | yes | WebSocket address for the pvws backend |
| `tabs: Tab[]` | yes | sidebar tabs (id, icon, label, optional color) |
| `panelDefaults: Record<string, {x,y}>` | yes | initial panel positions |
| `defaultHiddenPanels?: string[]` | no | panel ids hidden on first load |
| `quickLinks?: QuickLink[]` | no | top-bar `.ui` shortcuts (label, file, macros) |
| `layouts?: SavedLayout[]` | no | shared/curated layouts that ship in-bundle |
| `tabPanels: Record<number, PanelConfig[]>` | yes | static panels per tab |
| `templates?: PanelTemplate[]` | no | spawn-on-demand entries in the picker |

`PanelConfig`: `{ id, title, Content, defaultSize?, scale?, aspectLock? }`.

`PanelTemplate`: `{ id, title, prompts?, spawn(values) }` — `prompts`
declares caqtdm-style macro inputs collected by the picker before
`spawn()` runs.

Static panels are singletons (one instance per id, persisted under
`panel:<id>` in localStorage). Spawn-on-demand widgets — cameras,
StripChart, ScanViewChart — are NOT registered in `tabPanels`; they're
created at runtime via `open-camera` / `open-stripchart` /
`open-scanview` events and tracked in App-level overlay state. Saved
layouts capture them by content.

## Adding a new deployment

1. **Copy `example/`** to `src/deployments/<your-id>/`. The example is
   the minimum needed to make the picker happy.

2. **Edit `config.json`**: set `id` to match the folder name, set
   `title`, `pvws.socket`, `tabs`, `panelDefaults`, `paths`.

3. **Edit `index.tsx`**: import your panel components, populate
   `tabPanels`, optionally define `templates`.

4. **`npm run dev`** — the picker now lists your deployment. Pick it
   (or visit `?deployment=<your-id>`).

5. **Right-click any PV widget** to confirm `pvCtx` is wired through.

For panel-naming conventions (hutch-letter prefixes, subsystem titles,
scope-prefixed PV constants, the IOC sub-scope rule when two IOCs
live in the same hutch), see
`.claude/skills/adding-a-panel/SKILL.md`.

## Per-deployment camera list

Cameras spawn from a list defined per deployment. For 29id this lives
in `src/deployments/29id/cameras.ts` and exports a `CAMERAS_29ID`
array of `CameraEntry` (`src/lib/camera.ts`). Each entry is the AD
record prefix and a display label; the standard AreaDetector
convention (`PFX:cam1:` + `PFX:image1:`) is assumed.

## Ops-side details

For host setup, pvws container, SSH-tunnel access, and beamline-host
pitfalls see [deployment.md](deployment.md).
