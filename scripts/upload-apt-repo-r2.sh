#!/usr/bin/env bash
# Upload packaging/apt-repo/ to Cloudflare R2 (S3-compatible API).
#
# Prerequisites:
#   - npm run build:debs && npm run build:apt-repo:signed
#   - rclone configured with an R2 remote, OR aws CLI with R2 credentials
#   - Public HTTPS: deb.folding-os.com (R2 custom domain)
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
#   npm run sync:apt-repo:r2
#   # or:
#   R2_REMOTE=r2 R2_BUCKET=foldops-apt ./scripts/upload-apt-repo-r2.sh
#   # optional prefix inside bucket:
#   R2_PREFIX=apt ./scripts/upload-apt-repo-r2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="${1:-$ROOT/packaging/apt-repo}"
R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:?Set R2_BUCKET to your R2 bucket name}"
R2_PREFIX="${R2_PREFIX:-}"

if [[ ! -f "$REPO_DIR/dists/stable/Release" && ! -f "$REPO_DIR/dists/stable/InRelease" ]]; then
  echo "error: $REPO_DIR missing — run ./scripts/build-apt-repo.sh or build-apt-repo-signed.sh first" >&2
  exit 1
fi

DEST="${R2_REMOTE}:${R2_BUCKET}"
if [[ -n "$R2_PREFIX" ]]; then
  DEST="${DEST}/${R2_PREFIX}"
fi

if command -v rclone >/dev/null 2>&1; then
  # Upload pool first, then package indices, then Release/InRelease last so apt never
  # sees a new Packages.gz paired with stale Release metadata (CDN "mirror sync" errors).
  META_CACHE="Cache-Control: public, max-age=60, must-revalidate"
  DEB_CACHE="Cache-Control: public, max-age=86400, immutable"

  echo "Syncing pool/ → $DEST"
  rclone sync "$REPO_DIR/pool" "$DEST/pool" --progress \
    --header-upload "$DEB_CACHE"

  SUITE_DIR="$REPO_DIR/dists/stable"
  if [[ -d "$SUITE_DIR/main" ]]; then
    echo "Syncing dists/stable/main/ → $DEST"
    rclone sync "$SUITE_DIR/main" "$DEST/dists/stable/main" --progress \
      --header-upload "$META_CACHE"
  fi

  for meta in Release Release.gpg InRelease; do
    if [[ -f "$SUITE_DIR/$meta" ]]; then
      echo "Publishing dists/stable/$meta"
      rclone copyto "$SUITE_DIR/$meta" "$DEST/dists/stable/$meta" --progress \
        --header-upload "$META_CACHE"
    fi
  done

  if [[ -f "$REPO_DIR/foldops-archive-keyring.gpg" ]]; then
    rclone copyto "$REPO_DIR/foldops-archive-keyring.gpg" "$DEST/foldops-archive-keyring.gpg" --progress \
      --header-upload "$META_CACHE"
  fi

  echo "Done. Purge Cloudflare cache for your apt domain after upload if apt still reports hash/size mismatches."
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
