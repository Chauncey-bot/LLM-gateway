# Referral Rewards Frontend Integration Checklist

This note assumes:

- existing user identity remains in `sub2api`
- rewards backend is `referral-rewards-service`
- payment backend remains `zhisales-pay-service`

## 1. Registration page integration

Goal: bind B's referrer when B registers through A's invite link.

### Frontend behavior

1. On entry to registration page, read `ref` from querystring
2. Persist it temporarily in browser storage (sessionStorage is enough)
3. After registration succeeds and user is authenticated, call one of:
   - `POST /api/referral/bind-registration` with Bearer token, or
   - ask registration backend to call `POST /internal/referrals/bind-registration`
4. Clear cached `ref` after successful bind or explicit conflict handling

### Recommendation

Prefer backend/internal binding when possible because it is more reliable than depending on the browser surviving redirect/login flow.

## 2. User center / referral center integration

Add a simple section in the user center:

### Data source

`GET /api/referral/me`

### Show

- current points balance
- referral code
- invite link
- invited count
- rewarded purchase count

### Suggested actions

- copy invite link
- copy referral code
- open points history
- open redeemable plans

## 3. Points history page

Data source:

`GET /api/points/ledger?page=1&page_size=20`

### Suggested columns

- time
- direction
- amount
- type
- remark
- balance after change

## 4. Redemption catalog page

Data source:

`GET /api/redemptions/catalog`

### Suggested card fields

- title
- description
- cash price (optional reference)
- points cost
- validity days

### CTA

- button: redeem now
- disabled if user points are insufficient (requires current points balance from `/api/referral/me`)

## 5. Redeem action

Action endpoint:

`POST /api/redemptions/redeem`

Request body:

```json
{
  "sku_code": "coding-plan-daily-80"
}
```

### UX recommendation

- ask for confirmation before submit
- show loading state
- on success, refresh:
  - `/api/referral/me`
  - `/api/points/ledger`
  - redemption status if shown

## 6. Conflict handling to surface nicely

### Registration bind conflict

If B already has a referrer, bind may return conflict. UI should show a calm message like:

- "This account already has a referrer bound."

### Insufficient points

For redeem failure:

- show exact backend message when safe
- recommended fallback: "Not enough points to redeem this plan."

## 7. Recommended MVP UI order

1. Add referral summary card in user center
2. Add copy invite link action
3. Add points ledger page/modal
4. Add redemption catalog page
5. Add redeem action with confirmation
6. Only later add admin UI
