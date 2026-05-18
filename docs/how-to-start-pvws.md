# How to start pvws

ca-web talks to EPICS via [pvws](https://github.com/ornl-epics/pvws), a Java
WebSocket bridge that runs as a podman container alongside (or instead of)
the Vite dev server. Every deployment under `src/deployments/<id>/` points at
a `pvws.socket` (default `localhost:8080`). If pvws is not running on that
socket, all PV widgets stay disconnected.

This guide is the single source of truth for starting pvws. Build/install
specifics live in `../pvws/README-APS.md`.

## Prerequisites

- podman installed.
- The `pvws:latest` image already built or loaded (see [Build or load the
  image](#build-or-load-the-image) if not).
- Network access from this host to the EPICS IOCs you care about.
- `EPICS_CA_ADDR_LIST` set in `../pvws/docker/setenv.sh` and baked into the
  image at build time (`echo $EPICS_CA_ADDR_LIST` on a host that already
  talks to the IOCs tells you what value to use; at APS this is typically
  `164.54.112.168`).

## Quick start

From the ca-web repo root:

```bash
./scripts/start-pvws.sh
```

Verify:

```bash
curl -sS http://localhost:8080/pvws/ | grep -c img/connected.png
```

A non-zero count means pvws is up and the channel pool is connected. You can
also open `http://localhost:8080/pvws` in a browser and subscribe to
`sim://sine` to confirm the server side without needing a real IOC.

## Host recipes

The script accepts flags for the variations between hosts.

### Workstation / nefarian (simulated IOC)

```bash
./scripts/start-pvws.sh
```

Defaults are correct: container name `pvws`, no special storage, `/etc/hosts`
is writable.

### mite / 29ID beamline

```bash
./scripts/start-pvws.sh --name pvws-29id --no-hosts
```

- `--name pvws-29id` avoids conflicts with other instances on the shared
  machine.
- `--no-hosts` is required because `/etc/hosts` is not writable by regular
  users on beamline machines.
- `--rootless-nfs` is **only** needed when podman's storage itself sits
  on NFS (the overlay filesystem can't use NFS extended attributes).
  Having `$HOME` on NFS doesn't automatically mean you need it — check
  the actual storage path:

  ```bash
  podman info --format '{{.Store.GraphRoot}}'
  df -hT $(podman info --format '{{.Store.GraphRoot}}')
  ```

  If that path is `nfs`/`nfs4`, pass `--rootless-nfs` for a one-off
  fix (puts everything in `/var/tmp/$USER-containers` for this host
  only), or — better, persistent — point podman at a local-disk path
  in `~/.config/containers/storage.conf` (see "Common pitfalls"
  below). On APS hosts that have `/local/$USER/` available, the
  permanent config is much cleaner than `--rootless-nfs`.

If `$XDG_RUNTIME_DIR` is not set in your non-login shells, the script
sets it for you. To make it persistent, add to `~/.bashrc`:

```bash
export XDG_RUNTIME_DIR=/var/tmp/${USER}-runtime
mkdir -p $XDG_RUNTIME_DIR
```

## Environment variables

The script always sets these three on the container. They are not optional —
ca-web widgets misbehave without them.

- **`PV_WRITE_SUPPORT=true`** — enables PV write support (required for
  `caTextEntry`, `caMessageButton`, etc.).
- **`EPICS_CA_MAX_ARRAY_BYTES=64000000`** — 64 MB cap on waveform
  payloads, sized for typical area-detector image PVs (e.g. `ArrayData`).
  The container does **not** inherit the host shell's environment.
  Without this, the default is 16 KB and image PVs will connect but
  return 0 elements. Raise further if a camera's `ArrayData` element
  count × bytes-per-element exceeds 64 MB (check with `cainfo` —
  remember the underlying record is sized for the worst-case bit depth,
  not whatever DataType_RBV currently reports).
- **`PV_ARRAY_THROTTLE_MS=1000`** — maximum update rate for waveform/array
  PVs (default is 10000 ms = 10 s, which makes strip charts and line
  profiles sluggish). Set to 1000 ms for ~1 Hz updates; lower values (e.g.
  200) give faster updates at the cost of more bandwidth.

`EPICS_CA_ADDR_LIST` and other EPICS settings are baked into the image at
build time via `../pvws/docker/setenv.sh`, not passed at run time.

## Build or load the image

Full build flow: `../pvws/README-APS.md`. The short version:

**Build on a machine with internet access** (your workstation, or
`nefarian` after `su 29iduser`):

```bash
cd ~/workspace/pvws
podman build --build-arg GIT_TAG=main --build-arg PORT_NUMBER=8080 \
    -t pvws:latest docker/
```

If `$HOME` is on NFS, prepend the rootless-NFS storage flags (or run with
`--root=/var/tmp/${USER}-containers/storage --runroot=/var/tmp/${USER}-containers/run`):

```bash
podman --root=/var/tmp/${USER}-containers/storage \
       --runroot=/var/tmp/${USER}-containers/run \
       build --build-arg GIT_TAG=main --build-arg PORT_NUMBER=8080 \
       -t pvws:latest docker/
```

**Transfer to a beamline machine that has no internet:**

```bash
# On the build machine:
podman save pvws:latest -o ~/workspace/pvws/pvws-image.tar

# On the beamline machine (NFS-shared workspace):
podman load -i ~/workspace/pvws/pvws-image.tar
```

## After a reboot

A reboot stops the pvws container but the image stays in podman's
storage (`~/.local/share/containers` by default), so you just need to
restart it. If you ever used `--rootless-nfs` and `/var/tmp` got wiped,
re-load the image first.

To restart pvws without rebuilding:

```bash
podman load -i ~/workspace/pvws/pvws-image.tar
./scripts/start-pvws.sh --name pvws-29id --no-hosts
```

## Common pitfalls

### `XDG_RUNTIME_DIR` is unset in non-login shells

Podman requires this variable. The startup script sets it to
`/var/tmp/$USER-runtime` if it is unset, but for any direct podman command
you'll need to export it yourself. Persist it in `~/.bashrc`:

```bash
export XDG_RUNTIME_DIR=/var/tmp/${USER}-runtime
mkdir -p $XDG_RUNTIME_DIR
```

### NFS home directories break podman overlay storage

Overlay requires extended attributes that NFS does not support. The
real fix is to point podman at a local-disk path **once**, in a
`~/.config/containers/storage.conf` that lives in your (NFS) home —
the same file then applies on every host you log into, as long as
each host has the target path available. For APS workstations with a
local `/local/$USER/` mount this is the cleanest setup:

```
[storage]
driver = "overlay"
graphRoot = "/local/<your-username>/.local/share/containers/storage"
runroot  = "/run/user/<your-uid>/containers"

[storage.options]
ignore_chown_errors = "true"
```

After this, the script runs fine without `--rootless-nfs` on any host.

`--rootless-nfs` is a fallback for hosts that don't have a local-disk
path you can point graphRoot at — it stashes everything under
`/var/tmp/$USER-containers` on the current machine only. Easy, but
`/var/tmp` is often small and may get wiped on reboot.

`ignore_chown_errors` suppresses chown failures that rootless podman hits
because it cannot chown files it doesn't own on NFS.

### `--network=host` fails without `--no-hosts` on beamline machines

`podman run --network=host` tries to write `/etc/hosts`, which fails with
"permission denied" for non-root users on beamline machines. Pass
`--no-hosts` (the script's `--no-hosts` flag does this).

## pvws write protocol notes

- A PV must be **subscribed** on the same WebSocket connection before a
  write will be accepted. pvws returns
  `{"type":"error","message":"Cannot write unknown PV <name>"}` otherwise.
- PV names must use the `ca://` prefix (e.g. `ca://fr:m1.VAL`).
