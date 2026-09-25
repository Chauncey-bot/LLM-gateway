# Referral Rewards Service

Standalone referral rewards + points redemption service.

## What it does

- Reuses existing `sub2api` user identity
- Maps an agent account to a wildcard subdomain without creating a second account system
- Creates and resolves invite referral codes
- Binds referral relationships on registration
- Grants points to the referrer when the referred user buys configured SKUs
- Lets users redeem points for subscription plans
- Calls `sub2api` admin APIs for fulfillment

## Main endpoints

- `GET /health`
- `GET /api/site/context` (resolves the current Host to an agent account)
- `GET /api/referral/me`
- `POST /api/referral/bind-registration`
- `GET /api/points/ledger`
- `GET /api/redemptions/catalog`
- `POST /api/redemptions/redeem`
- `POST /internal/events/order-fulfilled`
- `GET /admin/agent-subdomains`
- `POST /admin/agent-subdomains`
- `DELETE /admin/agent-subdomains/:subdomain`
- `PUT /admin/reward-rules/:sku_code`
- `PUT /admin/redemption-rules/:sku_code`
- `GET /admin/referrals`
- `PUT /admin/referrals/:referred_user_id`
- `GET /admin/points/accounts`
- `GET /admin/reward-events`
- `GET /admin/redemption-orders`
- `POST /admin/points/adjust`

## Notes

- Points do not expire in V1.
- Reward callbacks are idempotent by `event_id` (or fallback `order_id`).
- Referral relationships can only be corrected via admin APIs.
- The service expects access to the same SKU catalog used by `zhisales-pay-service`.
- Set `AGENT_SITE_BASE_DOMAIN` to the base domain used by the wildcard DNS record. An agent site is addressed as `https://{subdomain}.{AGENT_SITE_BASE_DOMAIN}`.
- The public registration binding endpoint prefers the active agent subdomain from the request Host. The internal binding endpoint accepts `subdomain` or `host`; `referral_code` remains supported for the existing registration flow.
- Authenticated rewards requests on an active agent subdomain also perform a best-effort one-time bind. This keeps the existing registration UI unchanged while ensuring a newly registered user is bound when the dashboard or referral center loads.

## Agent subdomain setup

Create a wildcard DNS record and route it to the same frontend/backend entry point:

```text
*.zhisales.com  -> existing site entry point
```

Then an administrator can assign a subdomain to an existing account:

```bash
curl -X POST https://rewards.example.internal/admin/agent-subdomains \
  -H 'X-Admin-Key: your-admin-key' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": 1001, "subdomain": "a123"}'
```

If `subdomain` is omitted, the user's existing referral code is used when it is a valid DNS label.

## Bootstrap rules

A helper script is included to seed reward and redemption rules from enabled subscription SKUs in `zhisales-pay-service/catalog.json`.

```bash
ADMIN_API_KEY=your-admin-key npm run bootstrap:rules
```

Default seeding rule:

- reward points = `amount_cents / 100`
- redemption points = `amount_cents / 10`

Adjust the generated rules afterward if you need different economics.

## Smoke test

```bash
REWARDS_BASE_URL=http://127.0.0.1:18191 \
ADMIN_API_KEY=your-admin-key \
INTERNAL_API_KEY=your-internal-key \
npm run smoke:test
```

This verifies basic availability of:

- `/health`
- admin list endpoints
- internal order callback endpoint
