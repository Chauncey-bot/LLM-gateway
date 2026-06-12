# Handoff

## 1. `codex-proxy`

- Server: `18.143.67.94`
- Verified SSH login:
  - `ssh -i /private/tmp/sg_prod_key ubuntu@18.143.67.94`
- Current version: `v2.0.57`
- Running image: `codex-proxy-local:v2.0.57`
- Stable path: `/opt/codex-proxy -> /opt/codex-proxy-v2.0.57-source`
- Previous version kept for rollback: `/opt/codex-proxy-v2.0.25-source`
- Docker container: `codex-proxy-codex-proxy-1`
- Local port: `8888`
- Public endpoint: `https://apicd.aitrack.io`

Current routing on `apicd.aitrack.io`:

- `/v1/*`
- `/models`
- `/responses`
- `/responses/compact`

Notes:

- Caddy only exposes API routes for this domain and does not expose the dashboard/admin pages.
- This path has long-connection-friendly proxy settings for SSE and long-running responses.

Verified:

- `http://127.0.0.1:8888/health` is healthy
- `https://apicd.aitrack.io/models` works
- `https://apicd.aitrack.io/v1/responses` works

Known issue:

- Current account pool state is `total=6, active=1`
- This low active count existed before the `v2.0.57` upgrade and still needs investigation

## 2. `sub2api`

- Running image: `weishaw/sub2api:latest`
- Container: `sub2api`
- Local port: `127.0.0.1:18080`
- Public domains:
  - `https://ai.zhisales.com`
  - `https://www.zhisales.com`

Admin account:

- Email: `admin@zhisales.com`
- Password: `bZ7raDBttVSamvOJFCX8anpH`

Routing:

- `ai.zhisales.com`
  - `/api/*`, `/v1/*`, `/responses*`, `/models*` -> `sub2api`
  - all other paths -> static site `/var/www/zhisales-site`
- `www.zhisales.com`
  - `/purchase`, `/purchase/*`, `/pay-api/*` -> independent payment service
  - `/api/*`, `/v1/*`, `/responses*`, `/models*` -> `sub2api`
  - all other paths -> static site `/var/www/zhisales-site`

Verified:

- `https://ai.zhisales.com/api/v1/settings/public` works
- `purchase_subscription_enabled=true`
- `purchase_subscription_url=https://www.zhisales.com/purchase`

## 3. Independent payment service

Local code:

- `/Users/doggieyang/Documents/codex-project/codex-p-install/zhisales-pay-service`

Remote deploy path:

- `/opt/zhisales-pay-service`

Runtime:

- Container: `zhisales-pay-service-zhisales-pay-1`
- Local port: `127.0.0.1:18190`
- Public endpoints:
  - `https://www.zhisales.com/purchase`
  - `https://www.zhisales.com/pay-api/*`

Purpose:

- Provides the Alipay purchase page for the current `sub2api` skin
- Creates Alipay orders
- Queries Alipay orders
- Auto-fulfills to `sub2api`
  - subscriptions via `admin/subscriptions/assign` or `extend`
  - balance via `admin/users/:id/balance`

Alipay integration status:

- Uses the updated Trading open API
- Implemented:
  - `POST /trading/trade` for order creation
  - `POST /trading/trade` with `opt=order_query` for order query
- Request signing and response verification are implemented according to the updated doc

Payment flow status:

- Real payment testing has already passed
- Confirmed working end to end:
  - create order
  - payment redirect
  - return page
  - query
  - automatic fulfillment

Current product catalog:

- `coding-plan-daily-80`
  - `¥200 / 30 days`
  - `80 USD daily`
  - `group_id=10`
- `coding-plan-daily-200`
  - `¥500 / 30 days`
  - `200 USD daily`
  - `group_id=5`

Important note about updates:

- `catalog.json` is mounted as a single bind-mounted file
- after changing product configuration, recreate the payment container:
  - `cd /opt/zhisales-pay-service`
  - `docker compose up -d --force-recreate zhisales-pay`

## 4. Static sites

Static home:

- `/var/www/zhisales-site`

Docs site:

- `/var/www/doc-zhisales`

