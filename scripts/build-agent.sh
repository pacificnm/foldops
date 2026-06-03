#!/usr/bin/env bash
# Build FoldOps agent from repo root (fah-01..fah-04).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing dependencies…"
npm install

echo "Building agent…"
npm run build:agent

echo "Done. Output: apps/agent/dist/"
echo "Restart: systemctl restart foldops-agent"
