# Deployment config.json Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse each deployment's split config (`index.tsx` + `paths.json`) into a single `config.json` of serializable data, leaving `index.tsx` for React component definitions and the `tabPanels` mapping only.

**Architecture:** Each `src/deployments/<id>/` gets a `config.json` carrying `id`, `title`, `pvws`, `tabs`, `panelDefaults`, optional `defaultHiddenPanels`, optional `quickLinks`, and an optional nested `paths` block (formerly `paths.json`). `index.tsx` imports the JSON, builds `tabPanels` (which references React components by value and can't be JSON), and exports `{ ...rawConfig, tabPanels }`. `vite.config.ts` reads `config.json` instead of `paths.json` and looks under `parsed.paths` for the path fields.

**Tech Stack:** React 18, TypeScript 5 (with `resolveJsonModule: true` already enabled), Vite 7.

**Verification:** This repo has no test framework. Each task ends by running `npm run build` (which runs `tsc -b && vite build` per `package.json`) and where relevant `npm run dev` for manual checks. The pre-commit quality-gate hook (`tsc + ESLint`) catches type/lint regressions on commit. No `--no-verify`.

**Sequencing rationale:** Tasks 1 and 2 migrate the two deployments that have no `paths.json` — pure runtime refactors that don't touch vite. Task 3 atomically migrates `29id` and updates `vite.config.ts` at the same time, because vite must switch from reading `paths.json` to reading `config.json.paths` in lock-step with the file move, or 29ID loses its NFS paths in the intermediate state.

---

### Task 1: Migrate `example` deployment to `config.json`

**Files:**
- Create: `src/deployments/example/config.json`
- Modify: `src/deployments/example/index.tsx`

- [ ] **Step 1: Create `config.json` with the serializable fields**

Write `src/deployments/example/config.json`:

```json
{
  "id": "example",
  "title": "Example Deployment",
  "pvws": { "socket": "localhost:8080", "ssl": false },
  "tabs": [
    { "id": 1, "icon": "⌂",  "label": "Home" },
    { "id": 2, "icon": "🔬", "label": "Test" }
  ],
  "panelDefaults": {
    "motors":               { "x": 108, "y":  56 },
    "lorentzian":           { "x": 108, "y": 460 },
    "area-detector":        { "x": 108, "y": 800 },
    "test":                 { "x": 108, "y":  56 },
    "motor-card-test":      { "x": 108, "y": 400 },
    "motor-card-row-test":  { "x": 500, "y": 400 },
    "motor-card-flat-test": { "x": 108, "y": 700 }
  }
}
```

Note: this deployment has no `quickLinks`, no `defaultHiddenPanels`, and no `paths` — omit those keys (they remain optional in `DeploymentConfig`).

- [ ] **Step 2: Rewrite `index.tsx` to import JSON and merge `tabPanels`**

Replace the existing `export const config: DeploymentConfig = { ... };` block at the bottom of `src/deployments/example/index.tsx` (lines 122-156) with:

```tsx
import rawConfig from "./config.json";

// ...all existing imports and component definitions above stay unchanged...

const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "motors",        title: "Motors",                          Content: MotorsContent },
    { id: "lorentzian",    title: "Detector — Simulated Lorentzian", Content: LorentzianContent },
    { id: "area-detector", title: "Area Detector — myad:cam1",       Content: AreaDetectorContent },
  ],
  2: [
    { id: "test",                 title: "Widget Test",        Content: TestContent },
    { id: "motor-card-test",      title: "Motor Cards",        Content: MotorCardTestContent },
    { id: "motor-card-row-test",  title: "Motor Cards (row)",  Content: MotorCardRowTestContent },
    { id: "motor-card-flat-test", title: "Motor Cards (flat)", Content: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {["m1","m2","m3","m4","m5","m6"].map(m => <MotorCardFlat key={m} pv={`fr:${m}`} />)}
      </div>
    )},
  ],
};

export const config: DeploymentConfig = { ...rawConfig, tabPanels };
```

The `import rawConfig from "./config.json";` should go with the other imports at the top of the file. The leading comment block (lines 1-3) about copying this folder for a new deployment stays.

- [ ] **Step 3: Run the build to verify TypeScript accepts the merge**

Run: `npm run build`
Expected: Build succeeds. `tsc` accepts the JSON import (already supported by `resolveJsonModule: true` in `tsconfig.json`) and the spread typechecks against `DeploymentConfig` because `tabPanels` is the only missing key after spread.

If `tsc` complains that JSON-derived `pvws.ssl` widens to `boolean` instead of staying `false`-typed, that's still structurally assignable to `DeploymentConfig.pvws.ssl: boolean` — should not be an error. If it is, add `as const` to the JSON via a typed cast: `export const config: DeploymentConfig = { ...(rawConfig as DeploymentConfig), tabPanels };`. Do not introduce this cast preemptively — only if tsc fails.

- [ ] **Step 4: Smoke-test in dev**

Run: `npm run dev` (background), open `http://localhost:4200/?deployment=example`.
Expected: The Example Deployment panels render the same as before — Motors / Lorentzian / Area Detector on tab 1, Widget Test / three Motor Card panels on tab 2.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/deployments/example/config.json src/deployments/example/index.tsx
git commit -m "refactor(example): extract deployment config into config.json"
```

---

### Task 2: Migrate `nefarian` deployment to `config.json`

**Files:**
- Create: `src/deployments/nefarian/config.json`
- Modify: `src/deployments/nefarian/index.tsx`

- [ ] **Step 1: Create `config.json`**

Write `src/deployments/nefarian/config.json`:

```json
{
  "id": "nefarian",
  "title": "Nefarian",
  "pvws": { "socket": "localhost:8080", "ssl": false },
  "tabs": [
    { "id": 1, "icon": "⌂",  "label": "Home" },
    { "id": 2, "icon": "🔬", "label": "Test" }
  ],
  "panelDefaults": {
    "motors":               { "x": 108, "y":  56 },
    "lorentzian":           { "x": 108, "y": 460 },
    "area-detector":        { "x": 108, "y": 800 },
    "test":                 { "x": 108, "y":  56 },
    "motor-card-test":      { "x": 108, "y": 400 },
    "motor-card-row-test":  { "x": 500, "y": 400 },
    "motor-card-flat-test": { "x": 108, "y": 700 }
  }
}
```

- [ ] **Step 2: Rewrite `index.tsx`**

Replace the existing `export const config: DeploymentConfig = { ... };` block at the bottom of `src/deployments/nefarian/index.tsx` (lines 118-152). Add `import rawConfig from "./config.json";` to the import block at the top. Replace the export with:

```tsx
const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "motors",        title: "Motors",                          Content: MotorsContent },
    { id: "lorentzian",    title: "Detector — Simulated Lorentzian", Content: LorentzianContent },
    { id: "area-detector", title: "Area Detector — myad:cam1",       Content: AreaDetectorContent },
  ],
  2: [
    { id: "test",                 title: "Widget Test",        Content: TestContent },
    { id: "motor-card-test",      title: "Motor Cards",        Content: MotorCardTestContent },
    { id: "motor-card-row-test",  title: "Motor Cards (row)",  Content: MotorCardRowTestContent },
    { id: "motor-card-flat-test", title: "Motor Cards (flat)", Content: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {["m1","m2","m3","m4","m5","m6"].map(m => <MotorCardFlat key={m} pv={`fr:${m}`} />)}
      </div>
    )},
  ],
};

