#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HOST_VALUE=127.0.0.1
PORT_VALUE=4173
DATA_DIR="$ROOT_DIR/state"

usage() {
  cat <<'EOF'
Usage: ./run-portable.sh [--host ADDRESS] [--port PORT] [--data-dir DIRECTORY]

Runs SimTest directly from the extracted directory. Data is stored in ./state
unless --data-dir is provided. Use --host 0.0.0.0 only on a trusted network.
EOF
}

while (($#)); do
  case "$1" in
    --host) HOST_VALUE=${2:?missing host}; shift 2 ;;
    --port) PORT_VALUE=${2:?missing port}; shift 2 ;;
    --data-dir) DATA_DIR=${2:?missing data directory}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PORT_VALUE" in
  ''|*[!0-9]*) echo "Port must be an integer between 1 and 65535." >&2; exit 2 ;;
esac
if ((PORT_VALUE < 1 || PORT_VALUE > 65535)); then
  echo "Port must be an integer between 1 and 65535." >&2
  exit 2
fi

PACKAGE_ARCH=$(cat "$ROOT_DIR/.package-arch")
MACHINE_ARCH=$(uname -m)
case "$PACKAGE_ARCH:$MACHINE_ARCH" in
  amd64:x86_64|arm64:aarch64|arm64:arm64) ;;
  *) echo "This package is for $PACKAGE_ARCH, but this computer is $MACHINE_ARCH." >&2; exit 1 ;;
esac

mkdir -p "$DATA_DIR"
if [[ ! -f "$DATA_DIR/simtest.sqlite" ]]; then
  cp "$ROOT_DIR/seed/simtest.sqlite" "$DATA_DIR/simtest.sqlite"
fi

echo "SimTest starting at http://$HOST_VALUE:$PORT_VALUE"
echo "Data: $DATA_DIR/simtest.sqlite"
exec env NODE_ENV=production HOST="$HOST_VALUE" PORT="$PORT_VALUE" \
  SIMTEST_DB_PATH="$DATA_DIR/simtest.sqlite" \
  "$ROOT_DIR/runtime/bin/node" "$ROOT_DIR/app/scripts/serve.mjs"
