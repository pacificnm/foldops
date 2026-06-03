#!/usr/bin/env bash
# Pull latest FoldOps and rebuild the agent (no service restart — HTTP handler restarts).
set -euo pipefail

ROOT="${FOLDOPS_ROOT:-/opt/foldops}"
cd "$ROOT"

echo "==> git pull"
git pull --ff-only

echo "==> npm install"
npm install

echo "==> npm run build:agent"
npm run build:agent

echo "==> agent build complete"
