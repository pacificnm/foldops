#!/usr/bin/env bash
# Build Rust binaries + web dashboard and stage Folding-OS release artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')}"
STAGING="$ROOT/packaging/staging/foldops-$VERSION-rootfs"
ARCHIVE="$ROOT/packaging/staging/foldops-${VERSION}-rootfs.tar.xz"
SRC_BUNDLE="$ROOT/packaging/staging/foldops-${VERSION}-src.tar.xz"
TMP_SRC="$ROOT/packaging/staging/foldops-src-$VERSION"

echo "FoldOps Folding-OS artifacts — version $VERSION"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found" >&2
  exit 1
fi

echo "Building React dashboard …"
npm run build:web

echo "Building Rust release binaries …"
cargo build --release -p foldops-agent -p foldops-supervisor

if [[ ! -f apps/supervisor/web/dist/index.html ]]; then
  echo "error: web dist missing after build" >&2
  exit 1
fi

rm -rf "$STAGING"
mkdir -p "$STAGING"

echo "Staging rootfs layout …"
install -D -m 0755 target/release/foldops-agent "$STAGING/usr/bin/foldops-agent"
install -D -m 0755 target/release/foldops-supervisor "$STAGING/usr/bin/foldops-supervisor"
install -D -m 0644 systemd/rust/foldops-agent.service "$STAGING/usr/lib/systemd/system/foldops-agent.service"
install -D -m 0644 systemd/rust/foldops-supervisor.service "$STAGING/usr/lib/systemd/system/foldops-supervisor.service"
install -D -m 0644 packaging/folding-os/env/agent.env.example "$STAGING/etc/foldops/agent.env.example"
install -D -m 0644 packaging/folding-os/env/supervisor.env.example "$STAGING/etc/foldops/supervisor.env.example"
install -D -m 0644 packaging/folding-os/sysusers.d/foldops.conf "$STAGING/usr/lib/sysusers.d/foldops.conf"
install -D -m 0644 packaging/folding-os/tmpfiles.d/foldops.conf "$STAGING/usr/lib/tmpfiles.d/foldops.conf"
mkdir -p "$STAGING/usr/share/foldops/web"
cp -a apps/supervisor/web/dist/. "$STAGING/usr/share/foldops/web/"

mkdir -p "$(dirname "$ARCHIVE")"
tar -c -C "$STAGING" . | xz -9 > "$ARCHIVE"

echo "Creating source bundle (git tree + web dist + optional vendor/) …"
rm -rf "$TMP_SRC"
mkdir -p "$TMP_SRC"
git archive HEAD | tar -x -C "$TMP_SRC"
mkdir -p "$TMP_SRC/apps/supervisor/web/dist"
cp -a apps/supervisor/web/dist/. "$TMP_SRC/apps/supervisor/web/dist/"
if [[ -d vendor && -f .cargo/config.toml ]]; then
  cp -a vendor "$TMP_SRC/vendor"
  mkdir -p "$TMP_SRC/.cargo"
  cp .cargo/config.toml "$TMP_SRC/.cargo/config.toml"
fi
tar -c -C "$ROOT/packaging/staging" "foldops-src-$VERSION" | xz -9 > "$SRC_BUNDLE"
rm -rf "$TMP_SRC"

echo ""
echo "Artifacts:"
echo "  Staged rootfs:  $STAGING"
echo "  Rootfs tarball: $ARCHIVE"
echo "  Source bundle:  $SRC_BUNDLE"
echo ""
echo "Next: git tag v$VERSION && git push origin v$VERSION"
