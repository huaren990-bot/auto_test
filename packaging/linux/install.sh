#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HOST_VALUE=127.0.0.1
PORT_VALUE=4173
START_SERVICE=1

usage() {
  cat <<'EOF'
Usage: sudo ./install.sh [--host ADDRESS] [--port PORT] [--no-start]

Installs SimTest under /opt/simtest, stores data under /var/lib/simtest,
and creates the simtest.service systemd unit. Existing data is preserved.
EOF
}

while (($#)); do
  case "$1" in
    --host) HOST_VALUE=${2:?missing host}; shift 2 ;;
    --port) PORT_VALUE=${2:?missing port}; shift 2 ;;
    --no-start) START_SERVICE=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run this installer as root: sudo ./install.sh" >&2
  exit 1
fi
if [[ $(uname -s) != Linux ]]; then
  echo "This installer only supports Linux." >&2
  exit 1
fi
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

cd "$ROOT_DIR"
sha256sum --check manifest.sha256

if ! getent group simtest >/dev/null; then
  groupadd --system simtest
fi
if ! id -u simtest >/dev/null 2>&1; then
  useradd --system --gid simtest --home-dir /var/lib/simtest --shell /usr/sbin/nologin simtest
fi

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl stop simtest.service >/dev/null 2>&1 || true
fi

install -d -m 0755 /opt/simtest /opt/simtest/app /opt/simtest/runtime/bin
cp -a "$ROOT_DIR/app/." /opt/simtest/app/
install -m 0755 "$ROOT_DIR/runtime/bin/node" /opt/simtest/runtime/bin/node
install -m 0644 "$ROOT_DIR/runtime/LICENSE" /opt/simtest/runtime/LICENSE
install -m 0755 "$ROOT_DIR/uninstall.sh" /opt/simtest/uninstall.sh
install -m 0644 "$ROOT_DIR/README-离线安装.md" /opt/simtest/README-离线安装.md
install -m 0755 "$ROOT_DIR/simtestctl" /usr/local/bin/simtestctl
install -d -o simtest -g simtest -m 0750 /var/lib/simtest
if [[ ! -f /var/lib/simtest/simtest.sqlite ]]; then
  install -o simtest -g simtest -m 0640 "$ROOT_DIR/seed/simtest.sqlite" /var/lib/simtest/simtest.sqlite
fi
chown -R root:root /opt/simtest/app /opt/simtest/runtime

install -m 0644 "$ROOT_DIR/simtest.service" /etc/systemd/system/simtest.service
if [[ ! -f /etc/default/simtest ]]; then
  install -m 0644 "$ROOT_DIR/simtest.default" /etc/default/simtest
fi
sed -i -E "s/^HOST=.*/HOST=$HOST_VALUE/; s/^PORT=.*/PORT=$PORT_VALUE/" /etc/default/simtest

if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
  systemctl enable simtest.service >/dev/null
  if ((START_SERVICE)); then
    systemctl restart simtest.service
  fi
else
  echo "systemd is not active. Files were installed; run 'sudo -u simtest simtestctl foreground' to start." >&2
fi

echo
echo "SimTest installation completed."
echo "Open: http://$HOST_VALUE:$PORT_VALUE"
echo "Control: simtestctl status | start | stop | restart | logs | check | backup"
