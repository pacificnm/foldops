#!/usr/bin/env bash
# Build a GPG-signed apt repository using reprepro (correct layout for apt [signed-by=...]).
#
# Prereqs:
#   sudo apt install reprepro gnupg
#   gpg --full-generate-key   # if you do not have a signing key yet
#   export APT_SIGNING_KEY=$(gpg --list-secret-keys --keyid-format long | awk '/^sec/ {print $2}' | head -1 | cut -d/ -f2)
#
# Usage:
#   ./scripts/build-debs.sh
#   APT_SIGNING_KEY=ABCD1234 ./scripts/build-apt-repo-signed.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=foldops-apt-signing-key.sh
source "$ROOT/scripts/foldops-apt-signing-key.sh"

DEB_DIR="${1:-$ROOT/target/debian}"
REPO_DIR="${2:-$ROOT/packaging/apt-repo}"
SUITE="${APT_SUITE:-stable}"
COMPONENT="${APT_COMPONENT:-main}"

if ! command -v reprepro >/dev/null 2>&1; then
  echo "error: reprepro not found — sudo apt install reprepro" >&2
  exit 1
fi

if ! gpg --list-secret-keys "$APT_SIGNING_KEY" >/dev/null 2>&1; then
  echo "error: secret key $APT_SIGNING_KEY not in gpg keyring — import your private key to sign" >&2
  echo "  Public key for nodes: packaging/deb/foldops-archive-keyring.gpg" >&2
  exit 1
fi

shopt -s nullglob
debs=("$DEB_DIR"/*.deb)
if [[ ${#debs[@]} -eq 0 ]]; then
  echo "error: no .deb files in $DEB_DIR — run ./scripts/build-debs.sh first" >&2
  exit 1
fi

echo "Building signed apt repo at $REPO_DIR (key $APT_SIGNING_KEY)"

# Fresh reprepro database — do not mix with apt-ftparchive output from build-apt-repo.sh
rm -rf "$REPO_DIR"
mkdir -p "$REPO_DIR/conf"

cat > "$REPO_DIR/conf/distributions" <<EOF
Origin: FoldOps
Label: FoldOps
Suite: ${SUITE}
Codename: ${SUITE}
Architectures: amd64
Components: ${COMPONENT}
Description: FoldOps farm monitor packages
SignWith: ${APT_SIGNING_KEY}
EOF

for deb in "${debs[@]}"; do
  echo "  includedeb ${SUITE} $(basename "$deb")"
  reprepro -b "$REPO_DIR" includedeb "$SUITE" "$deb"
done

reprepro -b "$REPO_DIR" export "$SUITE"

PUBKEY="$(foldops_public_key_file || true)"
if [[ -n "$PUBKEY" ]]; then
  cp "$PUBKEY" "$REPO_DIR/foldops-archive-keyring.gpg"
fi

echo ""
echo "Signed repo layout (upload dists/ + pool/ to R2 — not db/ or conf/):"
find "$REPO_DIR/dists" "$REPO_DIR/pool" -type f 2>/dev/null | sort
[[ -f "$REPO_DIR/foldops-archive-keyring.gpg" ]] && echo "$REPO_DIR/foldops-archive-keyring.gpg"
echo ""
echo "Public key for farm nodes: packaging/deb/foldops-archive-keyring.gpg"
echo ""
echo "Farm node /etc/apt/sources.list.d/foldops.list:"
echo "  deb [signed-by=/usr/share/keyrings/foldops.gpg] https://deb.folding-os.com ${SUITE} ${COMPONENT}"
