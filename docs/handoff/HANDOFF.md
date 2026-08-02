# Production Handoff — ZhiSales LLM Gateway

> Last verified: 2026-08-01 13:27 UTC (2026-08-01 21:27 CST)
>
> Scope: current production deployment on `18.143.67.94` and the source kept in
> this repository. Facts marked **historical** came from earlier handoff notes
> and should be rechecked before relying on them for an incident response.

## 1. Read this first

This repository is an integration workspace, not a full source mirror of every
production component. In particular, the upstream `sub2api` business source is
not present here. Do not assume a `git push` deploys anything automatically.

Never put passwords, API keys, private keys, database DSNs, OAuth tokens or
payment credentials in this file, Git, command history, or chat. Obtain them
from the team's approved secret store and use local `.env` files only. Rotate
any credential that has ever been exposed in an old document or terminal log.

## 2. System overview

```text
Internet
  │
  ├─ ai.zhisales.com ───────┬─ static Vue SPA      (/var/www/zhisales-site)
  │                          ├─ sub2api             (127.0.0.1:18080)
  │                          ├─ CLIProxy management  (127.0.0.1:18317)
  │                          ├─ rewards service      (127.0.0.1:18191)
  │                          ├─ payment service      (127.0.0.1:18190)
  │                          └─ quota reset service  (127.0.0.1:18192)
  │
  ├─ www.zhisales.com ──────┬─ static Vue SPA
  │                          ├─ payment checkout / API
  │                          ├─ rewards API
  │                          ├─ subscription/API routes via sub2api
  │                          └─ quota reset routes
  │
  ├─ apiv1.aitrack.io ──────└─ sub2api API
  ├─ apicd.aitrack.io ──────└─ legacy/current API route; verify before changes
  └─ aidoc.zhisales.com ────── static documentation (/var/www/doc-zhisales)

All public TLS termination and path routing are handled by Caddy on the
production host. Application containers bind only to loopback addresses.

## 3. Repository map

| Path | Role | Notes |
| --- | --- | --- |
| `frontend/` | Vue 3 + Vite public and admin SPA | Build output is intentionally ignored by Git and written to `backend/internal/web/dist`. |
| `scripts/deploy-frontend-static.sh` | Frontend static deployment guardrail | Uploads the complete build and verifies every output file exists remotely. |
| `zhisales-pay-service/` | Payment checkout, Alipay bridge, order fulfillment | PostgreSQL-backed; catalog is bind-mounted. |
| `referral-rewards-service/` | Referral, points, and redemption service | Reuses `sub2api` identity and calls its admin APIs. |
| `subscription-reset-service/` | User subscription quota reset adapter | Enforces a 24-hour validity cost for user resets. |
| `codex-proxy/` | Separate proxy source snapshot | Not the currently observed `cliproxyapi` container image; treat deployment relationship as **historical** until reconciled. |
| `docs/plans/` | Design notes and detailed service runbooks | Useful background, not necessarily current production truth. |

## 4. Production access and important paths

| Item | Value |
| --- | --- |
| Production host | `18.143.67.94` |
| SSH user | `ubuntu` |
| Caddy configuration | `/etc/caddy/Caddyfile` |
| Static SPA | `/var/www/zhisales-site` |
| Documentation site | `/var/www/doc-zhisales` |
| CLIProxy management files | `/var/www/cliproxy-mgmt` |
| `sub2api` deployment path | `/opt/sub2api` |
| Payment deployment path | `/opt/zhisales-pay-service` |
| Referral deployment path | Confirm before release; service is running but its source directory was not re-verified. |
| Quota-reset deployment path | `/opt/subscription-reset-service` |

Use a team-managed SSH key from the approved secret store. Confirm host identity
through your organization's normal process. Do not add `StrictHostKeyChecking=no`
to a new operational script unless there is a documented bootstrap exception.

## 5. Verified running services

The following was observed on 2026-08-01. Container image tags are useful for
diagnosis, but do not imply a rollback image is retained locally forever.

| Container | Image | Loopback port | Health check | Status |
| --- | --- | ---: | --- | --- |
| `sub2api` | `zhisales-sub2api:traffic-pack-0.1.151-20260801` | `18080 → 8080` | `http://127.0.0.1:18080/health` | HTTP 200; Docker healthy |
| `zhisales-pay-service-zhisales-pay-1` | `zhisales-pay-service:traffic-pack-ui-20260731` | `18190 → 3000` | `http://127.0.0.1:18190/health` | HTTP 200 |
| `referral-rewards-service-referral-rewards-1` | `referral-rewards-service:latest` | `18191 → 3000` | `http://127.0.0.1:18191/health` | HTTP 200 |
| `subscription-reset-service-subscription-reset-service-1` | `subscription-reset-service:latest` | `18192 → 3000` | `http://127.0.0.1:18192/health` | HTTP 200 |
| `cliproxyapi` | `eceasy/cli-proxy-api:v7.2.66` | `18317 → 8317` | Verify its management/API route before changes | Running |
| `sub2api-postgres` | `postgres:18-alpine` | internal `5432` | Docker health | Healthy |
| `sub2api-redis` | `redis:8-alpine` | internal `6379` | Docker health | Healthy |