export const config: DeploymentConfig = { ...rawConfig, tabPanels };
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Smoke-test**

Run: `npm run dev` (background), open `http://localhost:4200/?deployment=nefarian`.
Expected: Same panels as before. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/deployments/nefarian/config.json src/deployments/nefarian/index.tsx
git commit -m "refactor(nefarian): extract deployment config into config.json"
```

---

### Task 3: Migrate `29id` deployment and switch `vite.config.ts` to read `config.json`

This is the atomic task: creating `29id/config.json`, deleting `29id/paths.json`, updating `vite.config.ts`, and shrinking `29id/index.tsx` must all land in the same commit, because vite's `loadDeploymentPaths()` switches sources at this point.

**Files:**
- Create: `src/deployments/29id/config.json`
- Modify: `src/deployments/29id/index.tsx`
- Modify: `vite.config.ts:34-108`
- Delete: `src/deployments/29id/paths.json`

- [ ] **Step 1: Create `29id/config.json` with nested `paths` block**

Write `src/deployments/29id/config.json`:

```json
{
  "id": "29id",
  "title": "29ID Beamline",
  "pvws": { "socket": "mite:8080", "ssl": false },
  "quickLinks": [
    { "label": "29ID", "file": "/ui/29id/29id.ui", "macros": {} }
  ],
  "tabs": [
    { "id": 3, "icon": "✴️", "label": "29ID-A", "color": "rgb(174,203,255)" },
    { "id": 1, "icon": "⚛",  "label": "29ID-C", "color": "rgb(170,170,255)" },
    { "id": 2, "icon": "💠", "label": "29ID-D" }
  ],
  "panelDefaults": {
    "29idc-chamber-v2":     { "x": 100, "y":  55 },
    "29idc-motors":         { "x": 650, "y":  55 },
    "29idc-arpes":          { "x": 100, "y": 1000 },
    "29idc-energy":         { "x": 100, "y": 500 },
    "29idd-kappa":          { "x": 100, "y":  55 },
    "29id-energy-a":        { "x":  85, "y":  55 },
    "29id-beamline-layout": { "x":  85, "y": 530 },
    "29id-mirrors":         { "x": 600, "y":  55 },
    "29id-bllayout-d":      { "x": 100, "y": 200 },
    "29id-bllayout-e":      { "x": 100, "y": 400 },
    "29id-slits":           { "x": 400, "y":  55 },
    "29id-diagon":          { "x": 100, "y": 200 },
    "29id-scan-records":    { "x": 700, "y":  55 },
    "29id-strip-tool":      { "x": 700, "y": 300 }
  },
  "defaultHiddenPanels": [
    "29id-mirrors",
    "29id-bllayout-d",
    "29id-bllayout-e",
    "29id-slits",
    "29id-diagon",
    "29id-scan-records",
    "29id-strip-tool"
  ],
  "paths": {
    "uiDirs": {
      "29id":   "/net/s29dserv/xorApps/ui/29id",
      "ADCore": "/APSshare/epics/synApps_6_2_1/support/areaDetector-R3-12-1/ADCore/ADApp/op/ui",
      "motors": "/APSshare/epics/synApps_6_2_1/support/motor-R7-2-2/motorApp/op/ui/autoconvert"
    },
    "startupScript": "/net/s29dserv/xorApps/ui/start_epics_29id",
    "adl2ui": "/APSshare/bin/adl2ui"
  }
}
```

This is the union of the current `paths.json` (now nested under `paths`) and the literal fields from `index.tsx`.

- [ ] **Step 2: Rewrite `29id/index.tsx`**

Replace the existing `export const config: DeploymentConfig = { ... };` block at the bottom of `src/deployments/29id/index.tsx` (lines 132-181). Add `import rawConfig from "./config.json";` to the import block at the top. Replace the export with:

```tsx
const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "29idc-chamber-v2", title: "Chamber",         Content: ChamberDiagramV2 },
    { id: "29idc-motors",     title: "29ID-C Motors",   Content: ArpesMotorsContent },
    { id: "29idc-arpes",      title: "29ID-C ARPES",    Content: ArpesContent },
    { id: "29idc-energy",     title: "Beamline Energy", Content: BeamlineEnergy },
  ],
  2: [{ id: "29idd-kappa", title: "29ID-D Kappa", Content: KappaContent }],
  3: [
    { id: "29id-beamline-layout", title: "Beamline Layout", Content: BeamlineLayout },
    { id: "29id-mirrors",         title: "Mirrors",         Content: Mirrors },
    { id: "29id-energy-a",        title: "Beamline Energy", Content: BeamlineEnergyA },
    { id: "29id-bllayout-d",      title: "D Layout",        Content: BLLayoutD },
    { id: "29id-bllayout-e",      title: "E Layout",        Content: BLLayoutE },
    { id: "29id-slits",           title: "Slits",           Content: Slits },
    { id: "29id-diagon",          title: "DiaGon",          Content: Diagon },
    { id: "29id-scan-records",    title: "ScanRecords",     Content: ScanRecords },
    { id: "29id-strip-tool",      title: "Strip Tool",      Content: () => <StripChart id="29id-strip-tool" initialPvs={CA_PVS} /> },
  ],
};

