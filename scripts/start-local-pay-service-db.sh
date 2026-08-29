#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAY_DIR="$ROOT_DIR/zhisales-pay-service"
ENV_FILE="$PAY_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-25432}"
DB_NAME="${DB_NAME:-zhisales_pay}"
DB_USER="${DB_USER:-sub2api}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_SSL="${DB_SSL:-false}"
DB_SSL_REJECT_UNAUTHORIZED="${DB_SSL_REJECT_UNAUTHORIZED:-true}"
PORT="${PORT:-18195}"
SUB2API_BASE_URL="${SUB2API_BASE_URL:-https://ai.zhisales.com}"
PAY_CATALOG_PATH="${PAY_CATALOG_PATH:-$PAY_DIR/catalog.json}"
DB_WAIT_SECONDS="${DB_WAIT_SECONDS:-30}"

echo "[zhisales-pay-service-local] database: ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "[zhisales-pay-service-local] service port: ${PORT}"

if [[ "$DB_PASSWORD" == "你的PostgreSQL密码" ]]; then
  echo "[zhisales-pay-service-local] ERROR: DB_PASSWORD 在 .env 中仍是占位值，请先填真实密码。"
  exit 1
fi

for ((i = 1; i <= DB_WAIT_SECONDS; i++)); do
  if (timeout 1 bash -c "cat < /dev/null > /dev/tcp/${DB_HOST}/${DB_PORT}") 2>/dev/null; then
    echo "[zhisales-pay-service-local] DB 已可连接"
    break
  fi
  echo "[zhisales-pay-service-local] DB 未就绪 (${i}/${DB_WAIT_SECONDS})"
  sleep 1
  if ((i == DB_WAIT_SECONDS)); then
    echo "[zhisales-pay-service-local] ERROR: 30 秒内未连接到数据库 ${DB_HOST}:${DB_PORT}"
    exit 1
  fi
done

cd "$PAY_DIR"
exec env \
  DB_HOST="$DB_HOST" \
  DB_PORT="$DB_PORT" \
  DB_NAME="$DB_NAME" \
  DB_USER="$DB_USER" \
  DB_PASSWORD="$DB_PASSWORD" \
  DB_SSL="$DB_SSL" \
  DB_SSL_REJECT_UNAUTHORIZED="$DB_SSL_REJECT_UNAUTHORIZED" \
  PORT="$PORT" \
  SUB2API_BASE_URL="$SUB2API_BASE_URL" \
  PAY_CATALOG_PATH="$PAY_CATALOG_PATH" \
  npm start
