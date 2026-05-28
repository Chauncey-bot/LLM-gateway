# ZhiSales Payment Service

Independent purchase page and payment bridge for the current `sub2api` skin.

## What it does

- Serves the external purchase page at `/purchase`
- Validates the current logged-in `sub2api` user via embedded token
- Creates Alipay page-payment orders via the Trading open API
- Queries Trading order status via the documented `opt=order_query` API
- Stores orders in a dedicated PostgreSQL database
- Exposes order status APIs for the return page
- Prepares fulfillment hooks for:
  - `POST /api/v1/admin/subscriptions/assign`
  - `POST /api/v1/admin/subscriptions/:id/extend`
  - `POST /api/v1/admin/users/:id/balance`

## Payment confirmation

The service now confirms payments through the Trading open API query endpoint:

- request path: `POST /trade`
- request parameter: `opt=order_query`
- response signature verification uses only `code`, `message`, and the raw `data` string

It also registers an asynchronous notify callback at:

- `POST /pay-api/trading/notify`

This notify endpoint is the primary fulfillment trigger. The return page and the background
poller remain as compensating paths.

When a query returns a paid status, the service will run the existing fulfillment hooks
idempotently and mark the order as `fulfilled`.

Order status payloads exposed by `/pay-api/orders/:merchantOrderId`,
`/pay-api/orders/:merchantOrderId/check`, and the return page now include both:

- payment status: `paid` / `pending` / `closed` / `failed` / `refunded`
- fulfillment status: `pending` / `fulfilled` / `fulfillment_failed`

## Referral rewards callback

If both of the following env vars are configured, the payment service will notify the
standalone referral rewards service after an order is successfully fulfilled:

- `REFERRAL_REWARDS_BASE_URL`
- `REFERRAL_REWARDS_INTERNAL_KEY`

Callback target:

- `POST /internal/events/order-fulfilled`

The callback is best-effort and idempotent by `event_id` / `order_id`. A callback failure
will be logged, but it will not roll back payment fulfillment.

## Catalog

Edit `catalog.json` and set:

- `enabled: true`
- `amount_cents`

before exposing a SKU to real users.