export const config: DeploymentConfig = { ...rawConfig, tabPanels };
```

Keep all the existing component imports, the `CA_PVS` array, `ARPES_MOTORS`, `SYNC_MOTORS`, `SyncButtons`, `ArpesMotorsContent`, `ArpesContent`, and `KappaContent` definitions exactly as they are.

- [ ] **Step 3: Update `vite.config.ts` to read `config.json` and look under `parsed.paths`**

Modify `vite.config.ts:34-108` (the `loadDeploymentPaths` function). Change the file lookup at line 50 from `"paths.json"` to `"config.json"`, and change the validation + extraction loop to read from a nested `paths` block instead of the top level. The new function body:

```ts
function loadDeploymentPaths(): LoadedPaths {
  const uiDirs: Record<string, UiDirEntry> = {};
  const startupScripts: string[] = [];
  let adl2ui: string | null = null;
  const perDeploymentStatus: Record<string, { missing: string[] }> = {};

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(DEPLOYMENTS_DIR, { withFileTypes: true });
  } catch {
    return { uiDirs, startupScripts, adl2ui, perDeploymentStatus };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const file = path.join(DEPLOYMENTS_DIR, id, "config.json");
    if (!fs.existsSync(file)) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`[deployments] failed to parse ${file}: ${e}`);
    }

    const pathsBlock =
      parsed.paths && typeof parsed.paths === "object" && !Array.isArray(parsed.paths)
        ? (parsed.paths as Record<string, unknown>)
        : {};

    for (const k of Object.keys(pathsBlock)) {
      if (!VALID_KEYS.has(k)) {
        throw new Error(
          `[deployments] ${file}: unknown key "paths.${k}". Allowed: ${[...VALID_KEYS].join(", ")}`
        );
      }
    }

    const missing: string[] = [];

    const ud = pathsBlock.uiDirs;
    if (ud && typeof ud === "object") {
      for (const [key, target] of Object.entries(ud as Record<string, unknown>)) {
        if (typeof target !== "string") {
          throw new Error(`[deployments] ${file}: paths.uiDirs.${key} must be a string`);
        }
        const existing = uiDirs[key];
        if (existing && existing.target !== target) {
          throw new Error(
            `[deployments] uiDirs conflict on key "${key}": ` +
            `${existing.deploymentId} -> ${existing.target} vs ${id} -> ${target}`
          );
        }
        uiDirs[key] = { target, deploymentId: id };
        if (!fs.existsSync(target)) missing.push(`uiDirs.${key}`);
      }
    }

    if (typeof pathsBlock.startupScript === "string") {
      if (fs.existsSync(pathsBlock.startupScript)) {
        if (!startupScripts.includes(pathsBlock.startupScript)) startupScripts.push(pathsBlock.startupScript);
      } else {
        missing.push("startupScript");
      }
    }

    if (typeof pathsBlock.adl2ui === "string") {
      if (fs.existsSync(pathsBlock.adl2ui)) {
        if (adl2ui === null) adl2ui = pathsBlock.adl2ui;
      } else {
        missing.push("adl2ui");
      }
    }

    perDeploymentStatus[id] = { missing };
  }

  return { uiDirs, startupScripts, adl2ui, perDeploymentStatus };
}
```

Also update the top-of-file comment block (`vite.config.ts:9-17`) to reflect the new shape:

```ts
// ── Per-deployment external paths ─────────────────────────────────────────────
//
// Each src/deployments/<id>/config.json may declare a "paths" block:
//   paths.uiDirs:        Record<key, absolute target>   — /ui/<key>/* serves from target
//   paths.startupScript: absolute path                  — caQtDM startup script to parse
//   paths.adl2ui:        absolute path                  — converter binary
//
// All fields optional. Missing targets are tolerated; conflicts on uiDirs keys
// across deployments throw. Lets the package run on hosts without 29ID NFS.
```

- [ ] **Step 4: Delete `paths.json`**

```bash
rm src/deployments/29id/paths.json
```

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: Build succeeds. Look for the `[ui-search-path] N display files indexed` log line in the build output — on a host with 29ID NFS access, N should be the same count as before this refactor. On a host without NFS access, N may be smaller (only `public/ui/` files) and `perDeploymentStatus.29id.missing` will list the unreachable `uiDirs.*` / `startupScript` / `adl2ui` keys — same behavior as today.

- [ ] **Step 6: Smoke-test all three deployments**

Run: `npm run dev` (background).

Open each in turn and confirm panels render:

- `http://localhost:4200/?deployment=29id` — all panels per tab work; on a 29ID host, `.ui` files load from NFS (network tab shows 200s on `/ui/29id/29id.ui` etc.); on a non-29ID host, the picker shows "external paths unreachable" exactly as before.
- `http://localhost:4200/?deployment=example`
- `http://localhost:4200/?deployment=nefarian`