Quick status command:

```bash
ssh ubuntu@18.143.67.94 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
```

## 6. Public routing

### `ai.zhisales.com`

| Path | Destination | Notes |
| --- | --- | --- |
| `/cliproxy-…/management.html` | static CLIProxy management UI | The exact random prefix is in `/etc/caddy/Caddyfile`; its page response is `Cache-Control: no-store`. |
| `/cliproxy-…/v0/management/*` | `127.0.0.1:18317` | Prefix is stripped before proxying. |
| `/api/referral/*`, `/api/points/*`, `/api/redemptions/*` | referral rewards service | Long-request proxy snippet. |
| `/purchase.html`, `/purchase/return/*`, `/pay-api/*`, `/api/pay/*` | payment service | `/api/pay` is rewritten to `/pay-api`. |
| `/api/v1/subscriptions/*/reset-quota`, `/v1/subscriptions/*/reset-quota` | quota reset service | Must stay before the generic API handler. |
| `/api/*`, `/v1/*`, `/responses*`, `/models*` | `sub2api` | `/responses/compact` is rewritten to `/v1/responses`. |
| Everything else | static SPA | Caddy serves a file or falls back to `/index.html` for Vue Router. |

### `www.zhisales.com`

| Path | Destination |
| --- | --- |
| `/checkout/*`, `/purchase/*`, `/pay-api/*` | payment service |
| `/api/referral/*`, `/api/points/*`, `/api/redemptions/*` | referral rewards service |
| User quota-reset paths above | quota reset service |
| Generic API, `/v1`, `/responses*`, `/models*` | `sub2api` |
| Everything else | static SPA |

### Other domains

| Domain | Purpose | Current check |
| --- | --- | --- |
| `aidoc.zhisales.com` | Static documentation site | HTTP 200 on 2026-08-01 |
| `apiv1.aitrack.io` | Caddy route to `sub2api` | Verify endpoint-level behavior before edits. |
| `apicd.aitrack.io` | API/proxy endpoint from historic handoff | Verify routing and ownership before release; it is not part of the SPA path. |

After any Caddy change:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Do not reload until validation succeeds. Recheck the affected public route
immediately afterward.

## 7. Service responsibilities and dependencies

### `sub2api`

- Owns users, sessions, API keys, subscriptions, groups, primary API gateway,
  PostgreSQL and Redis state.
- Is the system of record for subscription assignment/extension and balances.
- Current source is external to this repository. Capture its image tag,
  compose files, and change process before attempting an application release.

### Payment service

- Hosts the purchase/checkout flow and records payment orders in its own
  PostgreSQL database.
