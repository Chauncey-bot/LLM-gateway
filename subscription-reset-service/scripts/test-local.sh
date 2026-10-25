#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
reset_test_container="subscription-reset-tests-$$"
reset_test_redis="subscription-reset-redis-tests-$$"
cleanup() { docker rm -fv "$reset_test_container" "$reset_test_redis" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$reset_test_container" -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1::5432 postgres:18-alpine >/dev/null
docker run -d --name "$reset_test_redis" -p 127.0.0.1::6379 redis:7-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$reset_test_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$reset_test_container" pg_isready -U postgres >/dev/null
reset_test_port="$(docker port "$reset_test_container" 5432/tcp | sed 's/.*://')"
reset_test_redis_port="$(docker port "$reset_test_redis" 6379/tcp | sed 's/.*://')"
ADMIN_RESET_TEST_DSN="postgres://postgres@127.0.0.1:${reset_test_port}/postgres?sslmode=disable" \
  RESET_REDIS_TEST_URL="redis://127.0.0.1:${reset_test_redis_port}" npm test