Open the picker route at `http://localhost:4200/` and confirm all three deployments are listed.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/deployments/29id/config.json src/deployments/29id/index.tsx vite.config.ts
git add -u src/deployments/29id/paths.json
git commit -m "refactor(29id): consolidate config into config.json; vite reads paths from nested block"
```

(`git add -u` records the deletion of `paths.json`.)

---

### Task 4: Run the critic agent

Per CLAUDE.md: "After 5+ file changes, run `/agent critic` before committing unless the user says otherwise." This refactor touched 7 files across 3 commits; the critic should review the cumulative diff against `main`.

- [ ] **Step 1: Dispatch the critic agent**

Use the Agent tool with `subagent_type: "critic"`. Prompt:

> Review the cumulative diff against `main` for the deployment-config consolidation. The intent: each `src/deployments/<id>/` now has a single `config.json` carrying all serializable config (including an optional nested `paths` block), and `index.tsx` is reduced to React components + the `tabPanels` mapping + an `{ ...rawConfig, tabPanels }` export. `vite.config.ts`'s `loadDeploymentPaths()` reads `config.json` and looks under `parsed.paths` instead of reading `paths.json` directly. Check for: drift between deployments (does each one merge the JSON the same way?); silently dropped fields between old config and new config (compare bottom of each `index.tsx` pre- vs post-diff); type-safety of the JSON spread; any error path in vite that worked with `paths.json` but is broken now. READ-ONLY review.

- [ ] **Step 2: Address any high-priority issues**

If the critic flags actual problems (not stylistic preferences), fix them in a follow-up commit. If everything is clean, no action.

---

### Task 5: Update docs to match

Per CLAUDE.md: "When editing source under `src/lib/`, `src/widgets/`, or `src/deployments/`, update `bot_vault/CHANGELOG.md`, `bot_vault/architecture/overview.md`, or the relevant page under `docs/` if the change is architecturally visible."

**Files:**
- Modify: `bot_vault/CHANGELOG.md`
- Modify: `bot_vault/architecture/overview.md` (only if it describes the deployment file layout — check first)
- Modify: `docs/deployments.md` (only if it documents `paths.json` — check first)

- [ ] **Step 1: Check which doc surfaces mention the old two-file layout**

Run:

```bash
grep -nR "paths.json" bot_vault/ docs/
grep -nR "src/deployments" bot_vault/ docs/
```

Expected: identify each location where the doc still describes `index.tsx + paths.json`. The grep results determine which files actually need editing — do not edit a file if it doesn't reference the old layout.

- [ ] **Step 2: Add a `CHANGELOG.md` entry under `## Unreleased`**

