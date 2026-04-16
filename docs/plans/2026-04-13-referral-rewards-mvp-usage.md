# Referral Rewards MVP - Usage & Integration Notes

## 1) Environment setup

### `referral-rewards-service/.env`

Copy from `.env.example` and fill:

- DB connection (`DB_*`)
- `SUB2API_BASE_URL`
- `SUB2API_ADMIN_EMAIL`
- `SUB2API_ADMIN_PASSWORD`
- `INTERNAL_API_KEY`
- `ADMIN_API_KEY`

### `zhisales-pay-service/.env`

Add:

- `REFERRAL_REWARDS_BASE_URL=http://referral-rewards:3000` (or your reachable URL)
- `REFERRAL_REWARDS_INTERNAL_KEY=<same as INTERNAL_API_KEY>`

## 2) Boot services

```bash
# rewards
cd referral-rewards-service
cp .env.example .env
# edit .env
npm install
npm start

# payment
cd ../zhisales-pay-service
cp .env.example .env
# edit .env
npm install
npm start
```

## 3) Configure rules (admin)

Assume:

- `ADMIN_API_KEY=your-admin-key`
- rewards service at `http://127.0.0.1:18191`

### Reward points per SKU

```bash
curl -X PUT "http://127.0.0.1:18191/admin/reward-rules/coding-plan-daily-80" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"enabled": true, "reward_points_per_purchase": 100}'
```

### Redemption rule per SKU

```bash
curl -X PUT "http://127.0.0.1:18191/admin/redemption-rules/coding-plan-daily-80" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: your-admin-key" \
  -d '{"enabled": true, "points_cost": 1500, "group_id": 10, "validity_days": 30}'
```

## 4) Registration binding

### User-side binding (Bearer = B's token)

```bash
curl -X POST "http://127.0.0.1:18191/api/referral/bind-registration" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <B_USER_TOKEN>" \
  -d '{"referral_code": "ABCD1234"}'
```

### Internal binding (from registration backend)

```bash
curl -X POST "http://127.0.0.1:18191/internal/referrals/bind-registration" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: your-internal-key" \
  -d '{"referred_user_id": 123, "referral_code": "ABCD1234"}'
```

## 5) Payment callback contract

`zhisales-pay-service` now calls:

- `POST /internal/events/order-fulfilled`

Payload shape:

```json
{
  "event_id": "pay-order-fulfilled:ZSALI20260413123456ABCD",
  "order_id": "ZSALI20260413123456ABCD",
  "buyer_user_id": 123,
  "sku_code": "coding-plan-daily-80",
  "amount_cents": 20000,
  "fulfilled_at": "2026-04-13T17:00:00.000Z"
}
```

Idempotency:

- keyed by `event_id` (fallback `order_id`)

## 6) User APIs

- `GET /api/referral/me`
- `GET /api/points/ledger?page=1&page_size=20`
- `GET /api/redemptions/catalog`
- `POST /api/redemptions/redeem`

## 7) Admin observability APIs

- `GET /admin/referrals`
- `GET /admin/points/accounts`
- `GET /admin/reward-events`
- `GET /admin/redemption-orders`
- `POST /admin/points/adjust`

## 8) Suggested first UAT path

1. Create reward rule and redemption rule for one SKU
2. A fetches invite profile (`/api/referral/me`) and gets code
3. B binds via `/api/referral/bind-registration`
4. B buys target SKU and payment service fulfills order
5. Verify A points increased and reward event status = `rewarded`
6. A redeems points
7. Verify redemption order status = `fulfilled`
