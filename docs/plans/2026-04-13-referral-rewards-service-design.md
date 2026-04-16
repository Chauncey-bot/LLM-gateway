# Referral Rewards Service Design

Date: 2026-04-13
Status: Draft validated in chat
Scope: New standalone referral rewards + points redemption service
Constraints:
- Do not modify `codex-proxy`
- Reuse existing `sub2api` user system
- Integrate with existing `zhisales-pay-service`

## 1. Goal

Build a standalone referral rewards service where:

- User A shares a registration link containing A's referral identity
- User B registers through that link and is bound to A as the referrer
- When B successfully purchases configured SKUs, A receives configurable reward points
- Reward points are configured per SKU
- SKUs can have both a cash purchase price and a points redemption price
- User A can redeem points for subscription plans
- Recommendation relationships can only be corrected in the admin backend
- Points do not expire in V1

## 2. Selected approach

Chosen approach: **Option A — standalone referral rewards service + callback from payment service**.

### Why

- Keeps referral / points / redemption logic separate from payment concerns
- Avoids touching `codex-proxy`
- Reuses existing `sub2api` identity and fulfillment capabilities
- Lets `zhisales-pay-service` notify the new service after payment + fulfillment success
- Easier to evolve into a larger rewards center later

## 3. Service boundary

Proposed new module/service:

- `referral-rewards-service/`

Responsibilities:

1. Referral identity and invite link generation
2. Referral relationship binding and admin correction
3. Points account balance management
4. Points ledger / audit trail
5. Reward rule configuration by SKU
6. Redemption rule configuration by SKU
7. Processing order-fulfilled callbacks from payment service
8. Redeeming points into subscriptions by calling `sub2api` admin APIs

Out of scope for V1:

- Multi-level referral trees
- Points expiration
- Cashback / coupon / wallet integration
- Separate user authentication system
- Complex anti-fraud scoring

## 4. Identity model

Identity source: existing `sub2api` users.

This service should not create its own user system.
Instead, it should store and operate on `sub2api user_id` as the primary foreign identity.

This means:

- Invite ownership belongs to an existing `sub2api user_id`
- Referral relationships are between two `sub2api` users
- Points accounts are keyed by `sub2api user_id`
- Redemption fulfillment uses the existing `sub2api` admin APIs

## 5. Business rules confirmed

1. A shares a registration link containing A's referral info
2. B registers through that link, and B's referrer is recorded as A
3. Referral relationship is established on registration, not on purchase
4. Referral relationship is only editable by admin/backend
5. Reward points are configured **per SKU**
6. Only configured SKUs participate in referral rewards
7. Each successful purchase of a configured SKU by B grants points to A
8. A SKU can have both:
   - cash purchase price
   - points redemption price
9. Points can be used to redeem subscription plans
10. Points do not expire in V1

## 6. Data model

### 6.1 `referral_profiles`
Stores each user's referral identity.

Suggested fields:

- `user_id` bigint primary key
- `referral_code` varchar unique not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Notes:

- `invite_url` can be built dynamically from `referral_code`
- Create row lazily on first access if desired

### 6.2 `referral_relationships`
Stores who referred whom.

Suggested fields:

- `id` bigserial primary key
- `referred_user_id` bigint not null unique
- `referrer_user_id` bigint not null
- `source_code` varchar not null
- `status` varchar not null default 'active'
- `bound_at` timestamptz not null default now()
- `corrected_by` bigint null
- `corrected_at` timestamptz null
- `correct_reason` text null

Constraints:

- `referred_user_id` should only have one active relationship in V1
- Reject self-referral where `referred_user_id = referrer_user_id`

### 6.3 `points_accounts`
Stores current point balances.

Suggested fields:

- `user_id` bigint primary key
- `balance` integer not null default 0
- `total_earned` integer not null default 0
- `total_spent` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Notes:

- Balance is the current materialized state
- Source of truth should still be the ledger

### 6.4 `points_ledger`
Stores every points movement.

Suggested fields:

- `id` bigserial primary key
- `user_id` bigint not null
- `direction` varchar not null  -- `credit` / `debit`
- `amount` integer not null
- `balance_after` integer not null
- `type` varchar not null       -- `referral_reward` / `redeem_subscription` / `manual_adjust`
- `reference_type` varchar null
- `reference_id` varchar null
- `remark` text null
- `created_at` timestamptz not null default now()

