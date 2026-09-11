#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
NODE_VERSION=${NODE_VERSION:-22.23.2}
TARGET=${1:-amd64}

case "$TARGET" in
  amd64|x64) DEB_ARCH=amd64; NODE_ARCH=x64 ;;
  arm64|aarch64) DEB_ARCH=arm64; NODE_ARCH=arm64 ;;
  *) echo "Usage: $0 [amd64|arm64]" >&2; exit 2 ;;
esac

OUTPUT_DIR="$PROJECT_ROOT/dist"
CACHE_DIR="${SIMTEST_PACKAGE_CACHE:-$PROJECT_ROOT/.cache/offline-linux}"
WORK_DIR="$OUTPUT_DIR/.build-$DEB_ARCH"
PACKAGE_NAME="simtest-offline-$VERSION-ubuntu22.04-$DEB_ARCH"
PACKAGE_ROOT="$WORK_DIR/$PACKAGE_NAME"
NODE_BASENAME="node-v$NODE_VERSION-linux-$NODE_ARCH"
NODE_ARCHIVE="$CACHE_DIR/$NODE_BASENAME.tar.xz"
NODE_SHASUMS="$CACHE_DIR/node-v$NODE_VERSION-SHASUMS256.txt"
NODE_BASE_URL="https://nodejs.org/download/release/v$NODE_VERSION"
cd "$PROJECT_ROOT"

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

mkdir -p "$OUTPUT_DIR" "$CACHE_DIR"
rm -rf "$WORK_DIR"
mkdir -p "$PACKAGE_ROOT/app/scripts" "$PACKAGE_ROOT/runtime/bin" "$PACKAGE_ROOT/seed" "$PACKAGE_ROOT/docs"

if [[ ! -f "$NODE_ARCHIVE" ]]; then
  echo "Downloading $NODE_BASENAME..."
  curl --fail --location --retry 3 --output "$NODE_ARCHIVE" "$NODE_BASE_URL/$NODE_BASENAME.tar.xz"
fi
if [[ ! -f "$NODE_SHASUMS" ]]; then
  curl --fail --location --retry 3 --output "$NODE_SHASUMS" "$NODE_BASE_URL/SHASUMS256.txt"
fi
EXPECTED_HASH=$(awk -v file="$NODE_BASENAME.tar.xz" '$2 == file {print $1}' "$NODE_SHASUMS")
ACTUAL_HASH=$(hash_file "$NODE_ARCHIVE" | awk '{print $1}')
if [[ -z "$EXPECTED_HASH" || "$EXPECTED_HASH" != "$ACTUAL_HASH" ]]; then
  echo "Node.js archive checksum verification failed." >&2
  exit 1
fi

tar -xJf "$NODE_ARCHIVE" -C "$WORK_DIR"
install -m 0755 "$WORK_DIR/$NODE_BASENAME/bin/node" "$PACKAGE_ROOT/runtime/bin/node"
install -m 0644 "$WORK_DIR/$NODE_BASENAME/LICENSE" "$PACKAGE_ROOT/runtime/LICENSE"

cp -R "$PROJECT_ROOT/frontend" "$PACKAGE_ROOT/app/frontend"
cp -R "$PROJECT_ROOT/backend" "$PACKAGE_ROOT/app/backend"
install -m 0644 "$PROJECT_ROOT/scripts/serve.mjs" "$PACKAGE_ROOT/app/scripts/serve.mjs"
install -m 0644 "$PROJECT_ROOT/scripts/list-models.mjs" "$PACKAGE_ROOT/app/scripts/list-models.mjs"
install -m 0644 "$PROJECT_ROOT/package.json" "$PACKAGE_ROOT/app/package.json"
install -m 0644 "$PROJECT_ROOT/README.md" "$PACKAGE_ROOT/docs/README.md"
install -m 0644 "$PROJECT_ROOT/后端第一阶段说明.md" "$PACKAGE_ROOT/docs/后端第一阶段说明.md"
install -m 0644 "$PROJECT_ROOT/行动指令构建说明.md" "$PACKAGE_ROOT/docs/行动指令构建说明.md"

for file in install.sh uninstall.sh run-portable.sh simtestctl verify.sh; do
  install -m 0755 "$PROJECT_ROOT/packaging/linux/$file" "$PACKAGE_ROOT/$file"
done
install -m 0644 "$PROJECT_ROOT/packaging/linux/simtest.service" "$PACKAGE_ROOT/simtest.service"
install -m 0644 "$PROJECT_ROOT/packaging/linux/simtest.default" "$PACKAGE_ROOT/simtest.default"
install -m 0644 "$PROJECT_ROOT/packaging/linux/README-离线安装.md" "$PACKAGE_ROOT/README-离线安装.md"
printf '%s\n' "$DEB_ARCH" > "$PACKAGE_ROOT/.package-arch"
printf '%s\n' "$VERSION" > "$PACKAGE_ROOT/VERSION"

