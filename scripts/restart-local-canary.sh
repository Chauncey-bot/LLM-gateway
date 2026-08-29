#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STOP_SCRIPT="$ROOT_DIR/scripts/stop-local-canary.sh"
START_SCRIPT="$ROOT_DIR/scripts/start-local-canary.sh"

if [[ ! -x "$STOP_SCRIPT" || ! -x "$START_SCRIPT" ]]; then
  echo "[err] start/stop scripts not executable"
  exit 1
fi

echo "[restart] stop local canary services..."
"$STOP_SCRIPT"

if [[ "${1:-}" == "--no-start" ]]; then
  echo "[restart] skip start by --no-start"
  exit 0
fi

sleep 1
echo "[restart] start local canary services..."
"$START_SCRIPT"