Notes:

- This is the audit backbone of the system
- Never mutate historical records except for emergency admin repair procedures

### 6.5 `reward_rules`
Stores reward settings per SKU.

Suggested fields:

- `sku_code` varchar primary key
- `enabled` boolean not null default false
- `reward_points_per_purchase` integer not null default 0
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

### 6.6 `redemption_rules`
Stores redemption settings per SKU.

Suggested fields:

- `sku_code` varchar primary key
- `enabled` boolean not null default false
- `points_cost` integer not null
- `group_id` bigint not null
- `validity_days` integer not null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

### 6.7 `reward_events`
Used for callback idempotency and reward processing state.

Suggested fields:

- `id` bigserial primary key
- `event_key` varchar unique not null
- `order_id` varchar not null
- `buyer_user_id` bigint not null
- `referrer_user_id` bigint null
- `sku_code` varchar not null
- `status` varchar not null
- `payload` jsonb null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Suggested statuses:

- `ignored`
- `rewarded`
- `failed`

### 6.8 `redemption_orders`
Tracks points-based redemption attempts and results.

Suggested fields:

- `id` bigserial primary key
- `redeem_no` varchar unique not null
- `user_id` bigint not null
- `sku_code` varchar not null
- `points_cost` integer not null
- `status` varchar not null
- `subscription_id` bigint null
- `error_message` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

Suggested statuses:

- `pending`
- `fulfilled`
- `failed`

## 7. Core flows

### 7.1 Registration binding flow

1. User A obtains invite link containing `ref=<referral_code>`
2. User B enters registration flow through that link
3. After B registration succeeds, service resolves `referral_code -> A user_id`
4. Service writes a `referral_relationships` row for B
5. If B already has a relationship, ignore duplicate binding
6. If A == B, reject binding
7. No points are awarded at registration time

### 7.2 Purchase reward flow

1. `zhisales-pay-service` marks payment fulfilled successfully
2. Payment service calls `POST /internal/events/order-fulfilled`
3. New service verifies internal auth / signature
4. New service checks idempotency by `event_id` or `order_id`
5. Resolve buyer's referrer
6. Load `reward_rules` by `sku_code`
7. If reward disabled or no referrer exists, mark event `ignored`
8. If valid:
   - create / lock referrer's points account
   - credit configured points
   - write `points_ledger`
   - update `points_accounts`
   - write `reward_events` as `rewarded`

### 7.3 Points redemption flow

1. User queries redeemable catalog
2. User submits `sku_code` to redeem
3. Service validates:
   - SKU enabled for redemption
   - sufficient points balance
4. Start DB transaction
5. Create `redemption_orders` in `pending`
6. Debit points account and write ledger
7. Call `sub2api` admin API to assign or extend subscription
8. If fulfillment succeeds:
   - mark redemption `fulfilled`
   - persist returned subscription id when available
9. If fulfillment fails:
   - rollback if still inside transaction and side effect not committed
   - or mark failed and run compensation if debit already persisted

## 8. API surface

### 8.1 User-facing APIs

#### `GET /api/referral/me`
Returns:

- `referral_code`
- `invite_url`
- `invited_count`
- `rewarded_purchase_count`
- `points_balance`

#### `GET /api/points/ledger?page=1&page_size=20`
Returns paginated points ledger records.

#### `GET /api/redemptions/catalog`
Returns redeemable SKU list:

- `sku_code`
- `title`
- `points_cost`
- `group_id`
- `validity_days`

#### `POST /api/redemptions/redeem`
Request:

```json
{
  "sku_code": "coding-plan-daily-80"
}
```

Response includes:

- success/failure
- points deducted
- redemption record id / redeem no
- fulfilled subscription info if available

### 8.2 Internal callback API

#### `POST /internal/events/order-fulfilled`
Suggested request:

```json
{
  "event_id": "evt_20260413_001",
  "order_id": "ZSALI20260413123456ABCD",
  "buyer_user_id": 123,
  "sku_code": "coding-plan-daily-80",
  "amount_cents": 20000,
  "fulfilled_at": "2026-04-13T17:00:00.000Z"
}
```

Auth:

- `X-Internal-Key`
- `X-Request-Id`

