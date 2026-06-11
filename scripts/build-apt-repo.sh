#!/usr/bin/env bash
# Build a static apt repository from target/debian/*.deb (upload to R2, nginx, etc.).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEB_DIR="${1:-$ROOT/target/debian}"
REPO_DIR="${2:-$ROOT/packaging/apt-repo}"
SUITE="${APT_SUITE:-stable}"
COMPONENT="${APT_COMPONENT:-main}"

if ! command -v apt-ftparchive >/dev/null 2>&1; then
  echo "error: apt-ftparchive not found — install apt-utils (sudo apt install apt-utils)" >&2
  exit 1
fi

shopt -s nullglob
debs=("$DEB_DIR"/*.deb)
if [[ ${#debs[@]} -eq 0 ]]; then
  echo "error: no .deb files in $DEB_DIR — run ./scripts/build-debs.sh first" >&2
  exit 1
fi

echo "Building apt repo at $REPO_DIR"
rm -rf "$REPO_DIR"
mkdir -p "$REPO_DIR/pool/$COMPONENT"
cp "${debs[@]}" "$REPO_DIR/pool/$COMPONENT/"

cd "$REPO_DIR"

for arch in amd64 all; do
  mkdir -p "dists/$SUITE/$COMPONENT/binary-$arch"
  apt-ftparchive \
    -o "APT::FTPArchive::Packages::Architecture=$arch" \
    packages "pool/$COMPONENT" \
    > "dists/$SUITE/$COMPONENT/binary-$arch/Packages"
  gzip -9 -k -f "dists/$SUITE/$COMPONENT/binary-$arch/Packages"
done

apt-ftparchive \
  -o "APT::FTPArchive::Release::Architectures=amd64 all" \
  release "dists/$SUITE" \
  > "dists/$SUITE/Release"
gzip -9 -k -f "dists/$SUITE/Release"

echo ""
echo "Apt repo ready:"
find dists pool -type f | sort
echo ""
echo "Upload entire directory to your mirror (e.g. Cloudflare R2):"
echo "  rclone sync $REPO_DIR/ r2:YOUR_BUCKET/foldops-apt/ --progress"
echo ""
echo "On farm nodes (/etc/apt/sources.list.d/foldops.list):"
echo "  deb [trusted=yes] https://YOUR_R2_PUBLIC_DOMAIN $SUITE $COMPONENT"
