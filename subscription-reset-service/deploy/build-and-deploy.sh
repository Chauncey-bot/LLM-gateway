#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-subscription-reset-service:latest}"
ARCHIVE="${ARCHIVE:-/tmp/subscription-reset-service.image.tar.gz}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[err] env file not found: $ENV_FILE"
  echo "Run: cp .env.example .env and fill credentials first"
  exit 1
fi

: "${PROD_HOST:?Please export PROD_HOST, e.g. PROD_HOST=18.143.67.94}"
: "${PROD_USER:=ubuntu}"
: "${PROD_KEY:?Please export PROD_KEY=path/to/ssh-key}"
: "${PROD_DEPLOY_DIR:=/opt/subscription-reset-service}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[err] docker not found. Build host requires Docker installed."
  exit 1
fi

function resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return 0
  fi

  return 1
}

COMPOSE_CMD="$(resolve_compose_cmd || true)"
if [[ -z "$COMPOSE_CMD" ]]; then
  echo "[err] docker compose command not found."
  echo "Install Docker Compose plugin (Docker Desktop), or install docker-compose package."
  exit 1
fi

ARCHIVE_BASENAME="$(basename "$ARCHIVE")"

echo "[1/5] Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR/.."

echo "[2/5] Export image archive: $ARCHIVE"
docker save "$IMAGE_NAME" | gzip > "$ARCHIVE"

echo "[3/5] Upload compose + env + image"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$ARCHIVE" "$PROD_USER@$PROD_HOST:/tmp/$ARCHIVE_BASENAME"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$COMPOSE_FILE" "$PROD_USER@$PROD_HOST:$PROD_DEPLOY_DIR/docker-compose.yml"
scp -i "$PROD_KEY" -o StrictHostKeyChecking=no "$ENV_FILE" "$PROD_USER@$PROD_HOST:$PROD_DEPLOY_DIR/.env"

echo "[4/5] Load image and restart on production"
ssh -i "$PROD_KEY" -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" "
  set -e
  mkdir -p \"$PROD_DEPLOY_DIR\"
  cd \"$PROD_DEPLOY_DIR\"
  docker load -i /tmp/$ARCHIVE_BASENAME
  $COMPOSE_CMD up -d --force-recreate
  docker image prune -f
"

echo "[5/5] Production health check"
ssh -i "$PROD_KEY" -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" "
  sleep 2
  curl -fsS http://127.0.0.1:18192/health
"

echo "Done."
