# Handing ca-web over

## Important files, in this order

1. **`README.md`** — the orientation document. What the app is, how to run it,
   the deployment table, and the catalogue of caQtDM widgets the renderer
   supports. Read first.
2. **`docs/architecture.md`** — system overview, the render/connector split, the
   pvws boot gate, how layouts persist. Its "Open questions" section is current.
3. **`docs/deployment.md`** and **`docs/how-to-start-pvws.md`** — bringing the
   thing up at 29-ID: the podman container, the SSH tunnel, and the pitfalls
   that actually happen (NFS overlay storage, `--no-hosts`, cgroup manager).
4. **`docs/display-path-resolution.md`** — how a bare `.ui` filename gets found.
   This is the mechanism the whole prototype rests on; the first section tells
   you which URL form to write in app code.

`docs/adr/` holds seven decision records. ADR 002 (render `.ui` at runtime rather
than porting screens) and ADR 004 (self-contained deployments) are the two that
explain why the codebase looks the way it does. Nothing is published online.

## Getting running

```bash
git clone git@github.com:BCDA-APS/ca-web.git
cd ca-web
conda activate nodejs      # Node.js comes from conda at the APS
npm install
pre-commit install         # not active in a fresh clone; see bite #2

./scripts/start-pvws.sh    # EPICS gateway, needs podman
npm run dev                # http://localhost:4200
```

The picker lists four deployments. `29id` and `29id_dev` are the live ones and
need beamline access. `nefarian` and `example` run anywhere but expect simulated
IOCs serving the `fr:` and `myad:` prefixes — originals at
`/home/beams/RODOLAKIS/epics/ioc/fr` and `.../simDetectorIOC`. Without them every
widget shows dashes, which looks like a connection fault and isn't.

Add `VITE_POLL=1` when editing source over NFS; Vite's inotify watcher doesn't
fire on NFS clients and HMR will silently never trigger.

## Five things that will bite you

**1. `npm run preview` is not a working mode.** The `ui-search-path` plugin is
registered with `configureServer` only, so under `preview` the app loads, panels
render, and every `.ui` file plus the whole file picker fails. Same shape as the
Kestrel proxy problem, and it looks the same way — like a bug in the app. There
is no production build path at all; see the open question below.

**2. A green quality gate says very little.** ESLint's flat config enables one
rule, `react-hooks/rules-of-hooks`. There are no tests and no CI. The pre-commit
gate is `tsc --noEmit` plus that one rule, and because `.git/hooks` is per-clone
it only runs after you have run `pre-commit install` yourself. It had never been
run in the clone this project was developed in, so the gate first fired in
November 2026.

**3. Reads degrade quietly when pvws is down; writes throw.** A boot probe
replaces cs-web-lib's socket with a stub, so PVs sit in their disconnected state
behind a red banner. But `pvwsWriter` owns a *separate* socket that never gets
connected in that path, so the first setpoint commit or tweak-button click
raises `pvwsWriter.connect: socket not configured`. The UI looks calmly broken
and then throws on interaction.

**4. Saved layouts are files on the server, not browser state.** They live in
`src/deployments/<id>/layouts/`, written through a Vite plugin
(`/api/layouts/...`). That directory is gitignored, and there is no export
action in the gear menu, so publishing a layout to everyone means pasting its
JSON into the `layouts` array of that deployment's `config.json` by hand. ADR
006 covers this.

**5. The app must run from inside the repo.** Both the `.ui` search path and
layout persistence are Vite plugins. Serving a built `dist/` from nginx gives
you a UI with no displays and no persistence, failing to console only.

## How this project has been run

- **As a prototype, reactively, for 29-ID.** The finding it exists to
  demonstrate is that existing caQtDM `.ui` screens render as-is in a browser
  rather than needing a rewrite. It is not a production replacement for caQtDM.
- **The code is largely AI-assisted.** Development started in April 2026 and
  has run almost entirely as direct commits to `main` — one merge commit in the
  whole history, no PR process. A stale `rafa-dev` branch sits on the remote.
- **There is no release process.** No tags, no versioning; `package.json` has
  said `0.1.0` throughout. `CHANGELOG.md` is hand-maintained and is the real
  project history — it carries the reasoning behind changes, not just the list.
- **There is no deployment.** `npm run dev` and the pvws container run
  continuously on `nerdy`, and staff reach them through an SSH tunnel opened by
  `scripts/ca-web-29id`, installed as `ca-web` in the shared `29iduser` account.
  Both servers bind to `127.0.0.1` only. Nothing restarts them automatically; if
  the host reboots, someone starts them by hand.
- **`.claude/skills/` holds six procedural guides** for extending the repo
  (adding a panel, adding a widget, debugging pvws). They are specific to this
  codebase and were corrected in November 2026 against the actual source.

## Still to do

- `src/lib/UiRenderer.tsx` is 2553 lines and is the biggest obstacle to working
  in this codebase. Splitting it into dispatch / layout / macros / path
  resolution is queued but untouched.
- The three `MotorCard` variants share `useMotor` and differ only in render.
  Folding them into one component with a `layout` prop is deferred because the
  call sites live in deployments.
- `docs/roadmap.md` lists the remaining widget and rendering work. The entries
  closest to beamline use are 4 (caCamera polish), 5 (general rendering:
  sizePolicy, wider `visibilityCalc` coverage, font scaling), 9 (line profile on
  images) and 10 (click-to-move on scans and images). The file does not record
  who asked for what, so treat the ordering as unranked.

## One open question

Should ca-web keep running as a dev server?

Everything staff depend on at 29-ID is served by `npm run dev` on a beamline
host, indefinitely. That was fine for a prototype and is how it has worked for
months, but it means an unsupervised Vite process is load-bearing, `preview` and
any static build are dead ends, and the two Vite plugins that make the app work
have no production equivalent.

Making it deployable is not a small change: it needs a real server that
reproduces the `.ui` search-path logic and the layouts API — either generated
nginx rules or a small Node server reusing the functions already written in
`vite.config.ts`. `docs/display-path-resolution.md` sketches both.

Worth deciding deliberately rather than by default, especially if another
beamline asks for it.