- Uses the Trading API to create/query Alipay page-payment orders and accepts
  `POST /pay-api/trading/notify` as the primary fulfillment trigger.
- Fulfillment is idempotent and uses `sub2api` admin endpoints for subscription
  assignment/extension or balance credit.
- Payment return-page checks and the background poller are compensating paths;
  they do not replace notification handling.
- If configured, it sends an idempotent `order-fulfilled` event to the rewards
  service after successful fulfillment.

### Referral rewards service

- Creates referral codes and relationships, grants points after paid eligible
  orders, and redeems points into `sub2api` subscriptions.
- Critical consistency rule: payment service
  `REFERRAL_REWARDS_INTERNAL_KEY` must equal rewards service
  `INTERNAL_API_KEY`.
- Rules are SKU-based and can be initialized with
  `npm run bootstrap:rules` using the payment catalog.

### Subscription quota reset service

- Handles only the user-facing quota-reset paths listed in section 6.
- Authenticates the user and subscription ownership, requires at least 24
  remaining hours, resets selected daily/weekly/monthly quota through `sub2api`
  admin APIs, then applies a one-day extension reduction.
- Admin quota reset routes remain with `sub2api`; do not route those through
  this service.

## 8. Configuration and secret inventory

Only the location and purpose of configuration are listed here. The values must
remain outside Git.

| Component | Files / variables to review |
| --- | --- |
| Caddy | `/etc/caddy/Caddyfile`; validate then reload after edits. |
| `sub2api` | Its production compose/config under `/opt/sub2api`; database and Redis settings; administrator access managed outside this repository. |
| Payment | `/opt/zhisales-pay-service/.env`, `catalog.json`, and service compose file. Required values include payment-provider credentials, database config, `SUB2API_*`, and optional referral callback config. |
| Referral rewards | `.env` with database config, `SUB2API_*`, `INTERNAL_API_KEY`, and `ADMIN_API_KEY`. |
| Quota reset | `/opt/subscription-reset-service/.env` with `SUB2API_BASE_URL`, admin credentials and `MINIMUM_REMAINING_HOURS`. |
| Frontend | Environment-free production static assets at `/var/www/zhisales-site`; public runtime settings are provided by `sub2api`'s settings API. |

The compose snapshots reveal two different external Docker network names for
payment versus referral/reset services. Before recreating any container, run
`docker network ls` and inspect the relevant compose file; do not "fix" a
network name blindly on a live host.

## 9. Standard operating procedures

### 9.1 Git workflow

The configured remote is `git@github.com:Chauncey-bot/LLM-gateway.git` and the
current release branch is `codex/dev`. Pushing code records a change; it does
not automatically release production unless a separate CI/CD integration is
added and documented.

```bash
git status --short
git add <intended-files>
git commit -m "type: concise change summary"
git push origin codex/dev
```

Before staging, inspect `git diff -- <file>` and never stage `.env`, keys,
build output, database dumps, or unrelated user changes.

### 9.2 Frontend release

The SPA uses content-hashed Vite chunks. The live `index.html` and all assets
must come from the same build. A partial upload can yield a `200 text/html`
response to a JavaScript module request because Caddy's SPA fallback serves
`index.html`; browsers then show a blank page.

```bash
cd frontend
npm ci
npm run build
cd ..
SSH_PRIVATE_KEY=/secure/path/production.pem ./scripts/deploy-frontend-static.sh
```

The script streams the entire `backend/internal/web/dist` tree to
`/var/www/zhisales-site` and fails if any local build file is absent remotely.
It does not delete unrelated server files. Perform a browser smoke test after
release:

```bash
curl -fsSI https://ai.zhisales.com/
curl -fsSI https://ai.zhisales.com/assets/<entry-file-from-index.html>
```

### 9.3 Payment service release and catalog update