## 5. GitHub 提交与生产发布（免反复尝试）

- 仓库远端：`git@github.com:Chauncey-bot/LLM-gateway.git`
- 固定发布分支：`codex/dev`

### GitHub 提交/推送（固定授权）

- `ssh` 私钥（你当前可用）：`/Users/chauncey/Downloads/openclaw_github_ed25519`
- 推送命令：
  - `GIT_SSH_COMMAND='ssh -i /Users/chauncey/Downloads/openclaw_github_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=no' git push origin codex/dev`

### 生产机部署（独立页面 bundle）

- 生产主机：`18.143.67.94`
- 生产机登录常用 key：`/private/tmp/zhisales-key/sg.pem`
- 登录命令：
  - `ssh -i /private/tmp/zhisales-key/sg.pem -o StrictHostKeyChecking=no ubuntu@18.143.67.94`
- 部署命令（`prod_PurchaseSubscriptionView-DDDC2WHV.js`）：
  - `tmp=$(mktemp) && cp prod_PurchaseSubscriptionView-DDDC2WHV.js "$tmp"`
  - `scp -i /private/tmp/zhisales-key/sg.pem -o StrictHostKeyChecking=no "$tmp" ubuntu@18.143.67.94:/tmp/PurchaseSubscriptionView-DDDC2WHV.js`
  - `ssh -i /private/tmp/zhisales-key/sg.pem -o StrictHostKeyChecking=no ubuntu@18.143.67.94 "sudo -n cp /tmp/PurchaseSubscriptionView-DDDC2WHV.js /var/www/zhisales-site/assets/PurchaseSubscriptionView-DDDC2WHV.js && sudo -n sha1sum /var/www/zhisales-site/assets/PurchaseSubscriptionView-DDDC2WHV.js && rm /tmp/PurchaseSubscriptionView-DDDC2WHV.js"`

### 发布核验

- Git 推送成功后，可在本地确认 commit 已到位：
  - `git rev-parse --short HEAD`
  - `git log -1 --oneline`
- 生产端文件可读性校验（按 `sha1`）：
  - `ssh -i /private/tmp/zhisales-key/sg.pem -o StrictHostKeyChecking=no ubuntu@18.143.67.94 "sha1sum /var/www/zhisales-site/assets/PurchaseSubscriptionView-DDDC2WHV.js"`
- domain: `https://aidoc.zhisales.com`

Status:

- `www.zhisales.com` and `ai.zhisales.com` use the newer frontend homepage
- `aidoc.zhisales.com` is live
- docs footer text is:
  - `© 2026 Zhisales. All rights reserved.`

## 5. Important config files

Caddy:

- `/etc/caddy/Caddyfile`

`codex-proxy`:

- `/opt/codex-proxy/.env`
- `/opt/codex-proxy/config/default.yaml`
- `/opt/codex-proxy/config/models.yaml`
- `/opt/codex-proxy/data/local.yaml`
- `/opt/codex-proxy/data/accounts.json`

Payment service:

- `/opt/zhisales-pay-service/.env`
- `/opt/zhisales-pay-service/catalog.json`
- `/opt/zhisales-pay-service/server.mjs`

## 6. Current status and next things to watch

1. The payment flow is already usable and has been validated successfully.
2. The most important remaining issue is why `codex-proxy` currently has only `1 active` account out of `6`.
3. If anyone changes payment products later, updating `catalog.json` alone is not enough; recreate the payment container afterward.
4. `sub2api` business code itself was not modified. The main changes were:
   - Caddy routing
   - static home pages
   - the independent payment service
   - admin account / groups / product configuration

## 7. Quick path reference

- `codex-proxy`: `/opt/codex-proxy`
- `sub2api`: `/opt/sub2api`
- payment service: `/opt/zhisales-pay-service`
- static homepage: `/var/www/zhisales-site`
- docs site: `/var/www/doc-zhisales`
- Caddy config: `/etc/caddy/Caddyfile`

## 8. Suggested first checks for the next engineer

- `docker ps`
- `curl https://apicd.aitrack.io/models`
- `curl https://www.zhisales.com/pay-api/catalog`
