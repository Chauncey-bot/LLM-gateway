#!/usr/bin/env bash
set -euo pipefail

printf "\n[check] node/npm\n"
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  node -v
  npm -v
else
  echo "node/npm missing"
fi

printf "\n[check] docker\n"
if command -v docker >/dev/null 2>&1; then
  docker -v
else
  echo "docker missing"
fi

echo "\n[recommend] If Node is missing, install:
  brew install node
(or download from https://nodejs.org)
"
echo "[recommend] If Docker is missing, install:
  brew install --cask docker
(or install Docker Desktop)
"

echo "\n[verify after install]"
echo "node -v && npm -v && docker -v"

if [[ "${1:-}" == "--do-brew" ]]; then
  if command -v brew >/dev/null 2>&1; then
    echo "\n[brew install start]"
    brew install node
    brew install --cask docker || brew install --cask docker@edge || true
  else
    echo "Homebrew not found. Install Homebrew first: https://brew.sh"
    exit 1
  fi
fi