### 8.3 Admin APIs

#### `PUT /admin/reward-rules/:sku_code`
Configure reward points per SKU.

#### `PUT /admin/redemption-rules/:sku_code`
Configure redemption points cost per SKU.

#### `PUT /admin/referrals/:referred_user_id`
Correct referral relationship.

#### `POST /admin/points/adjust`
Manual points adjustment with audit reason.

## 9. Integration with existing services

### 9.1 `zhisales-pay-service` -> new service

Integration point:

- after order is paid and fulfillment succeeds
- call `POST /internal/events/order-fulfilled`

This should happen only after the payment service has already confirmed and fulfilled the order successfully.

### 9.2 new service -> `sub2api`

Use existing admin APIs for subscription fulfillment:

- assign subscription
- extend subscription

The exact endpoint choice depends on SKU mapping and current user subscription state.

## 10. Security and correctness requirements

### Required V1 protections

1. **Idempotency**
   - repeated callback must not duplicate points
   - repeated redeem submission must not duplicate fulfillment

2. **Self-referral prevention**
   - A cannot refer A

3. **Ledger-first accounting**
   - all balance changes require a ledger row

4. **Admin-only correction**
   - user cannot alter referrer after registration

5. **Internal callback authentication**
   - shared secret via `X-Internal-Key`
   - optional future HMAC body signature

6. **Transactional consistency**
   - points debit / credit and event state should commit atomically where possible

## 11. V1 risk points

1. **Duplicate callback delivery**
   - solved with `event_id` / `order_id` idempotency

2. **Fulfillment partial failure on redemption**
   - must avoid "deducted points but no subscription"
   - use transaction + compensation strategy

3. **Wrong referral binding during registration**
   - need a clean place in registration flow to persist the referral source

4. **SKU drift across systems**
   - `reward_rules` and `redemption_rules` should use the same canonical `sku_code` as the payment service catalog

5. **Account visibility split**
   - because identity is reused from `sub2api`, auth/session validation must be consistent with existing token model

## 12. Recommended V1 scope

Ship in this order:

### Phase 1 — backend foundation

- scaffold new service
- DB schema + migrations
- referral profile generation
- referral relationship binding
- points accounts + ledger
- reward rules + redemption rules CRUD

### Phase 2 — reward callback

- internal callback endpoint
- integrate callback from `zhisales-pay-service`
- idempotent reward granting
- admin inspection of reward events

### Phase 3 — points redemption

- redemption catalog API
- redeem API
- `sub2api` fulfillment integration
- compensation / failure handling

### Phase 4 — user-facing UI

- invite link display
- points balance
- ledger history
- redeemable catalog
- redeem action UX

## 13. Recommended first implementation milestone list

1. Create `referral-rewards-service/` skeleton
2. Add PostgreSQL schema + startup migration logic
3. Implement `/api/referral/me`
4. Implement referral binding write path for registration success
5. Implement points account + ledger helpers
6. Implement `/internal/events/order-fulfilled`
7. Patch `zhisales-pay-service` to call callback after successful fulfillment
8. Implement redemption rules + `/api/redemptions/catalog`
9. Implement `/api/redemptions/redeem`
10. Add minimal admin APIs for correction and rule config

## 14. Testing strategy

### Unit tests

- referral code generation uniqueness
- self-referral rejection
- account balance updates from ledger writes
- reward rule resolution by SKU
- redemption insufficient balance checks

### Integration tests

- registration binding writes relationship once
- duplicate callback only rewards once
- reward callback with no referrer is ignored
- redemption success deducts points and fulfills subscription
- redemption failure does not leave unrecoverable inconsistent state

### Manual verification

1. A fetches invite link
2. B registers using A's link
3. B purchases configured SKU
4. A receives configured points exactly once per paid order
5. A redeems points for subscription successfully

## 15. Implementation recommendation

Proceed with a lightweight Node.js service consistent with the existing `zhisales-pay-service` style:

- runtime: Node.js
- server: Express or Hono (either is fine; Express matches current payment service style)
- database: PostgreSQL
- auth model: reuse existing `sub2api` bearer token / user identity resolution flow

If implementation continues immediately, the next step should be:

**create the new service folder and scaffold Phase 1 foundation without touching `codex-proxy`.**
