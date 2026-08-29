#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAY_DIR="$ROOT_DIR/zhisales-pay-service"
SOURCE_ENV="${SOURCE_ENV:-$PAY_DIR/.env.canary}"
TARGET_ENV="${TARGET_ENV:-$PAY_DIR/.env}"

if [[ ! -f "$SOURCE_ENV" ]]; then
  echo "[sync-env] ERROR: source env not found: $SOURCE_ENV"
  exit 1
fi

if [[ ! -f "$TARGET_ENV" ]]; then
  echo "[sync-env] ERROR: target env not found: $TARGET_ENV"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$SOURCE_ENV"
set +a

TS="$(date +%Y%m%d_%H%M%S)"
cp "$TARGET_ENV" "$TARGET_ENV.bak.$TS"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-zhisales_pay}"
DB_USER="${DB_USER:-sub2api}"
DB_PASSWORD="${DB_PASSWORD:-你的PostgreSQL密码}"
DB_SSL="${DB_SSL:-false}"
DB_SSL_REJECT_UNAUTHORIZED="${DB_SSL_REJECT_UNAUTHORIZED:-true}"

TMP_FILE="$(mktemp)"
awk -v db_host="$DB_HOST" \
  -v db_port="$DB_PORT" \
  -v db_name="$DB_NAME" \
  -v db_user="$DB_USER" \
  -v db_password="$DB_PASSWORD" \
  -v db_ssl="$DB_SSL" \
  -v db_ssl_reject="$DB_SSL_REJECT_UNAUTHORIZED" '
BEGIN { seen_host=seen_port=seen_name=seen_user=seen_pwd=seen_ssl=seen_ssl_reject=0 }
/^DB_HOST=/       {print "DB_HOST="db_host; seen_host=1; next}
/^DB_PORT=/       {print "DB_PORT="db_port; seen_port=1; next}
/^DB_NAME=/       {print "DB_NAME="db_name; seen_name=1; next}
/^DB_USER=/       {print "DB_USER="db_user; seen_user=1; next}
/^DB_PASSWORD=/   {print "DB_PASSWORD="db_password; seen_pwd=1; next}
/^DB_SSL=/        {print "DB_SSL="db_ssl; seen_ssl=1; next}
/^DB_SSL_REJECT_UNAUTHORIZED=/ {print "DB_SSL_REJECT_UNAUTHORIZED="db_ssl_reject; seen_ssl_reject=1; next}
{ print }
END {
  if (!seen_host) print "DB_HOST="db_host;
  if (!seen_port) print "DB_PORT="db_port;
  if (!seen_name) print "DB_NAME="db_name;
  if (!seen_user) print "DB_USER="db_user;
  if (!seen_pwd) print "DB_PASSWORD="db_password;
  if (!seen_ssl) print "DB_SSL="db_ssl;
  if (!seen_ssl_reject) print "DB_SSL_REJECT_UNAUTHORIZED="db_ssl_reject;
}
' "$TARGET_ENV" > "$TMP_FILE"

mv "$TMP_FILE" "$TARGET_ENV"

echo "[sync-env] done: updated DB config to $(basename "$TARGET_ENV") using $(basename "$SOURCE_ENV")"
echo "[sync-env] backup: $TARGET_ENV.bak.$TS"
