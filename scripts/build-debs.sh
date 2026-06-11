#!/usr/bin/env bash
# Build foldops-agent, foldops-web, and foldops-supervisor .deb packages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')}"
DEB_OUT="$ROOT/target/debian"
WEB_STAGING="$ROOT/packaging/deb/staging/foldops-web"

echo "FoldOps .deb build — version $VERSION"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found" >&2
  exit 1
fi

if ! cargo deb --version >/dev/null 2>&1; then
  echo "Installing cargo-deb …"
  cargo install cargo-deb --locked
fi

echo "Building React dashboard …"
npm run build:web

if [[ ! -f apps/supervisor/web/dist/index.html ]]; then
  echo "error: apps/supervisor/web/dist missing" >&2
  exit 1
fi

echo "Building Rust release binaries …"
cargo build --release -p foldops-agent -p foldops-supervisor

echo "Building foldops-web_${VERSION}_all.deb …"
rm -rf "$WEB_STAGING"
mkdir -p "$WEB_STAGING/DEBIAN" "$WEB_STAGING/usr/share/foldops/web"
cp -a apps/supervisor/web/dist/. "$WEB_STAGING/usr/share/foldops/web/"
cat > "$WEB_STAGING/DEBIAN/control" <<EOF
Package: foldops-web
Version: ${VERSION}
Architecture: all
Maintainer: Pacific NM <foldops@pacificnm.com>
Description: FoldOps React dashboard static assets
 Static web UI served by foldops-supervisor (WEB_ROOT=/usr/share/foldops/web).
Section: web
Priority: optional
EOF
mkdir -p "$DEB_OUT"
dpkg-deb --build "$WEB_STAGING" "$DEB_OUT/foldops-web_${VERSION}_all.deb"

echo "Building foldops-agent .deb …"
cargo deb -p foldops-agent -q

echo "Building foldops-supervisor .deb …"
cargo deb -p foldops-supervisor -q

echo ""
echo "Packages in $DEB_OUT:"
ls -1 "$DEB_OUT"/*.deb
echo ""
echo "Install on a Debian/Folding-OS node (after configuring apt — see packaging/deb/README.md):"
echo "  sudo apt install ./foldops-web_${VERSION}_all.deb ./foldops-agent_${VERSION}-1_*.deb"
echo "  sudo apt install ./foldops-supervisor_${VERSION}-1_*.deb   # supervisor node"
echo ""
echo "Upgrade without OS redeploy:"
echo "  sudo apt update && sudo apt install --only-upgrade foldops-agent foldops-supervisor foldops-web"
