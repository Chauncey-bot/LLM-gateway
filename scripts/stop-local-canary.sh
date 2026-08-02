#!/usr/bin/env bash
set -euo pipefail

PAY_PID_FILE="/tmp/zhisales-pay-local.pid"
REWARDS_PID_FILE="/tmp/zhisales-rewards-local.pid"
TUNNEL_PID_FILE="/tmp/zhisales-db-tunnel.pid"

if [[ -f "$PAY_PID_FILE" ]]; then
  kill "$(cat "$PAY_PID_FILE")" 2>/dev/null || true
fi
if [[ -f "$REWARDS_PID_FILE" ]]; then
  kill "$(cat "$REWARDS_PID_FILE")" 2>/dev/null || true
fi
if [[ -f "$TUNNEL_PID_FILE" ]]; then
  kill "$(cat "$TUNNEL_PID_FILE")" 2>/dev/null || true
fi
pkill -f "node server.mjs" 2>/dev/null || true
pkill -f "ssh -N -L 127.0.0.1:${DB_TUNNEL_LOCAL_PORT:-25432}" 2>/dev/null || true
rm -f "$PAY_PID_FILE" "$REWARDS_PID_FILE" "$TUNNEL_PID_FILE"
echo "stopped"
