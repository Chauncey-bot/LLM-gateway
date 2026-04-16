# Referral Rewards Command Pack

This is a copy-paste-friendly command pack for MVP validation.

Assumptions:

- rewards service URL: `http://127.0.0.1:18191`
- payment service URL: `http://127.0.0.1:18190`
- `sub2api` URL: `http://127.0.0.1:18080`
- rewards service is already started
- rules are already seeded or created

---

## 0. Set environment variables

Replace placeholders before running.

```bash
export REWARDS_BASE_URL="http://127.0.0.1:18191"
export PAY_BASE_URL="http://127.0.0.1:18190"
export SUB2API_BASE_URL="http://127.0.0.1:18080"

export ADMIN_API_KEY="your-admin-key"
export INTERNAL_API_KEY="your-internal-key"

export A_USER_TOKEN="paste-a-user-bearer-token-here"
export B_USER_TOKEN="paste-b-user-bearer-token-here"

# Fill these after you know them
export A_USER_ID=""
export B_USER_ID=""
export A_REFERRAL_CODE=""
```

---

## 1. Service health checks

### Rewards

```bash
curl "$REWARDS_BASE_URL/health"
```

### Payment

```bash
curl "$PAY_BASE_URL/health"
```

---

## 2. Inspect current admin configuration

### Reward rules

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/reward-rules"
```

### Redemption rules

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/redemption-rules"
```

### Referral relationships

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/referrals"
```

### Points accounts

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/points/accounts"
```

---

## 3. Get A's referral info

```bash
curl -H "Authorization: Bearer $A_USER_TOKEN" \
  "$REWARDS_BASE_URL/api/referral/me"
```

Expected fields:

- `referral_code`
- `invite_url`
- `points_balance`

Then set:

```bash
export A_REFERRAL_CODE="copy-from-response"
```

---

## 4. Bind B to A using the referral code

### User-side bind

```bash
curl -X POST "$REWARDS_BASE_URL/api/referral/bind-registration" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $B_USER_TOKEN" \
  -d "{\"referral_code\":\"$A_REFERRAL_CODE\"}"
```

### Verify binding in admin list

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/referrals"
```

If you already know B's user id and want to bind from backend/internal path instead:

```bash
curl -X POST "$REWARDS_BASE_URL/internal/referrals/bind-registration" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: $INTERNAL_API_KEY" \
  -d "{\"referred_user_id\":$B_USER_ID,\"referral_code\":\"$A_REFERRAL_CODE\"}"
```

---

## 5. Simulate a reward event for B purchase

Choose a SKU that already has an enabled reward rule, for example:

- `coding-plan-daily-80`

```bash
curl -X POST "$REWARDS_BASE_URL/internal/events/order-fulfilled" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: $INTERNAL_API_KEY" \
  -d "{
    \"event_id\": \"uat-evt-001\",
    \"order_id\": \"uat-order-001\",
    \"buyer_user_id\": $B_USER_ID,
    \"sku_code\": \"coding-plan-daily-80\",
    \"amount_cents\": 20000,
    \"fulfilled_at\": \"2026-04-13T18:00:00.000Z\"
  }"
```

Expected:

- response shows `rewarded: true`
- `referrer_user_id` is A

### Verify reward event

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/reward-events"
```

### Verify A balance

```bash
curl -H "Authorization: Bearer $A_USER_TOKEN" \
  "$REWARDS_BASE_URL/api/referral/me"
```

### Verify A ledger

```bash
curl -H "Authorization: Bearer $A_USER_TOKEN" \
  "$REWARDS_BASE_URL/api/points/ledger?page=1&page_size=20"
```

---

## 6. Prove idempotency

Re-run the exact same reward callback:

```bash
curl -X POST "$REWARDS_BASE_URL/internal/events/order-fulfilled" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: $INTERNAL_API_KEY" \
  -d "{
    \"event_id\": \"uat-evt-001\",
    \"order_id\": \"uat-order-001\",
    \"buyer_user_id\": $B_USER_ID,
    \"sku_code\": \"coding-plan-daily-80\",
    \"amount_cents\": 20000,
    \"fulfilled_at\": \"2026-04-13T18:00:00.000Z\"
  }"
```

Expected:

- response should show `idempotent: true` or no duplicate reward effect
- A balance should not increase again

---

## 7. Inspect redemption catalog for A

```bash
curl -H "Authorization: Bearer $A_USER_TOKEN" \
  "$REWARDS_BASE_URL/api/redemptions/catalog"
```

Pick a SKU that has an enabled redemption rule.

---

## 8. If needed, manually top up A points for redemption testing

If A balance is not enough yet, adjust manually:

```bash
curl -X POST "$REWARDS_BASE_URL/admin/points/adjust" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d "{
    \"user_id\": $A_USER_ID,
    \"amount\": 5000,
    \"remark\": \"UAT top-up for redemption test\"
  }"
```

Verify:

```bash
curl -H "Authorization: Bearer $A_USER_TOKEN" \
  "$REWARDS_BASE_URL/api/referral/me"
```

---

## 9. Redeem a subscription for A

```bash
curl -X POST "$REWARDS_BASE_URL/api/redemptions/redeem" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A_USER_TOKEN" \
  -d '{"sku_code":"coding-plan-daily-80"}'
```

Expected:

- `success: true`
- `redeem_no`
- `points_cost`
- `balance_after`
- fulfillment info

### Verify redemption order

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/redemption-orders"
```

### Verify A ledger after redemption

```bash
curl -H "Authorization: Bearer $A_USER_TOKEN" \
  "$REWARDS_BASE_URL/api/points/ledger?page=1&page_size=20"
```

---

## 10. Full real payment path (optional after simulation)

Once simulated callback works:

1. Make sure `zhisales-pay-service/.env` has:
   - `REFERRAL_REWARDS_BASE_URL`
   - `REFERRAL_REWARDS_INTERNAL_KEY`
2. restart payment service
3. let B place a real order for a reward-enabled SKU
4. after payment fulfillment, verify:
   - reward event appears in `/admin/reward-events`
   - A balance increases

---

## 11. Common quick checks

### Reward callback says ignored

Check:

```bash
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/referrals"

curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  "$REWARDS_BASE_URL/admin/reward-rules"
```

Likely reasons:

- B is not bound to A
- SKU reward rule not enabled
- wrong `buyer_user_id`
- wrong `sku_code`

### Redemption fails

Check:

- A has enough points
- redemption rule is enabled
- `SUB2API_ADMIN_EMAIL` / `SUB2API_ADMIN_PASSWORD` are correct
- `SUB2API_BASE_URL` is reachable

---

## 12. Recommended UAT order

1. health check
2. bootstrap rules
3. A gets referral code
4. B binds to A
5. simulate one reward callback
6. verify A balance and ledger
7. simulate duplicate callback and verify idempotency
8. redeem one SKU
9. only then switch to real payment flow
