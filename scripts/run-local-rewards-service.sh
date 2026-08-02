#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REWARDS_DIR="$ROOT_DIR/referral-rewards-service"

set -a
source "$REWARDS_DIR/.env.canary"
set +a

cd "$REWARDS_DIR"
exec env \
  DB_HOST=127.0.0.1 \
  DB_PORT=25432 \
  PORT=18196 \
  SUB2API_BASE_URL="${LOCAL_SUB2API_BASE_URL:-https://ai.zhisales.com}" \
  /opt/homebrew/bin/npm start
