# Deployment Guide

## Architecture overview

The source tree lives on an NFS-mounted home directory (`/home/beams3/RODOLAKIS/workspace/caqtdm-web`) that is visible from every machine on the beamline subnet. There is no need to copy files or maintain a separate clone on each machine — the same directory is used everywhere.

```
  workstation (beams3)          beamline machine (e.g. s29idd)
  ─────────────────────         ──────────────────────────────
  npm run dev  ←──── NFS ────→  npm run dev
  (local PVs)                   (29ID PVs via pvws)
```

Both invocations of `npm run dev` run against the same source files. However, Vite's file watcher does not detect changes over NFS — after editing code on the workstation, the dev server on the beamline machine must be restarted to pick up the changes.

## APS security rule

EPICS PV traffic must never leave the beamline subnet. This means:

- pvws must run on a machine that is physically on the subnet.
- The web app must also be served from that machine.

## Configuration

### `.env` (not committed to git)

```
VITE_PVWS_SOCKET=localhost:8080
VITE_PVWS_SSL=false
```

When pvws and the Vite dev server run on the **same machine**, `localhost` resolves correctly in the browser — no change to `.env` is needed regardless of which machine you are on.

If for some reason pvws runs on a different machine than the Vite server, set:

```
VITE_PVWS_SOCKET=<pvws-hostname>:8080
```

Deployment-specific pvws addresses and tab layouts are now configured via Vite
modes — see README for usage. The `.env` file (gitignored) remains a local
fallback for development without a mode flag.

### `vite.config.ts`

The dev server must bind to all interfaces so it is reachable from other machines on the subnet:

```ts
server: {
  port: 4200,
  host: "0.0.0.0"   // ← required for subnet access
}
```

This is committed to the repo and is safe for local development too (it simply makes the server reachable on the local network, which is harmless).

## Deploying to 29ID

### Prerequisites

On the beamline machine:
- Podman (to run the pvws container)
- Node.js for the Vite dev server (any source — conda env `nodejs`, nvm, or system package)

### Step 1 — Start pvws

See [how-to-start-pvws.md](how-to-start-pvws.md) for build/load, env vars,
and host-specific notes. On `mite` the invocation is:

```bash
./scripts/start-pvws.sh --name pvws-29id --no-hosts --rootless-nfs
```

### Step 2 — Start the dev server

```bash
cd /home/beams3/RODOLAKIS/workspace/caqtdm-web
# If Node is provided by conda on this host: conda activate nodejs
npm run dev -- --mode 29id
```

The server starts on port 4200 and binds to all interfaces.

### Step 3 — Open the app

From any browser on the beamline subnet:

```
http://<beamline-machine-hostname>:4200
```

PV names that use 29ID prefixes (e.g. `29idd:`, `29id:`) will connect through pvws, which has direct EPICS access to the IOCs.

## Development workflow

| Scenario | Where to run `npm run dev` | pvws |
|---|---|---|
| Local development (simulated PVs) | workstation (beams3) | local podman |
| Testing 29ID screens | beamline machine | beamline machine |

Because the source directory is NFS-shared, you can edit code on the workstation
and the beamline machine sees the same files. However, Vite's file watcher does
not detect NFS changes — **restart the dev server on the beamline machine after
every code edit**.

## Known pitfalls (lessons learned from first deployment to `mite`)

For pvws-specific pitfalls (subuid/subgid, `XDG_RUNTIME_DIR`, NFS overlay
storage, `--no-hosts`, container naming), see
[how-to-start-pvws.md](how-to-start-pvws.md#common-pitfalls).

### Vite HMR does not work over NFS

When `npm run dev` is running on a beamline machine and source files are edited
on the workstation (NFS-shared), Vite's file watcher does not detect changes.
A hard browser refresh is not enough — the dev server must be restarted:

```bash
# Ctrl-C the running server, then:
# (activate your conda env first if Node is provided that way)
npm run dev
```

---

## Git remote (future)

The repo currently has no remote. Options when a remote becomes needed:

- **APS GitLab** — preferred for beamline software; keeps code on-site.
- **GitHub** — convenient for open-source sharing; check with beamline management before pushing PV names or screen layouts publicly.

To add a remote once created:

```bash
git remote add origin <url>
git push -u origin main
```
