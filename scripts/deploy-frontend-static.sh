#!/usr/bin/env bash

# Deploy the complete Vite output as one bundle.  Deploying only index.html or
# individual chunks can leave the live entrypoint referring to missing hashed
# modules, which makes the SPA render a blank page.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${FRONTEND_DIST_DIR:-$root_dir/backend/internal/web/dist}"
deploy_host="${DEPLOY_HOST:-18.143.67.94}"
deploy_user="${DEPLOY_USER:-ubuntu}"
deploy_path="${DEPLOY_PATH:-/var/www/zhisales-site}"
ssh_key="${SSH_PRIVATE_KEY:-}"

if [[ -z "$ssh_key" ]]; then
  echo "SSH_PRIVATE_KEY must point to the production SSH private key." >&2
  exit 1
fi

if [[ ! -f "$source_dir/index.html" || ! -d "$source_dir/assets" ]]; then
  echo "Frontend build output not found: $source_dir" >&2
  echo "Run the frontend build before deploying." >&2
  exit 1
fi

ssh_options=(-i "$ssh_key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no)
remote="$deploy_user@$deploy_host"

# Do not delete the target directory: it may contain separately deployed
# assets. This overwrites every file from the current frontend build together.
tar -C "$source_dir" -czf - . | ssh "${ssh_options[@]}" "$remote" \
  "sudo -n tar -xzf - -C '$deploy_path'"

# Make a missing asset a deploy failure instead of discovering it in users'
# browsers after the release.
missing_files="$(
  comm -23 \
    <(cd "$source_dir" && find . -type f -print | sort) \
    <(ssh "${ssh_options[@]}" "$remote" "cd '$deploy_path' && find . -type f -print | sort")
)"

if [[ -n "$missing_files" ]]; then
  echo "Deployment incomplete; missing files:" >&2
  printf '%s\n' "$missing_files" >&2
  exit 1
fi

echo "Frontend static bundle deployed and verified: $source_dir -> $remote:$deploy_path"
