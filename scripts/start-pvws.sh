#!/usr/bin/env bash
# Start the pvws backend container that ca-web connects to.
# See docs/how-to-start-pvws.md for details.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Build the EPICS CA search list as every unicast address in the beamline
# /24 subnet. We can't use broadcast (10.54.118.255) because the default
# rootless podman bridge masquerades the container's source IP into a
# non-routable range, so IOC responses to broadcasts never come back.
# Pasta networking has the same limitation in our setup. Brute-force
# unicast to every IP in the subnet works reliably and means new IOCs
# (cameras booting later, new hardware added next month) are covered
# automatically without re-scanning. ~254 UDP packets per PV search;
# negligible load.
ca_addr_list=""
for i in $(seq 1 254); do
    ca_addr_list+="10.54.118.${i} "
done
ca_addr_list="${ca_addr_list% }"

run_args=(
    -d
    --name "$name"
    -p "127.0.0.1:${port}:${port}"
    # Override the image's baked-in /usr/local/tomcat/bin/setenv.sh — it
    # hardcodes EPICS_CA_ADDR_LIST=164.54.112.168 which silently clobbers
    # the -e value below. Our replacement is a no-op (just comments).
    -v "${SCRIPT_DIR}/pvws-setenv.sh:/usr/local/tomcat/bin/setenv.sh:ro"
    -e PV_WRITE_SUPPORT=true
    -e EPICS_CA_MAX_ARRAY_BYTES=64000000
    -e PV_ARRAY_THROTTLE_MS=1000
    -e EPICS_CA_AUTO_ADDR_LIST=NO
    -e "EPICS_CA_ADDR_LIST=${ca_addr_list}"
)
if [[ "$no_hosts" -eq 1 ]]; then
    run_args+=(--no-hosts)
fi

podman "${podman_args[@]}" run "${run_args[@]}" "$image"

echo
echo "started pvws container '$name' on port $port."
echo "verify with: curl -sS http://localhost:${port}/pvws/ | grep -c img/connected.png"
