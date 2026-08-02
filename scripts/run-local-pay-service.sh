#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAY_DIR="$ROOT_DIR/zhisales-pay-service"

set -a
source "$PAY_DIR/.env.canary"
set +a

cd "$PAY_DIR"
exec env \
  DB_HOST=127.0.0.1 \
  DB_PORT=25432 \
  PORT=18195 \
  SUB2API_BASE_URL="${LOCAL_SUB2API_BASE_URL:-https://ai.zhisales.com}" \
  PAY_CATALOG_PATH="$PAY_DIR/catalog.json" \
  /opt/homebrew/bin/npm start
