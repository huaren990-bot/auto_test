#!/usr/bin/env bash
set -euo pipefail

PURGE_DATA=0
if [[ ${1:-} == --purge-data ]]; then
  PURGE_DATA=1
elif (($#)); then
  echo "Usage: sudo /opt/simtest/uninstall.sh [--purge-data]" >&2
  exit 2
fi
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root: sudo /opt/simtest/uninstall.sh" >&2
  exit 1
fi

systemctl disable --now simtest.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/simtest.service /usr/local/bin/simtestctl
systemctl daemon-reload >/dev/null 2>&1 || true
rm -rf /opt/simtest
if ((PURGE_DATA)); then
  rm -rf /var/lib/simtest
  rm -f /etc/default/simtest
  userdel simtest >/dev/null 2>&1 || true
  groupdel simtest >/dev/null 2>&1 || true
  echo "SimTest and its data were removed."
else
  echo "SimTest was removed. Data remains in /var/lib/simtest."
fi
