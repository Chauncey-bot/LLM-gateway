# Referral Rewards Runbook (MVP)

## 1. Prepare env files

### Rewards service

```bash
cd referral-rewards-service
cp .env.example .env
```

Fill at least:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `SUB2API_BASE_URL`
- `SUB2API_ADMIN_EMAIL`
- `SUB2API_ADMIN_PASSWORD`
- `INTERNAL_API_KEY`
- `ADMIN_API_KEY`

### Payment service

```bash
cd ../zhisales-pay-service
cp .env.example .env
```

Add/confirm:

- `REFERRAL_REWARDS_BASE_URL`
- `REFERRAL_REWARDS_INTERNAL_KEY`

`REFERRAL_REWARDS_INTERNAL_KEY` must equal rewards service `INTERNAL_API_KEY`.

## 2. Install dependencies

```bash
cd referral-rewards-service
npm install

cd ../zhisales-pay-service
npm install
```

## 3. Start rewards service

### Local node mode

```bash
cd referral-rewards-service
npm start
```

Expected:

- startup creates DB tables automatically
- log shows `listening on :3000`

### Optional Docker mode

```bash
cd referral-rewards-service
docker compose up -d --build
```

## 4. Health check

Assuming local mapped port `18191`:

```bash
curl http://127.0.0.1:18191/health
```

Expected:

```json
{
  "status": "ok"
}
```

## 5. Seed initial rules

```bash
cd referral-rewards-service
ADMIN_API_KEY=your-admin-key npm run bootstrap:rules
```

This reads enabled subscription SKUs from:

- `../zhisales-pay-service/catalog.json`

Then seeds:

- reward rules
- redemption rules

## 6. Verify admin endpoints

```bash
curl -H "X-Admin-Key: your-admin-key" \
  http://127.0.0.1:18191/admin/reward-rules

curl -H "X-Admin-Key: your-admin-key" \
  http://127.0.0.1:18191/admin/redemption-rules
```

## 7. Start payment service

```bash
cd zhisales-pay-service
npm start
```

Or Docker:

```bash
docker compose up -d --build
```

## 8. Run smoke test

```bash
cd referral-rewards-service
REWARDS_BASE_URL=http://127.0.0.1:18191 \
ADMIN_API_KEY=your-admin-key \
INTERNAL_API_KEY=your-internal-key \
npm run smoke:test
```

What it checks:

- `/health`
- admin rule listing (if admin key provided)
- internal callback endpoint (if internal key provided)

## 9. Suggested UAT path

### UAT-1: invite profile

Call:

```bash
curl -H "Authorization: Bearer <USER_TOKEN>" \
  http://127.0.0.1:18191/api/referral/me
```

Verify:

- referral code exists
- invite URL exists
- points balance is returned

### UAT-2: bind B to A

Take A's `referral_code`, then use B token:

```bash
curl -X POST http://127.0.0.1:18191/api/referral/bind-registration \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <B_USER_TOKEN>" \
  -d '{"referral_code":"ABCD1234"}'
```

Verify admin side:

```bash
curl -H "X-Admin-Key: your-admin-key" \
  http://127.0.0.1:18191/admin/referrals
```

### UAT-3: reward callback

Simulate payment callback:

```bash
curl -X POST http://127.0.0.1:18191/internal/events/order-fulfilled \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: your-internal-key" \
  -d '{
    "event_id":"uat-evt-001",
    "order_id":"uat-order-001",
    "buyer_user_id":<B_USER_ID>,
    "sku_code":"coding-plan-daily-80",
    "amount_cents":20000,
    "fulfilled_at":"2026-04-13T18:00:00.000Z"
  }'
```

Verify:

- reward event status becomes `rewarded`
- A balance increases

### UAT-4: redeem catalog

```bash
curl -H "Authorization: Bearer <A_USER_TOKEN>" \
  http://127.0.0.1:18191/api/redemptions/catalog
```

### UAT-5: redeem points

```bash
curl -X POST http://127.0.0.1:18191/api/redemptions/redeem \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <A_USER_TOKEN>" \
  -d '{"sku_code":"coding-plan-daily-80"}'
```

Verify admin side:

```bash
curl -H "X-Admin-Key: your-admin-key" \
  http://127.0.0.1:18191/admin/redemption-orders
```

## 10. Common failure points

### `401 Unauthorized`

Usually means:

- invalid user Bearer token, or
- `sub2api` base URL is wrong

### `403 Invalid internal API key`

Check:

- `REFERRAL_REWARDS_INTERNAL_KEY` in payment service
- `INTERNAL_API_KEY` in rewards service

They must match.

### `Missing sub2api admin credentials`

Set:

- `SUB2API_ADMIN_EMAIL`
- `SUB2API_ADMIN_PASSWORD`

### reward event ignored

Likely causes:

- B not bound to any referrer
- reward rule not enabled for that SKU
- wrong `sku_code`

## 11. Recommended first production rollout order

1. Deploy rewards service only
2. Pass `/health`
3. Seed rules
4. Manually test bind + simulated callback
5. Enable payment callback env in payment service
6. Test one small real SKU flow
7. Observe reward events and redemption orders
