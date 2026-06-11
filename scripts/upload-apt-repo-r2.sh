#!/usr/bin/env bash
# Upload packaging/apt-repo/ to Cloudflare R2 (S3-compatible API).
#
# Prerequisites:
#   - ./scripts/build-debs.sh && ./scripts/build-apt-repo.sh
#   - rclone configured with an R2 remote, OR aws CLI with R2 credentials
#
# rclone example (~/.config/rclone/rclone.conf):
#   [r2]
#   type = s3
#   provider = Cloudflare
#   access_key_id = ...
#   secret_access_key = ...
#   endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
#   acl = private
#
# Usage:
#   R2_REMOTE=r2 R2_BUCKET=foldops-apt ./scripts/upload-apt-repo-r2.sh
#   # optional prefix inside bucket:
#   R2_PREFIX=apt ./scripts/upload-apt-repo-r2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="${1:-$ROOT/packaging/apt-repo}"
R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:?Set R2_BUCKET to your R2 bucket name}"
R2_PREFIX="${R2_PREFIX:-}"

if [[ ! -f "$REPO_DIR/dists/stable/Release" ]]; then
  echo "error: $REPO_DIR missing — run ./scripts/build-apt-repo.sh first" >&2
  exit 1
fi

DEST="${R2_REMOTE}:${R2_BUCKET}"
if [[ -n "$R2_PREFIX" ]]; then
  DEST="${DEST}/${R2_PREFIX}"
fi

if command -v rclone >/dev/null 2>&1; then
  echo "Syncing $REPO_DIR → $DEST"
  rclone sync "$REPO_DIR/" "$DEST/" --progress \
    --header-upload "Cache-Control: public, max-age=120"
  echo "Done. Ensure the bucket (or prefix) is public via R2 custom domain or public bucket policy."
  exit 0
fi

if command -v aws >/dev/null 2>&1 && [[ -n "${R2_ENDPOINT:-}" ]]; then
  echo "Syncing with aws cli → s3://${R2_BUCKET}/${R2_PREFIX}"
  aws s3 sync "$REPO_DIR/" "s3://${R2_BUCKET}/${R2_PREFIX}" \
    --endpoint-url "$R2_ENDPOINT" \
    --cache-control "public, max-age=120"
  exit 0
fi

echo "error: install rclone, or set R2_ENDPOINT and use aws cli" >&2
exit 1