SOURCE_DB="$PROJECT_ROOT/data/simtest.sqlite"
TARGET_DB="$PACKAGE_ROOT/seed/simtest.sqlite"
if [[ -f "$SOURCE_DB" ]]; then
  echo "Creating a consistent SQLite snapshot..."
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$SOURCE_DB" ".backup '$TARGET_DB'"
  else
    SIMTEST_SOURCE_DB="$SOURCE_DB" SIMTEST_TARGET_DB="$TARGET_DB" node --input-type=module <<'NODE'
import {DatabaseSync,backup} from 'node:sqlite';
const source=new DatabaseSync(process.env.SIMTEST_SOURCE_DB,{readOnly:true});
await backup(source,process.env.SIMTEST_TARGET_DB);
source.close();
NODE
  fi
else
  SIMTEST_TARGET_DB="$TARGET_DB" node --input-type=module <<'NODE'
import {ModelStore} from './backend/model-store.mjs';
import {ActionStore} from './backend/action-store.mjs';
import {PlanStore} from './backend/plan-store.mjs';
const models=new ModelStore(process.env.SIMTEST_TARGET_DB);
new ActionStore(models.database);new PlanStore(models.database);models.close();
NODE
fi

(
  cd "$PACKAGE_ROOT"
  find . -type f ! -name manifest.sha256 | LC_ALL=C sort | while IFS= read -r file; do
    hash_file "$file"
  done > manifest.sha256
)

TAR_PATH="$OUTPUT_DIR/$PACKAGE_NAME.tar.gz"
COPYFILE_DISABLE=1 tar -czf "$TAR_PATH" -C "$WORK_DIR" "$PACKAGE_NAME"
(
  cd "$OUTPUT_DIR"
  hash_file "$(basename "$TAR_PATH")" > "$(basename "$TAR_PATH").sha256"
)

DEB_ROOT="$WORK_DIR/deb"
mkdir -p "$DEB_ROOT/DEBIAN" "$DEB_ROOT/opt/simtest" "$DEB_ROOT/usr/local/bin" \
  "$DEB_ROOT/lib/systemd/system" "$DEB_ROOT/etc/default" "$DEB_ROOT/usr/share/doc/simtest"
cp -R "$PACKAGE_ROOT/app" "$PACKAGE_ROOT/runtime" "$PACKAGE_ROOT/seed" "$DEB_ROOT/opt/simtest/"
install -m 0755 "$PACKAGE_ROOT/uninstall.sh" "$DEB_ROOT/opt/simtest/uninstall.sh"
install -m 0755 "$PACKAGE_ROOT/simtestctl" "$DEB_ROOT/usr/local/bin/simtestctl"
install -m 0644 "$PACKAGE_ROOT/simtest.service" "$DEB_ROOT/lib/systemd/system/simtest.service"
install -m 0644 "$PACKAGE_ROOT/simtest.default" "$DEB_ROOT/etc/default/simtest"
install -m 0644 "$PACKAGE_ROOT/README-离线安装.md" "$DEB_ROOT/usr/share/doc/simtest/README-离线安装.md"
INSTALLED_SIZE=$(du -sk "$DEB_ROOT" | awk '{print $1}')
sed -e "s/@VERSION@/$VERSION/g" -e "s/@DEB_ARCH@/$DEB_ARCH/g" -e "s/@INSTALLED_SIZE@/$INSTALLED_SIZE/g" \
  "$PROJECT_ROOT/packaging/linux/debian/control.in" > "$DEB_ROOT/DEBIAN/control"
for file in postinst prerm postrm; do
  install -m 0755 "$PROJECT_ROOT/packaging/linux/debian/$file" "$DEB_ROOT/DEBIAN/$file"
done
install -m 0644 "$PROJECT_ROOT/packaging/linux/debian/conffiles" "$DEB_ROOT/DEBIAN/conffiles"

DEB_PATH="$OUTPUT_DIR/simtest_${VERSION}_${DEB_ARCH}.deb"
if command -v dpkg-deb >/dev/null 2>&1; then
  dpkg-deb --root-owner-group --build "$DEB_ROOT" "$DEB_PATH"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker run --rm -v "$WORK_DIR:/work" -v "$OUTPUT_DIR:/output" ubuntu:22.04 \
    dpkg-deb --root-owner-group --build /work/deb "/output/$(basename "$DEB_PATH")"
else
  echo "dpkg-deb and a running Docker daemon were not found; tar.gz was built, .deb was skipped." >&2
  DEB_PATH=''
fi
if [[ -n "$DEB_PATH" ]]; then
  (
    cd "$OUTPUT_DIR"
    hash_file "$(basename "$DEB_PATH")" > "$(basename "$DEB_PATH").sha256"
  )
fi

rm -rf "$WORK_DIR"
echo "Built: $TAR_PATH"
[[ -n "$DEB_PATH" ]] && echo "Built: $DEB_PATH"
