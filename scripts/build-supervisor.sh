#!/usr/bin/env bash
# Build supervisor + web dashboard from repo root.
# Ensures devDependencies are installed even when NODE_ENV=production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing dependencies (including dev, for TypeScript tooling)…"
npm install --include=dev

if ! test -x node_modules/vite/bin/vite.js && ! test -f node_modules/.bin/vite; then
  echo "error: vite not installed — run 'npm install' from $(pwd)" >&2
  exit 1
fi

echo "Building supervisor stack…"
npm run build:supervisor

echo "Done. Start with: npm run start -w @foldops/supervisor"