Append to the existing "Unreleased" section in `bot_vault/CHANGELOG.md` (after the Bundle/structure pass entry):

```markdown
### Deployment config consolidation

- Each `src/deployments/<id>/` now uses a single `config.json` carrying
  all serializable config (id, title, pvws, tabs, panelDefaults,
  optional defaultHiddenPanels, optional quickLinks, optional nested
  `paths` block). The per-deployment `paths.json` is gone.
- `index.tsx` is now just React components, the `tabPanels` mapping,
  and `export const config: DeploymentConfig = { ...rawConfig, tabPanels };`.
- `vite.config.ts`'s `loadDeploymentPaths()` reads `config.json` and
  looks under `parsed.paths` for `uiDirs` / `startupScript` / `adl2ui`.
  Top-level keys of `config.json` are ignored by vite — they're the
  runtime's concern.
```

- [ ] **Step 3: Update other docs only where they still mention `paths.json` or the two-file layout**

For each file the Step-1 grep flagged: replace references to `paths.json` with `config.json`'s `paths` block, and references to "config in index.tsx" with "config in config.json (with tabPanels in index.tsx)". Keep edits minimal — do not rewrite unrelated content.

Do NOT touch `docs/deployments.md` if it only describes the Vite-modes selection flow (it's already stale for unrelated reasons; not in scope here).

- [ ] **Step 4: Commit**

```bash
git add bot_vault/CHANGELOG.md
# add any other doc files touched in Step 3
git commit -m "docs: note deployment config consolidation into config.json"
```

---

## Self-review notes

- Spec coverage: every section of the spec (file layout, schema, index.tsx shape, vite.config.ts changes, migration) maps to Tasks 1-3. Task 4 (critic) and Task 5 (docs) are repo conventions from CLAUDE.md.
- No placeholders. Each step shows the full content to write/run.
- Type consistency: the `{ ...rawConfig, tabPanels }` merge appears identically in Tasks 1, 2, and 3.
- Risk: an intermediate state where `29id/paths.json` exists but vite has switched to `config.json` would silently drop 29ID's NFS paths. Task 3 is structured as a single atomic commit precisely to avoid that.
