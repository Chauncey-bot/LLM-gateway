#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAY_DIR="$ROOT_DIR/zhisales-pay-service"
REWARDS_DIR="$ROOT_DIR/referral-rewards-service"
BACKUP_DIR="/tmp/zhisales-localtest-backup"
CANARY_LOCAL_ENV="${SCRIPT_DIR}/local-canary.env"

if [[ -f "$CANARY_LOCAL_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CANARY_LOCAL_ENV"
  set +a
fi

REMOTE_HOST="${REMOTE_HOST:-18.143.67.94}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_KEY="${REMOTE_KEY:-/Users/chauncey/Downloads/sg.pem}"
REMOTE_DB_HOST="${REMOTE_DB_HOST:-$REMOTE_HOST}"
REMOTE_DB_TUNNEL_HOST="${REMOTE_DB_TUNNEL_HOST:-$REMOTE_DB_HOST}"
REMOTE_SSH_PORT="${REMOTE_SSH_PORT:-22}"
REMOTE_DB_CONTAINER="${REMOTE_DB_CONTAINER:-sub2api-postgres}"
REMOTE_DB_PORT="${REMOTE_DB_PORT:-5432}"
DB_TUNNEL_LOCAL_PORT="${DB_TUNNEL_LOCAL_PORT:-25432}"
REMOTE_DB_USE_PUBLIC_IP="${REMOTE_DB_USE_PUBLIC_IP:-0}"
BASTION_ONLY="${BASTION_ONLY:-1}"

PAY_PORT="${PAY_PORT:-18195}"
REWARDS_PORT="${REWARDS_PORT:-18196}"
SUB2API_BASE_URL="${SUB2API_BASE_URL:-https://ai.zhisales.com}"

SYNC_REMOTE_ENV="${SYNC_REMOTE_ENV:-0}"

PAY_LOG="${PAY_LOG:-/tmp/zhisales-pay-local.log}"
REWARDS_LOG="${REWARDS_LOG:-/tmp/zhisales-rewards-local.log}"
TUNNEL_LOG="${TUNNEL_LOG:-/tmp/zhisales-db-tunnel.log}"

PAY_PID_FILE="/tmp/zhisales-pay-local.pid"
REWARDS_PID_FILE="/tmp/zhisales-rewards-local.pid"
TUNNEL_PID_FILE="/tmp/zhisales-db-tunnel.pid"

if [[ ! -x "$(command -v node || true)" ]]; then
  echo "[err] node not found"
  exit 1
fi

if [[ "$BASTION_ONLY" == "1" ]]; then
  REMOTE_DB_USE_PUBLIC_IP="0"
fi

mkdir -p "$BACKUP_DIR"
ts="$(date +%Y%m%d_%H%M%S)"
if [[ -f "$PAY_DIR/.env.canary" ]]; then
  cp "$PAY_DIR/.env.canary" "$BACKUP_DIR/zhisales-pay-canary.env.$ts.bak"
fi
if [[ -f "$REWARDS_DIR/.env.canary" ]]; then
  cp "$REWARDS_DIR/.env.canary" "$BACKUP_DIR/referral-rewards-canary.env.$ts.bak"
fi

if [[ "$SYNC_REMOTE_ENV" == "1" ]]; then
  if [[ ! -f "$REMOTE_KEY" ]]; then
    echo "[err] REMOTE_KEY not found: $REMOTE_KEY"
    exit 1
  fi
  scp -P "$REMOTE_SSH_PORT" -i "$REMOTE_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST:/opt/sub2api-canary/zhisales-pay-service/.env.canary" "$PAY_DIR/.env.canary"
  scp -P "$REMOTE_SSH_PORT" -i "$REMOTE_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST:/opt/sub2api-canary/referral-rewards-service/.env.canary" "$REWARDS_DIR/.env.canary"
fi

load_env_file() {
  local env_file=$1
  if [[ ! -f "$env_file" ]]; then
    echo "[err] env file not found: $env_file"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

cleanup_stale() {
  for pidfile in "$PAY_PID_FILE" "$REWARDS_PID_FILE" "$TUNNEL_PID_FILE"; do
    if [[ -f "$pidfile" ]]; then
      pid="$(cat "$pidfile")"
      kill "$pid" 2>/dev/null || true
    fi
  done
}

stop_any() {
  pkill -f "node server.mjs" 2>/dev/null || true
  if [[ -f "$PAY_PID_FILE" ]]; then
    kill "$(cat "$PAY_PID_FILE")" 2>/dev/null || true
  fi
  if [[ -f "$REWARDS_PID_FILE" ]]; then
    kill "$(cat "$REWARDS_PID_FILE")" 2>/dev/null || true
  fi
}

stop_stale_launchd_tunnel() {
  local user_boot_domain="gui/$(id -u)/com.zhisales.local-db-tunnel"
  if launchctl print "$user_boot_domain" >/dev/null 2>&1; then
    echo "[local-canary] 发现旧 LaunchAgent com.zhisales.local-db-tunnel，先停止以避免端口冲突"
    launchctl bootout "$user_boot_domain" 2>/dev/null || true
  fi
}

start_tunnel() {
  local resolved_host
  local remote_host_output=""
  local pids

  if [[ ! -f "$REMOTE_KEY" ]]; then
    echo "[err] REMOTE_KEY not found: $REMOTE_KEY"
    exit 1
  fi

  if [[ "${REMOTE_DB_USE_PUBLIC_IP}" == "1" ]]; then
    echo "[local-canary] 使用外网DB隧道地址: ${REMOTE_DB_TUNNEL_HOST}:${REMOTE_DB_PORT}"
    resolved_host="$REMOTE_DB_TUNNEL_HOST"
  else
    remote_host_output="$(ssh -p "$REMOTE_SSH_PORT" -i "$REMOTE_KEY" -o ConnectTimeout=8 -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
      "${REMOTE_USER}@${REMOTE_HOST}" "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${REMOTE_DB_CONTAINER} 2>/dev/null | tr -d '\r'")"
    if [[ -n "$remote_host_output" ]]; then
      resolved_host="$remote_host_output"
    else
      if [[ -z "$REMOTE_DB_HOST" ]]; then
        echo "[local-canary] ERROR: 无法解析容器 IP，且未配置 REMOTE_DB_HOST"
        exit 1
      fi
    resolved_host="$REMOTE_DB_HOST"
      echo "[local-canary] 容器解析失败，回退到 REMOTE_DB_HOST: ${resolved_host}:${REMOTE_DB_PORT}"
    fi
  fi

  if [[ -z "$resolved_host" ]]; then
    echo "[local-canary] ERROR: 未能解析 DB 目标地址"
    exit 1
  fi

  echo "[local-canary] DB 隧道目标: ${resolved_host}:${REMOTE_DB_PORT}"
  stop_stale_launchd_tunnel
  pids="$(lsof -tiTCP:${DB_TUNNEL_LOCAL_PORT} -sTCP:LISTEN -n -P 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[local-canary] 清理旧隧道监听: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
  ssh -p "$REMOTE_SSH_PORT" -f -i "$REMOTE_KEY" -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=4 -o ConnectTimeout=10 -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -N \
    -L 127.0.0.1:${DB_TUNNEL_LOCAL_PORT}:${resolved_host}:${REMOTE_DB_PORT} "${REMOTE_USER}@${REMOTE_HOST}"
  sleep 1
  pgrep -f "ssh.*127.0.0.1:${DB_TUNNEL_LOCAL_PORT}:${resolved_host}:${REMOTE_DB_PORT}" | head -n 1 > "$TUNNEL_PID_FILE"
}

wait_health() {
  local name=$1
  local port=$2
  for i in {1..20}; do
    if curl -fsS -m 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      echo "[ok] ${name} ${port}/health is reachable"
      return 0
    fi
    sleep 1
  done
  echo "[warn] ${name} health check failed, check log: ${PAY_LOG} / ${REWARDS_LOG}"
  return 1
}

stop_any
cleanup_stale

start_tunnel
sleep 1

cd "$PAY_DIR"
load_env_file "$PAY_DIR/.env.canary"
DB_HOST=127.0.0.1 DB_PORT="$DB_TUNNEL_LOCAL_PORT" PORT="$PAY_PORT" SUB2API_BASE_URL="$SUB2API_BASE_URL" PAY_CATALOG_PATH="$PAY_DIR/catalog.json" nohup npm start \
  >"$PAY_LOG" 2>&1 < /dev/null &
echo $! > "$PAY_PID_FILE"

cd "$REWARDS_DIR"
load_env_file "$REWARDS_DIR/.env.canary"
DB_HOST=127.0.0.1 DB_PORT="$DB_TUNNEL_LOCAL_PORT" PORT="$REWARDS_PORT" SUB2API_BASE_URL="$SUB2API_BASE_URL" nohup npm start \
  >"$REWARDS_LOG" 2>&1 < /dev/null &
echo $! > "$REWARDS_PID_FILE"

sleep 1
wait_health zhisales-pay-service "$PAY_PORT"
wait_health referral-rewards-service "$REWARDS_PORT"

echo "Started:"
echo "  pay pid        : $(cat "$PAY_PID_FILE")"
echo "  rewards pid    : $(cat "$REWARDS_PID_FILE")"
echo "  tunnel pid     : $(cat "$TUNNEL_PID_FILE")"
echo "  logs           : $PAY_LOG | $REWARDS_LOG | $TUNNEL_LOG"
echo "  pay health     : http://127.0.0.1:${PAY_PORT}/health"
echo "  rewards health : http://127.0.0.1:${REWARDS_PORT}/health"
