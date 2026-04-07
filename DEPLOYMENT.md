# Deployment Guide

## Architecture overview

The source tree lives on an NFS-mounted home directory (`/home/beams3/RODOLAKIS/workspace/caqtdm-web`) that is visible from every machine on the beamline subnet. There is no need to copy files or maintain a separate clone on each machine — the same directory is used everywhere.

```
  workstation (beams3)          beamline machine (e.g. s29idd)
  ─────────────────────         ──────────────────────────────
  npm run dev  ←──── NFS ────→  npm run dev
  (local PVs)                   (29ID PVs via pvws)
```

Both invocations of `npm run dev` run against the same source files. Vite's hot-module replacement means that code edits made on the workstation are picked up immediately by a running dev server on the beamline machine.

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
- conda environment `nodejs` with Node.js (for the Vite dev server)

### Step 1 — Build and start pvws

Full build instructions are in `../pvws/README-APS.md`. Summary:

**1a. Set the EPICS CA address list** — check what your host uses:

```bash
echo $EPICS_CA_ADDR_LIST
```

Then set it in `../pvws/docker/setenv.sh`:

```bash
export EPICS_CA_ADDR_LIST=<your address>   # e.g. 164.54.112.168 for APS
```

**1b. Build the container:**

> **Beamline machines have no internet access.** Build the image on any machine that does
> (e.g. your workstation, or `nefarian` after `su 29iduser`), then transfer it via NFS.
>
> ```bash
> # On a machine WITH internet access, as 29iduser:
> podman --root=/var/tmp/pvws-build/storage \
>        --runroot=/var/tmp/pvws-build/run \
>        build --build-arg GIT_TAG=main --build-arg PORT_NUMBER=8080 -t pvws:latest docker/
>
> # Save to NFS share (accessible from all machines):
> podman --root=/var/tmp/pvws-build/storage \
>        --runroot=/var/tmp/pvws-build/run \
>        save pvws:latest | gzip > /home/beams3/RODOLAKIS/workspace/pvws.tar.gz
>
> # On nerdy — load from NFS (no internet needed):
> podman --root=/var/tmp/29iduser-containers/storage \
>        --runroot=/var/tmp/29iduser-containers/run \
>        load < /home/beams3/RODOLAKIS/workspace/pvws.tar.gz
> ```

```bash
cd ../pvws
podman build --build-arg GIT_TAG=main --build-arg PORT_NUMBER=8080 -t pvws:latest docker/
```

> **NFS home directories:** If the user's home is on NFS (as is the case for `29iduser`),
> podman's overlay storage must be redirected to local disk — NFS does not support the
> extended attributes overlay filesystems require. Add `--root`/`--runroot` flags pointing
> to `/var/tmp`:
>
> ```bash
> podman --root=/var/tmp/29iduser-containers/storage \
>        --runroot=/var/tmp/29iduser-containers/run \
>        build --build-arg GIT_TAG=main --build-arg PORT_NUMBER=8080 -t pvws:latest docker/
> ```
>
> Use the same `--root`/`--runroot` flags for `podman run` as well (see Step 1c).
> Alternatively, make it permanent with `~/.config/containers/storage.conf`:
> ```
> [storage]
> driver = "overlay"
> graphRoot = "/var/tmp/29iduser-containers"
> ```

**1c. Run pvws:**

```bash
podman stop pvws; podman rm pvws
podman run --network=host -d --name pvws \
  -e PV_WRITE_SUPPORT=true \
  -e EPICS_CA_MAX_ARRAY_BYTES=8000000 \
  -e PV_ARRAY_THROTTLE_MS=1000 \
  pvws:latest
```

- `--network=host` — lets the container reach EPICS IOCs on the subnet
- `PV_WRITE_SUPPORT=true` — enables setpoints, buttons, motor commands
- `EPICS_CA_MAX_ARRAY_BYTES=8000000` — required for area detector waveform PVs
- `PV_ARRAY_THROTTLE_MS=1000` — limits waveform update rate to ~1 Hz

Verify pvws is up: open `http://localhost:8080/pvws` in a browser on that machine.

### Step 2 — Start the dev server

```bash
cd /home/beams3/RODOLAKIS/workspace/caqtdm-web
conda activate nodejs
npm run dev
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

Because the source directory is NFS-shared, you can:

1. Edit code on the workstation.
2. The running dev server on the beamline machine picks up changes via HMR automatically.
3. No restart needed for most changes (React component edits, CSS). Restart needed for changes to `vite.config.ts` or `src/main.tsx`.

## Git remote (future)

The repo currently has no remote. Options when a remote becomes needed:

- **APS GitLab** — preferred for beamline software; keeps code on-site.
- **GitHub** — convenient for open-source sharing; check with beamline management before pushing PV names or screen layouts publicly.

To add a remote once created:

```bash
git remote add origin <url>
git push -u origin main
```