1. Build and test the intended image from `zhisales-pay-service/`.
2. Transfer/release it using the approved image workflow; record image tag.
3. On the host, use the service's compose directory and recreate only the
   payment service after verifying its `.env`:

   ```bash
   cd /opt/zhisales-pay-service
   docker compose up -d --force-recreate zhisales-pay
   curl -fsS http://127.0.0.1:18190/health
   ```

4. Run a non-payment catalog check. Do not create a real charge solely as a
   deploy check.

`catalog.json` is a single bind-mounted file. A catalog edit does not take
effect until the payment container is recreated. For paid-but-unfulfilled
orders, use the documented admin fulfillment retry endpoint only with approved
admin credentials and record the affected order ID.

### 9.4 Referral rewards release

1. Build/release the image from `referral-rewards-service/`.
2. Confirm its `.env`, especially database access, `SUB2API_*`, internal/admin
   keys, and the external Docker network.
3. Recreate only the rewards service and check `http://127.0.0.1:18191/health`.
4. Run `npm run smoke:test` from a controlled environment using non-production
   test identifiers where possible.
5. If catalog SKUs changed, re-run or explicitly review rule bootstrapping;
   never overwrite customized economics without approval.

### 9.5 Quota reset release

Use the maintained script in `subscription-reset-service/deploy/`:

```bash
cd subscription-reset-service
PROD_HOST=18.143.67.94 \
PROD_USER=ubuntu \
PROD_KEY=/secure/path/production.pem \
PROD_DEPLOY_DIR=/opt/subscription-reset-service \
./deploy/build-and-deploy.sh
```

Then verify the local health endpoint and a single authorized user-path request.
If the public endpoint returns `404`, check that the reset Caddy matcher is
above the generic `/api/*` handler, then validate/reload Caddy.

## 10. Health checks and post-release acceptance

Run from the production host where possible:

```bash
for url in \
  http://127.0.0.1:18080/health \
  http://127.0.0.1:18190/health \
  http://127.0.0.1:18191/health \
  http://127.0.0.1:18192/health
do
  printf '%s ' "$url"
  curl -fsS -o /dev/null -w '%{http_code}\n' "$url"
done

curl -fsS -o /dev/null -w 'ai SPA %{http_code}\n' https://ai.zhisales.com/
curl -fsS -o /dev/null -w 'www purchase %{http_code}\n' https://www.zhisales.com/purchase
curl -fsS -o /dev/null -w 'docs %{http_code}\n' https://aidoc.zhisales.com/
```

For frontend changes, additionally open a clean browser context and verify:

- `/home` renders without `Failed to fetch dynamically imported module`.
- `/login` renders.
- A protected user/admin route renders after authorized login.
- The asset requested by the browser has a JavaScript or CSS MIME type, never
  `text/html`.

For payment changes, check catalog/display and order status API behavior with a
test-safe account. For referral changes, verify health, an authenticated
`/api/referral/me` request, and idempotency of a non-production callback. Do
not expose a test order or user token in tickets or logs.

## 11. Incident playbooks

### SPA blank page / module MIME error

Symptoms:

```text
Expected a JavaScript-or-Wasm module script but the server responded with MIME type text/html
Failed to fetch dynamically imported module
```

Cause: the `index.html` entrypoint references a content-hashed file absent from
the static directory, and the SPA fallback returns `index.html` for that asset.

Response:

1. Fetch the failing asset with `curl -fsSI <asset-url>`.
2. If the MIME type is `text/html`, build the frontend and run the complete
   frontend deployment procedure in section 9.2; never upload one guessed
   chunk as the permanent fix.
3. Compare the local and remote build file lists (the deploy script does this).
4. Test `/home` and `/login` in a new browser context, then refresh an affected
   browser tab. If it still holds a cached failed module, perform one hard reload
   after the server has been confirmed healthy.
5. Record the build commit, entry filename, missing asset and time in the
   incident note.

### Caddy route returns 404 or wrong backend

1. Check the exact matcher order in `/etc/caddy/Caddyfile`.
2. Verify the destination's loopback health endpoint.
3. Validate Caddy before reload.
4. Recheck both the public path and a nearby generic API path; a path-specific
   matcher must not accidentally shadow unrelated API routes.

