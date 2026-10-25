#!/usr/bin/env bash
# Preserve the live environment, catalog mount, network and all other services.
set -euo pipefail
reset_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${RELEASE_TAG:?Set a unique immutable release tag}"
: "${PROD_KEY:?Set the production SSH key path}"
[[ "$RELEASE_TAG" =~ ^[a-z0-9][a-z0-9.-]+$ ]] || exit 1
reset_host="${PROD_HOST:-52.221.30.93}"
reset_user="${PROD_USER:-ubuntu}"
reset_image="subscription-reset-service:$RELEASE_TAG"
reset_stage="$(mktemp -d /private/tmp/subscription-reset-release.XXXXXX)"
trap 'rm -rf "$reset_stage"' EXIT
reset_ssh=(ssh -i "$PROD_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=10 "$reset_user@$reset_host")

bash "$reset_root/subscription-reset-service/scripts/test-local.sh"
mkdir -p "$reset_stage/subscription-reset-service" "$reset_stage/zhisales-pay-service"
for reset_file in server.mjs admin-reset.mjs reset-store.mjs subscription-cache.mjs plan-policy.mjs package.json package-lock.json Dockerfile; do
  cp "$reset_root/subscription-reset-service/$reset_file" "$reset_stage/subscription-reset-service/"
done
cp "$reset_root/zhisales-pay-service/catalog.json" "$reset_stage/zhisales-pay-service/"
(cd "$reset_stage" && shasum -a 256 subscription-reset-service/* zhisales-pay-service/catalog.json > source.sha256)
git -C "$reset_root" rev-parse HEAD > "$reset_stage/base-commit.txt"
docker build --platform linux/amd64 -t "$reset_image" -f "$reset_stage/subscription-reset-service/Dockerfile" "$reset_stage"
[[ "$(docker image inspect "$reset_image" --format '{{.Os}}/{{.Architecture}}')" == linux/amd64 ]]
reset_image_id="$(docker image inspect "$reset_image" --format '{{.Id}}')"

# Confirm the documented service, env and rollback artifact before uploading.
"${reset_ssh[@]}" 'set -eu
  test -f /opt/subscription-reset-service/.env
  test -f /opt/subscription-reset-service/docker-compose.yml
  docker compose -f /opt/subscription-reset-service/docker-compose.yml config --services | grep -qx subscription-reset-service
  docker inspect subscription-reset-service-subscription-reset-service-1 --format "rollback={{.Config.Image}} image={{.Image}}"
  curl --max-time 15 -fsS http://127.0.0.1:18192/health
'
docker save "$reset_image" | gzip > "$reset_stage/image.tar.gz"
scp -i "$PROD_KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$reset_stage/image.tar.gz" "$reset_user@$reset_host:/tmp/subscription-reset-$RELEASE_TAG.tar.gz"
scp -i "$PROD_KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$reset_stage/source.sha256" "$reset_user@$reset_host:/tmp/subscription-reset-$RELEASE_TAG.source.sha256"
scp -i "$PROD_KEY" -o BatchMode=yes -o IdentitiesOnly=yes "$reset_stage/base-commit.txt" "$reset_user@$reset_host:/tmp/subscription-reset-$RELEASE_TAG.base-commit.txt"
"${reset_ssh[@]}" bash -s -- "$RELEASE_TAG" "$reset_image_id" <<'REMOTE'
set -euo pipefail
reset_tag="$1"
reset_expected_image="$2"
reset_release="/opt/subscription-reset-service/releases/$reset_tag"
test ! -e "$reset_release"
mkdir -m 700 -p "$reset_release"
cp /opt/subscription-reset-service/docker-compose.yml "$reset_release/docker-compose.rollback.yml"
sudo cp /etc/caddy/Caddyfile "$reset_release/Caddyfile.rollback"
sudo chown "$(id -u):$(id -g)" "$reset_release/Caddyfile.rollback"
mv "/tmp/subscription-reset-$reset_tag.source.sha256" "$reset_release/source.sha256"
mv "/tmp/subscription-reset-$reset_tag.base-commit.txt" "$reset_release/base-commit.txt"
docker inspect subscription-reset-service-subscription-reset-service-1 --format '{{.Config.Image}} {{.Image}}' > "$reset_release/rollback-image.txt"
docker load -i "/tmp/subscription-reset-$reset_tag.tar.gz"
test "$(docker image inspect "subscription-reset-service:$reset_tag" --format '{{.Id}}')" = "$reset_expected_image"

python3 - "$reset_tag" "$reset_release" <<'PY'
import pathlib,re,sys
tag,release=sys.argv[1:]
compose=pathlib.Path('/opt/subscription-reset-service/docker-compose.yml')
text,count=re.subn(r'(?m)^(\s*image:\s*)subscription-reset-service:[^\s]+', r'\g<1>subscription-reset-service:'+tag,compose.read_text())
assert count==1, 'Expected exactly one reset service image'
candidate=pathlib.Path(release)/'Caddyfile.candidate'
lines=(pathlib.Path(release)/'Caddyfile.rollback').read_text().splitlines(keepends=True)
count=0
for i,line in enumerate(lines):
    if '@resetQuotaUser path ' in line:
        for route in ['/api/v1/admin/subscriptions/*/reset-quota','/v1/admin/subscriptions/*/reset-quota']:
            if route not in line: line=line.rstrip('\n')+' '+route+'\n'
        lines[i]=line
        count+=1
assert count==3, 'Expected the three existing reset route matchers'
candidate.write_text(''.join(lines))
(pathlib.Path(release)/'docker-compose.candidate.yml').write_text(text)
PY
sudo caddy validate --config "$reset_release/Caddyfile.candidate" --adapter caddyfile
cp "$reset_release/docker-compose.candidate.yml" /opt/subscription-reset-service/docker-compose.yml
docker compose -f /opt/subscription-reset-service/docker-compose.yml up -d --no-deps --no-build subscription-reset-service
for reset_attempt in $(seq 1 15); do
  if curl --max-time 5 -fsS http://127.0.0.1:18192/health > "$reset_release/health.json"; then break; fi
  sleep 1
done
curl --max-time 15 -fsS http://127.0.0.1:18192/health
if ! sudo cmp -s "$reset_release/Caddyfile.candidate" /etc/caddy/Caddyfile; then
  sudo install -m 644 "$reset_release/Caddyfile.candidate" /etc/caddy/Caddyfile
  sudo systemctl reload caddy
fi
reset_status="$(curl --max-time 15 -sS -o "$reset_release/public-auth-check.json" -w '%{http_code}' -X POST https://ai.zhisales.com/api/v1/admin/subscriptions/57/reset-quota -H 'Content-Type: application/json' -d '{"daily":true}')"
test "$reset_status" = 401
grep -q 'Missing Authorization token' "$reset_release/public-auth-check.json"
docker inspect subscription-reset-service-subscription-reset-service-1 --format 'running={{.Config.Image}} image={{.Image}}'
printf 'release=%s\n' "$reset_release"
REMOTE
