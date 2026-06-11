#!/usr/bin/env bash
# Vendor Cargo dependencies for offline Buildroot builds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found — install Rust (see docs/installation.md)" >&2
  exit 1
fi

echo "Vendoring workspace dependencies into vendor/ …"
cargo vendor vendor/

mkdir -p .cargo
cat > .cargo/config.toml <<'EOF'
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
EOF

echo "Done."
echo "  vendor/          — commit or ship in release tarball"
echo "  .cargo/config.toml — offline cargo config (gitignored if regenerated locally)"
