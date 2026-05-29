# Deployment Guide

How to bring up ca-web on a new beamline machine and access it from a
workstation. For per-deployment file structure (adding tabs, panels,
PV-list constants) see [deployments.md](deployments.md). For pvws
container specifics see [how-to-start-pvws.md](how-to-start-pvws.md).

## Architecture overview

```
  workstation (e.g. nefarian)        beamline server (e.g. mite)
  ───────────────────────────        ────────────────────────────
                            ssh -L
       ca-web-29id  ───────────────►  npm run dev    (vite, :4200)
       (firefox)                      podman pvws    (:8080)
                                          │
                                          ▼
                                      EPICS CA  ──► 29ID IOCs
```

Both the vite dev server and the pvws container run **on the beamline
server**, bound to `127.0.0.1` only — they do not listen on the
beamline subnet. Staff reach them by forwarding ports 4200 and 8080
over SSH from their workstation, then pointing Firefox at
`http://localhost:4200/`.

The repo lives on NFS at `~rodolakis/workspace/ca-web` and is visible
from every beamline host, so one clone covers all machines.

## APS security note

EPICS PV traffic stays on the beamline subnet because pvws runs on a
subnet host. Both listeners are bound to loopback only:

- The vite dev server binds to `127.0.0.1` (`vite.config.ts:521`).
- The pvws Tomcat HTTP connector binds to `127.0.0.1` via a
  bind-mounted `scripts/pvws-server.xml` (the pvws container still
  uses host network mode, which it needs so EPICS CA UDP beacons
  reach it, but Tomcat itself listens only on the loopback
  interface). See [how-to-start-pvws.md](how-to-start-pvws.md) for
  the bind-mount details.

So neither port is reachable from off-mite, and access requires the
SSH tunnel below (which in turn requires a valid beamline-account
login).

## Configuration

Each deployment carries its own pvws URL in
`src/deployments/<id>/config.json`:

```json
{
  "id": "29id",
  "title": "29ID Beamline",
  "pvws": { "socket": "localhost:8080", "ssl": false },
  ...
}
```

`localhost:8080` is correct for the typical setup (vite + pvws on the
same host, accessed via SSH tunnel that forwards 8080 to the same
local port). Change it only if you intentionally split vite and pvws
across different machines or use different ports.

## Bringing up 29ID

### Prerequisites on the beamline server

- Podman (to run the pvws container)
- Node.js (`conda activate nodejs` on hosts where Node is provided by
  conda, e.g. mite)

### One-time pvws start

```bash
cd ~/workspace/ca-web
./scripts/start-pvws.sh --name pvws-29id --no-hosts
```

See [how-to-start-pvws.md](how-to-start-pvws.md) for env vars, the
`pvws-setenv.sh` bind-mount override, and per-host flags.

Verify:

```bash
podman ps | grep pvws-29id
curl -sS http://localhost:8080/pvws/ | grep -c img/connected.png
```

### Start the dev server

```bash
cd ~/workspace/ca-web
npm run dev
```

Use `VITE_POLL=1 npm run dev` when editing source over NFS — vite's
file watcher relies on inotify, which does not propagate to NFS
clients, so HMR needs polling instead.

The server binds to `127.0.0.1:4200` only.

### Access from a workstation

On the staff workstation, run the launcher script:

```bash
ca-web-29id start    # opens SSH tunnel + Firefox at http://localhost:4200
ca-web-29id status   # is the tunnel up?
ca-web-29id stop     # tears down the tunnel
```

The launcher (installed from `scripts/ca-web-29id`) opens:

```
ssh -fN -L 4200:localhost:4200 -L 8080:localhost:8080 29iduser@mite
```

…which is what makes `localhost:4200` on the workstation actually
reach mite's vite server, and `localhost:8080` reach mite's pvws.

### Day-to-day

Once pvws and vite are running on the beamline server (they persist
across staff sessions), the only thing staff do per session is
`ca-web-29id start`.

## Adding a second beamline

Two cases — see `scripts/ca-web-29id` as the template.

**Different beamline server, accessed individually**: copy the script
to `scripts/ca-web-28id`, change `mite` → the 28ID server hostname,
and add a 28ID deployment under `src/deployments/28id/`. Staff run
either `ca-web-29id start` or `ca-web-28id start` (only one at a
time; same local ports 4200 + 8080).

**Both at once**: use different local ports per beamline (e.g.
`-L 4201:28id-srv:4200 -L 8081:28id-srv:8080`) and update the 28ID
deployment's `config.json` `pvws.socket` to match. Then both run
side-by-side in different browser tabs.

## Development workflow

| Scenario | npm run dev on | pvws on | Access |
|---|---|---|---|
| Local dev (simulated IOC) | workstation | workstation | `localhost:4200` direct |
| 29ID screens | mite | mite | SSH tunnel via `ca-web-29id start` |

When editing on the workstation while vite runs on mite (NFS-shared
source), remember `VITE_POLL=1 npm run dev` so HMR fires.

## Known pitfalls

For pvws container quirks (subuid/subgid, `XDG_RUNTIME_DIR`, NFS
overlay storage, `--no-hosts`, naming) see
[how-to-start-pvws.md](how-to-start-pvws.md#common-pitfalls).

### Vite HMR over NFS

Solved by `VITE_POLL=1 npm run dev` (vite uses polling instead of
inotify). Without it, file edits on the workstation are invisible to
vite running on mite and you have to restart the dev server.

### Two pvws instances on the same host

`pvws-29id` and a workstation `pvws` both default to port 8080.
Running them simultaneously on the same machine collides. Use
`--name` + `--port` flags on `start-pvws.sh` to give them different
identities, or stop the unused one.

### Camera image PV size

Camera arrays can be tens of MB. `start-pvws.sh` sets
`EPICS_CA_MAX_ARRAY_BYTES=64000000` (64 MB) so pvws can pass them
through. If you see truncated or missing camera frames after adding a
new high-resolution camera, raise that limit.