### Payment is paid but not fulfilled

1. Check payment order status and fulfillment status.
2. Verify Trading notification/query logs and `sub2api` admin API reachability.
3. Use the documented idempotent admin fulfillment retry for the specific order
   only after confirming payment is actually paid.
4. Confirm the resulting subscription/balance in `sub2api` and then check the
   best-effort referral callback separately.

### Referral reward or redemption failure

1. Check rewards health and database connectivity.
2. Verify the internal callback key matches on payment and rewards services.
3. Inspect the reward/redemption rule for the exact SKU.
4. Use event/order IDs to confirm idempotency before retrying; do not manually
   credit points twice.

### User quota reset failure

1. Confirm the public request uses a user quota-reset path, not an admin route.
2. Check reset-service health, user token, subscription ownership and remaining
   time (minimum is normally 24 hours).
3. Verify Caddy's high-priority reset matcher and `sub2api` admin connectivity.
4. Do not manually shorten/extend a subscription until the request's existing
   result is known; the operation affects entitlement duration.

## 12. Rollback policy

1. Stop and identify the failing component; do not roll back unrelated services.
2. Preserve logs, image tag, commit, Caddy diff, and timestamps first.
3. For a frontend rollback, redeploy the last known-good **complete** static
   build. Do not mix a previous `index.html` with current assets.
4. For a container rollback, use a previously recorded, available image tag and
   its matching configuration; recreate only the affected compose service.
5. For Caddy rollback, restore the previous validated configuration, validate,
   reload, then re-run public route checks.
6. For database-affecting operations, pause and obtain an approved backup/
   rollback plan. Never `docker compose down -v`, remove volumes, or run schema
   rollback commands as an incident shortcut.

No automated release-directory or database rollback mechanism is documented in
this workspace. Establish and test one before making high-risk releases.

## 13. Open items and technical debt

- Reconcile the currently running `cliproxyapi` deployment with the
  `codex-proxy/` source snapshot and document its authoritative release process.
- Import or otherwise version the authoritative `sub2api` source/compose files;
  the current repository cannot independently reproduce that service.
- **Historical:** an earlier handoff reported `codex-proxy` account pool
  `total=6, active=1`. This was not rechecked during this handoff and should be
  verified against the currently running proxy service before prioritization.
- Add an explicit static-asset cache policy and a repeatable release artifact
  retention process. The complete-bundle deploy script prevents missing files,
  but retained releases improve rollback safety.
- Confirm backup ownership, retention, and restore test dates for all
  PostgreSQL-backed services.
- Add an owner/on-call contact, escalation path, and status dashboard link;
  those details are not present in this repository.

## 14. Change history

| Date | Change | Verification |
| --- | --- | --- |
| 2026-08-01 | Restored a complete frontend build after the live SPA was missing 48 dynamic chunks. | `/home` and `/login` rendered in a clean browser; affected user tab was refreshed. |
| 2026-08-01 | Added `scripts/deploy-frontend-static.sh`. | Script checks every locally built static file exists on the production host after upload. |
| 2026-08-01 | Verified Caddy configuration and service health endpoints. | Caddy validation passed; sub2api, payment, rewards, and reset health endpoints returned HTTP 200. |

## 15. New maintainer checklist

Before taking production ownership:

- [ ] Obtain approved access through the team's secret-management process.
- [ ] Read this file, root `README.md`, `IMPORT_NOTES.md`, and the target
      service README before changing a service.
- [ ] Confirm the source, image, compose file, environment file and data owner
      for the exact component being changed.
- [ ] Run the health checks in section 10 and record results.
- [ ] Validate a tested rollback path before a risky change.
- [ ] Release one component at a time and retain exact commit/image/build IDs.
- [ ] Update this HANDOFF with the verified release state, known limitations,
      and any routing/configuration change made during the work.
