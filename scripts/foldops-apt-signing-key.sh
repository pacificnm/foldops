#!/usr/bin/env bash
# Shared defaults for FoldingOS apt repo signing.
# Public key: packaging/deb/foldops-archive-keyring.gpg (also gpg.key at repo root)
# Key id: 8BC95492 — FoldingOS Package Signing <security@folding-os.com>
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$_SCRIPT_DIR/.." && pwd)"

# Official FoldingOS repository signing key (public).
FOLDOPS_APT_KEY_ID="${FOLDOPS_APT_KEY_ID:-8BC95492}"
FOLDOPS_APT_KEY_FPR="${FOLDOPS_APT_KEY_FPR:-42E02FBEF6C5B7E8983D4EEECC57F8008BC95492}"

if [[ -f "$ROOT/packaging/deb/signing-key.env" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/packaging/deb/signing-key.env"
fi

APT_SIGNING_KEY="${APT_SIGNING_KEY:-$FOLDOPS_APT_KEY_ID}"

foldops_public_key_file() {
  if [[ -f "$ROOT/packaging/deb/foldops-archive-keyring.gpg" ]]; then
    echo "$ROOT/packaging/deb/foldops-archive-keyring.gpg"
  elif [[ -f "$ROOT/gpg.key" ]]; then
    echo "$ROOT/gpg.key"
  else
    return 1
  fi
}

export ROOT FOLDOPS_APT_KEY_ID FOLDOPS_APT_KEY_FPR APT_SIGNING_KEY
