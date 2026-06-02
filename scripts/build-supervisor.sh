#!/usr/bin/env bash
# Build supervisor + web dashboard from repo root.
# Ensures devDependencies are installed even when NODE_ENV=production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing dependencies (including dev, for TypeScript tooling)…"
npm install --include=dev

echo "Building supervisor stack…"
npm run build:supervisor

echo "Done. Start with: npm run start -w @foldops/supervisor"
