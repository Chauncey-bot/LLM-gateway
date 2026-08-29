#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAY_DIR="$ROOT_DIR/zhisales-pay-service"
LOCAL_ENV="$PAY_DIR/.env"
CANARY_ENV="$PAY_DIR/.env.canary"
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
TUNNEL_TIMEOUT="${TUNNEL_TIMEOUT:-6}"
TEST_TIMEOUT_MS="${TEST_TIMEOUT_MS:-5000}"
BASTION_ONLY="${BASTION_ONLY:-1}"

DB_DIRECT_HOST="${DB_DIRECT_HOST:-$REMOTE_DB_HOST}"
DB_DIRECT_PORT="${DB_DIRECT_PORT:-$REMOTE_DB_PORT}"

ENV_FILE="${DB_ENV_FILE:-$LOCAL_ENV}"

load_env_file() {
  local file=$1
  if [[ ! -f "$file" ]]; then
    echo "[error] 找不到数据库配置: $file"
    exit 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "${line:0:1}" == "#" ]] && continue
    if [[ "$line" == *"="* ]]; then
      key="${line%%=*}"
      value="${line#*=}"
      if [[ "$key" == "DB_HOST" || "$key" == "DB_PORT" || "$key" == "DB_NAME" || "$key" == "DB_USER" || "$key" == "DB_PASSWORD" || "$key" == "DB_SSL" || "$key" == "DB_SSL_REJECT_UNAUTHORIZED" || "$key" == "REFERRAL_REWARDS_BASE_URL" || "$key" == "REFERRAL_REWARDS_INTERNAL_KEY" || "$key" == "SUB2API_BASE_URL" || "$key" == "ALIPAY_OPEN_TOKEN" || "$key" == "ALIPAY_OPEN_SIGN" || "$key" == "PAY_PUBLIC_BASE_URL" || "$key" == "PORT" || "$key" == "PAY_CATALOG_PATH" ]]; then
        export "$key=$value"
      fi
    fi
  done < "$file"
}

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$CANARY_ENV" ]]; then
    echo "[warn] 未找到 $ENV_FILE，回退到 $CANARY_ENV"
    ENV_FILE="$CANARY_ENV"
  else
    echo "[error] 找不到数据库配置: $ENV_FILE"
    exit 1
  fi
fi

load_env_file "$ENV_FILE"

if [[ "$ENV_FILE" == "$LOCAL_ENV" ]] && [[ "${DB_PASSWORD:-}" == "你的PostgreSQL密码" ]]; then
  if [[ -f "$CANARY_ENV" ]]; then
    echo "[warn] 本地 DB_PASSWORD 是占位值，回退到 $CANARY_ENV"
    ENV_FILE="$CANARY_ENV"
    load_env_file "$ENV_FILE"
  fi
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-zhisales_pay}"
DB_USER="${DB_USER:-sub2api}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_SSL="${DB_SSL:-false}"
DB_SSL_REJECT_UNAUTHORIZED="${DB_SSL_REJECT_UNAUTHORIZED:-true}"

if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "你的PostgreSQL密码" ]]; then
  echo "[error] DB_PASSWORD 未配置真实密码（当前文件: $ENV_FILE）"
  exit 1
fi

CONFIG_DB_HOST="$DB_HOST"
CONFIG_DB_PORT="$DB_PORT"
CONFIG_DB_NAME="$DB_NAME"
CONFIG_DB_USER="$DB_USER"
CONFIG_DB_SSL="$DB_SSL"
CONFIG_DB_SSL_REJECT_UNAUTHORIZED="$DB_SSL_REJECT_UNAUTHORIZED"
CONFIG_DB_PASSWORD="$DB_PASSWORD"

echo "[db-test] 使用配置文件: $ENV_FILE"
echo "[db-test] 配置里的连接: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME} (SSL=${DB_SSL})"

