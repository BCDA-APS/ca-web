#!/usr/bin/env bash
# Start the pvws backend container that ca-web connects to.
# See docs/how-to-start-pvws.md for details.

set -euo pipefail

name="pvws"
port="8080"
image="pvws:latest"
no_hosts=0
rootless_nfs=0

usage() {
    cat <<EOF
Usage: scripts/start-pvws.sh [--name NAME] [--port PORT] [--image IMAGE]
                             [--no-hosts] [--rootless-nfs] [--help]

Starts pvws as a detached podman container with the env vars ca-web expects:
  PV_WRITE_SUPPORT=true
  EPICS_CA_MAX_ARRAY_BYTES=64000000   # 64 MB — needed for camera images
  PV_ARRAY_THROTTLE_MS=1000

Options:
  --name NAME       Container name (default: pvws). Use pvws-29id on shared
                    beamline hosts to avoid conflicts.
  --port PORT       Host port (default: 8080). Must match the deployment's
                    pvws.socket in src/deployments/<id>/config.json.
  --image IMAGE     Image tag to run (default: pvws:latest).
  --no-hosts        Pass --no-hosts to podman run. Required on beamline
                    machines where /etc/hosts is not writable.
  --rootless-nfs    Redirect podman storage to /var/tmp/\$USER-containers.
                    Required when \$HOME is on NFS (overlay filesystem
                    cannot use NFS extended attributes).
  --help            Show this message.

Examples:
  Workstation / nefarian:
    ./scripts/start-pvws.sh

  mite / 29ID beamline:
    ./scripts/start-pvws.sh --name pvws-29id --no-hosts
  (add --rootless-nfs only if \$HOME is on NFS — mite's isn't.)
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)          name="$2"; shift 2 ;;
        --port)          port="$2"; shift 2 ;;
        --image)         image="$2"; shift 2 ;;
        --no-hosts)      no_hosts=1; shift ;;
        --rootless-nfs)  rootless_nfs=1; shift ;;
        -h|--help)       usage; exit 0 ;;
        *)
            echo "unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
    export XDG_RUNTIME_DIR="/var/tmp/${USER}-runtime"
    mkdir -p "$XDG_RUNTIME_DIR"
    echo "set XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR (was unset)"
fi

podman_args=()
if [[ "$rootless_nfs" -eq 1 ]]; then
    podman_args+=(
        "--root=/var/tmp/${USER}-containers/storage"
        "--runroot=/var/tmp/${USER}-containers/run"
    )
fi

if ! podman "${podman_args[@]}" image exists "$image"; then
    cat <<EOF >&2
error: image '$image' not found.

Build or load it first. See docs/how-to-start-pvws.md for the full flow;
quick options:

  # Build (machine with internet access):
  cd ../pvws && podman build --build-arg GIT_TAG=main \\
      --build-arg PORT_NUMBER=8080 -t pvws:latest docker/

  # Load from NFS tarball (beamline machine, offline):
  podman load -i ~/workspace/pvws/pvws-image.tar
EOF
    exit 1
fi

podman "${podman_args[@]}" stop "$name" >/dev/null 2>&1 || true
podman "${podman_args[@]}" rm   "$name" >/dev/null 2>&1 || true

run_args=(
    --network=host
    -d
    --name "$name"
    -e PV_WRITE_SUPPORT=true
    -e EPICS_CA_MAX_ARRAY_BYTES=64000000
    -e PV_ARRAY_THROTTLE_MS=1000
)
if [[ "$no_hosts" -eq 1 ]]; then
    run_args+=(--no-hosts)
fi

podman "${podman_args[@]}" run "${run_args[@]}" "$image"

echo
echo "started pvws container '$name' on port $port."
echo "verify with: curl -sS http://localhost:${port}/pvws/ | grep -c img/connected.png"
