#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/referral-rewards-service"

IMAGE_NAME="${IMAGE_NAME:-referral-rewards-service:canary}"
CANARY_PORT="${CANARY_PORT:-18196}"
CANARY_NETWORK="${CANARY_NETWORK:-sub2api_sub2api-network}"
CANARY_CATALOG_FILE="${CANARY_CATALOG_FILE:-./referral-catalog.json}"
CATALOG_SOURCE="${CATALOG_SOURCE:-$ROOT_DIR/zhisales-pay-service/catalog.json}"
ARCHIVE="${ARCHIVE:-/tmp/referral-rewards-service-canary.image.tar.gz}"
BASE_COMPOSE_FILE="$SERVICE_DIR/docker-compose.yml"
CANARY_COMPOSE_FILE="$SERVICE_DIR/docker-compose.canary.yml"
ENV_FILE="${ENV_FILE:-$SERVICE_DIR/.env.canary}"

: "${PROD_HOST:?Please export PROD_HOST, e.g. PROD_HOST=18.143.67.94}"
: "${PROD_USER:=ubuntu}"
: "${PROD_KEY:?Please export PROD_KEY=path/to/ssh-private-key}"
: "${PROD_DEPLOY_DIR:=/opt/sub2api-canary/referral-rewards-service}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[err] docker not found on local build host" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1 || ! command -v ssh >/dev/null 2>&1; then
  echo "[err] ssh/scp are required on local host" >&2
  exit 1
fi

if [[ ! -f "$BASE_COMPOSE_FILE" || ! -f "$CANARY_COMPOSE_FILE" ]]; then
  echo "[err] compose files missing in $SERVICE_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[err] canary env file not found: $ENV_FILE" >&2
  echo "Copy .env.canary.example to .env.canary and fill secrets first." >&2
  exit 1
fi

if [[ ! -f "$CATALOG_SOURCE" ]]; then
  echo "[err] catalog source missing: $CATALOG_SOURCE" >&2
  echo "Copy the payment catalog path to $CATALOG_SOURCE." >&2
  exit 1
fi

if ! command -v docker compose >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    echo "[err] docker compose command not found." >&2
    exit 1
  fi
else
  COMPOSE_CMD="docker compose"
fi

archive_name="$(basename "$ARCHIVE")"

echo "[1/7] Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" "$SERVICE_DIR"

echo "[2/7] Export image"
docker save "$IMAGE_NAME" | gzip > "$ARCHIVE"

echo "[3/7] Upload compose/env/image/catalog"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$ARCHIVE" "$PROD_USER@$PROD_HOST:/tmp/$archive_name"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$BASE_COMPOSE_FILE" "$PROD_USER@$PROD_HOST:$PROD_DEPLOY_DIR/docker-compose.yml"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$CANARY_COMPOSE_FILE" "$PROD_USER@$PROD_HOST:$PROD_DEPLOY_DIR/docker-compose.canary.yml"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$ENV_FILE" "$PROD_USER@$PROD_HOST:$PROD_DEPLOY_DIR/.env.canary"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$CATALOG_SOURCE" "$PROD_USER@$PROD_HOST:$PROD_DEPLOY_DIR/$CANARY_CATALOG_FILE"

echo "[4/7] Start canary service"
ssh -i "$PROD_KEY" -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" "
  set -e
  mkdir -p '$PROD_DEPLOY_DIR'
  cd '$PROD_DEPLOY_DIR'
  docker load -i '/tmp/$archive_name'
  CANARY_PORT='$CANARY_PORT' CANARY_NETWORK='$CANARY_NETWORK' CANARY_CATALOG_FILE='$CANARY_CATALOG_FILE' $COMPOSE_CMD -f docker-compose.yml -f docker-compose.canary.yml up -d --force-recreate referral-rewards-canary
  docker image prune -f
  rm -f '/tmp/$archive_name'
"

echo "[5/7] Health check"
ssh -i "$PROD_KEY" -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" "curl -fsS http://127.0.0.1:${CANARY_PORT}/health"

echo "Done. rewards canary is running at http://127.0.0.1:${CANARY_PORT}"
