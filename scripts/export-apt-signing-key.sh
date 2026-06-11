#!/usr/bin/env bash
# Print the apt repo public key for farm nodes (from gpg.key / foldops-archive-keyring.gpg).
#
# On a node:
#   curl -fsSL https://deb.folding-os.com/foldops-archive-keyring.gpg \
#     | sudo gpg --dearmor -o /usr/share/keyrings/foldops.gpg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=foldops-apt-signing-key.sh
source "$ROOT/scripts/foldops-apt-signing-key.sh"

if PUBKEY="$(foldops_public_key_file)"; then
  cat "$PUBKEY"
  exit 0
fi

gpg --armor --export "$APT_SIGNING_KEY"
