#!/usr/bin/env bash
set -euo pipefail

# Install the quota route in both public API sites without touching Sub2API.
# A timestamped Caddyfile backup is created before any change; validation must
# pass before Caddy is reloaded.

HOST="${DEPLOY_HOST:-18.143.67.94}"
SSH_USER="${DEPLOY_USER:-ubuntu}"
SSH_KEY="${DEPLOY_KEY:-/Users/chauncey/Downloads/sg.pem}"
REMOTE_CADDYFILE="${REMOTE_CADDYFILE:-/etc/caddy/Caddyfile}"

ssh_args=(-i "$SSH_KEY" -o BatchMode=yes)

ssh "${ssh_args[@]}" "${SSH_USER}@${HOST}" "sudo python3 - '$REMOTE_CADDYFILE' <<'PY'
from pathlib import Path
import shutil
import sys
from datetime import datetime, timezone

path = Path(sys.argv[1])
text = path.read_text()
route = '''\t# Account daily-quota gateway; keep this before responses/compact and generic API handlers.\n\t@quota_api path /v1/* /responses* /models* /api/openai/* /api/anthropic/*\n\thandle @quota_api {\n\t\treverse_proxy 127.0.0.1:18193\n\t}\n\n'''

if '@quota_api path ' in text:
    print('quota route already present; no change')
    raise SystemExit(0)

lines = text.splitlines(keepends=True)
out = []
site = None
inserted = set()
for line in lines:
    stripped = line.strip()
    if stripped == 'ai.zhisales.com {':
        site = 'ai'
    elif stripped == 'www.zhisales.com {':
        site = 'www'
    elif site in {'ai', 'www'} and stripped.endswith('}') and not stripped.startswith('handle'):
        # Site blocks are closed at column zero; nested blocks are indented.
        if not line.startswith((' ', '\\t')):
            site = None
    if site in {'ai', 'www'} and site not in inserted and stripped.startswith('@responsesCompact path '):
        out.append(route)
        inserted.add(site)
    out.append(line)

missing = {'ai', 'www'} - inserted
if missing:
    raise SystemExit(f'missing target sites: {sorted(missing)}')

backup = path.with_name(path.name + '.bak.quota-' + datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S'))
shutil.copy2(path, backup)
path.write_text(''.join(out))
print(f'updated {path}; backup={backup}')
PY
sudo caddy validate --config '$REMOTE_CADDYFILE' --adapter caddyfile
sudo systemctl reload caddy
"

echo "Quota Caddy route installed and Caddy reloaded on ${HOST}."