TUNNEL_PID=""
is_local_port_in_use() {
  local port=$1
  if command -v nc >/dev/null 2>&1 && nc -z -w 1 127.0.0.1 "${port}" >/dev/null 2>&1; then
    return 0
  fi
  if bash -c "cat < /dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

kill_local_tunnel_listener() {
  local pids
  pids="$(lsof -tiTCP:${DB_TUNNEL_LOCAL_PORT} -sTCP:LISTEN -n -P 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[db-test] 清理本地 25432 旧隧道进程: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

resolve_remote_db_host() {
  local resolved=""
  if [[ "${REMOTE_DB_USE_PUBLIC_IP}" == "1" ]]; then
    if [[ -z "$REMOTE_DB_TUNNEL_HOST" ]]; then
      echo "[db-test] ERROR: REMOTE_DB_USE_PUBLIC_IP=1 时，需设置 REMOTE_DB_TUNNEL_HOST" >&2
      echo ""
      return
    fi
    echo "$REMOTE_DB_TUNNEL_HOST"
    return
  fi

  if [[ -z "${REMOTE_KEY}" || ! -f "$REMOTE_KEY" ]]; then
    echo "[db-test] 无法解析容器 IP：缺少 REMOTE_KEY，回退到 REMOTE_DB_HOST（已设为外网主机）" >&2
    echo "$REMOTE_DB_HOST"
    return
  fi

  resolved="$(ssh -p "${REMOTE_SSH_PORT}" -i "$REMOTE_KEY" -o ConnectTimeout=8 -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
      "${REMOTE_USER}@${REMOTE_HOST}" "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${REMOTE_DB_CONTAINER} 2>/dev/null | tr -d '\r'")" || resolved=""
  if [[ -n "$resolved" ]]; then
    echo "$resolved"
    return
  fi
  if [[ -n "$REMOTE_DB_HOST" ]]; then
    echo "$REMOTE_DB_HOST"
    return
  fi
  echo ""
}

stop_stale_launchd_tunnel() {
  local user_boot_domain="gui/$(id -u)/com.zhisales.local-db-tunnel"
  if launchctl print "$user_boot_domain" >/dev/null 2>&1; then
    echo "[db-test] 停止旧 LaunchAgent com.zhisales.local-db-tunnel，避免端口 25432 被旧隧道占用"
    launchctl bootout "$user_boot_domain" 2>/dev/null || true
  fi
}

start_tunnel_if_needed() {
  if [[ "$DB_HOST" != "sub2api-postgres" ]]; then
    return
  fi

  echo "[db-test] 检测到生产容器域名 DB_HOST=sub2api-postgres，开始建立本地隧道..."
  local resolved_remote_host
  resolved_remote_host="$(resolve_remote_db_host)"
  if [[ -z "$resolved_remote_host" ]]; then
    echo "[db-test] ERROR: 无法解析生产数据库 IP，请检查 SSH 与 docker inspect 可用性"
    exit 1
  fi
  echo "[db-test] 生产数据库当前目标: ${resolved_remote_host}:${REMOTE_DB_PORT}"
  stop_stale_launchd_tunnel
  if is_local_port_in_use "$DB_TUNNEL_LOCAL_PORT"; then
    echo "[db-test] 端口 ${DB_TUNNEL_LOCAL_PORT} 已占用，先验测是否可用"
    if run_node_check "127.0.0.1" "$DB_TUNNEL_LOCAL_PORT" "已有隧道连接探测"; then
      DB_HOST="127.0.0.1"
      DB_PORT="$DB_TUNNEL_LOCAL_PORT"
      return
    fi
    echo "[db-test] 端口已占用但不可用，重建隧道"
    kill_local_tunnel_listener
    sleep 1
  fi
  if [[ ! -x "$(command -v ssh || true)" ]]; then
    echo "[error] 未找到 ssh 命令"
    exit 1
  fi

  if [[ ! -f "$REMOTE_KEY" ]]; then
    echo "[error] 未找到 SSH 私钥: $REMOTE_KEY"
    exit 1
  fi

  if ! ssh -p "$REMOTE_SSH_PORT" -f -i "$REMOTE_KEY" -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -o ConnectTimeout=10 -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -N \
    -L "127.0.0.1:${DB_TUNNEL_LOCAL_PORT}:${resolved_remote_host}:${REMOTE_DB_PORT}" \
    "${REMOTE_USER}@${REMOTE_HOST}"; then
    kill_local_tunnel_listener
    if is_local_port_in_use "$DB_TUNNEL_LOCAL_PORT"; then
      echo "[db-test] SSH 创建失败，但检测到端口已存在：复用现有 127.0.0.1:${DB_TUNNEL_LOCAL_PORT}"
      DB_HOST="127.0.0.1"
      DB_PORT="$DB_TUNNEL_LOCAL_PORT"
      return
    fi
    echo "[error] SSH 隧道启动失败，请检查 SSH 凭据与网络"
    exit 1
  fi

  TUNNEL_PID="$(pgrep -f "ssh.*127.0.0.1:${DB_TUNNEL_LOCAL_PORT}:${resolved_remote_host}:${REMOTE_DB_PORT}" | head -n 1 || true)"
  sleep "$TUNNEL_TIMEOUT"

  if [[ -z "$TUNNEL_PID" ]]; then
    if is_local_port_in_use "$DB_TUNNEL_LOCAL_PORT"; then
      echo "[db-test] SSH 进程未匹配到但端口可用：复用现有 127.0.0.1:${DB_TUNNEL_LOCAL_PORT}"
      DB_HOST="127.0.0.1"
      DB_PORT="$DB_TUNNEL_LOCAL_PORT"
      return
    fi
    echo "[error] SSH 隧道启动失败，请检查 SSH 凭据与网络"
    exit 1
  fi

  DB_HOST="127.0.0.1"
  DB_PORT="$DB_TUNNEL_LOCAL_PORT"
  echo "[db-test] 隧道已就绪: 127.0.0.1:${DB_TUNNEL_LOCAL_PORT}, ssh pid=${TUNNEL_PID}"
}

cleanup() {
  if [[ -n "${TUNNEL_PID:-}" ]]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

run_node_check() {
  if [[ ! -f "$PAY_DIR/node_modules/pg/package.json" ]]; then
    echo "[error] 未检测到 pg 依赖，请先执行 npm install（在 $PAY_DIR）"
    exit 1
  fi

  cd "$PAY_DIR"
  local _host=$1
  local _port=$2
  local _scope=$3
  local _ok=0

  set +e
  DB_HOST="$_host" DB_PORT="$_port" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
  DB_SSL="$DB_SSL" DB_SSL_REJECT_UNAUTHORIZED="$DB_SSL_REJECT_UNAUTHORIZED" TEST_TIMEOUT_MS="$TEST_TIMEOUT_MS" \
  node - <<NODE
const { Client } = require('pg');

const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;
const sslCfg = (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1')
  ? { rejectUnauthorized: sslRejectUnauthorized }
  : false;

const cfg = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: sslCfg,
  connectionTimeoutMillis: Number(process.env.TEST_TIMEOUT_MS),
};

(async () => {
  const client = new Client(cfg);
  try {
    await client.connect();
    const r = await client.query('select now() as now, current_database() as db');
    console.log('[db-test] connected:', r.rows[0].db, r.rows[0].now);
  } catch (err) {
    console.error('[db-test] connect failed:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
})();
NODE
  _ok=$?
  set -e

  if [[ $_ok -ne 0 ]]; then
    echo "[db-test] ${_scope} 连接失败"
    return 1
  fi

  echo "[db-test] ${_scope} 连接成功"
  return 0
}

export DB_HOST
export DB_PORT
export DB_NAME
export DB_USER
export DB_PASSWORD
export DB_SSL
export DB_SSL_REJECT_UNAUTHORIZED
export TEST_TIMEOUT_MS

connect_from_config() {
  if [[ "$1" == "sub2api-postgres" ]]; then
    start_tunnel_if_needed
    if ! run_node_check "127.0.0.1" "$DB_TUNNEL_LOCAL_PORT" "配置文件隧道连接"; then
      return 1
    fi
    return 0
  fi

  if ! run_node_check "$CONFIG_DB_HOST" "$CONFIG_DB_PORT" "配置文件连接"; then
    return 1
  fi
}

if [[ "$CONFIG_DB_HOST" == "sub2api-postgres" ]]; then
  if [[ "$BASTION_ONLY" != "1" ]]; then
    DB_DIRECT_HOST="$(resolve_remote_db_host)"
    echo "[db-test] 生产优先地址: ${DB_DIRECT_HOST}:${DB_DIRECT_PORT}"
    if run_node_check "$DB_DIRECT_HOST" "$DB_DIRECT_PORT" "生产数据库直连"; then
      echo "[db-test] OK: production db 连接通过（优先直连）"
      exit 0
    fi

    echo "[db-test] 生产数据库直连失败，切换尝试配置文件地址"
  else
    echo "[db-test] BASTION_ONLY=1：跳过生产直连，直接走跳板隧道"
  fi
fi

if ! connect_from_config "$CONFIG_DB_HOST"; then
  echo "[db-test] ERROR: 配置文件数据库连接失败，请检查数据库可达性与凭据"
  exit 1
fi

echo "[db-test] OK: 数据库连接测试通过"
if [[ "$BASTION_ONLY" == "1" ]]; then
  REMOTE_DB_USE_PUBLIC_IP="0"
fi
