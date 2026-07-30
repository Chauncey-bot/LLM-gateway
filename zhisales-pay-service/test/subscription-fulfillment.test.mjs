import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrderFulfillmentRequest,
  buildOrderFulfillmentRequests,
  buildSubscriptionFulfillmentRequest,
} from "../subscription-fulfillment.mjs";

test("uses extend when a matching subscription already exists", () => {
  const order = {
    merchant_order_id: "ZSALI202605230001",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
  };
  const subscriptions = [
    { id: 9988, group_id: 10, status: "active", expires_at: "2026-06-01T00:00:00Z" },
  ];

  const result = buildSubscriptionFulfillmentRequest(order, subscriptions);

  assert.equal(result.operation, "extend");
  assert.equal(result.path, "/api/v1/admin/subscriptions/9988/extend");
  assert.deepEqual(result.body, { days: 30 });
});

test("falls back to assign when no matching subscription exists", () => {
  const order = {
    merchant_order_id: "ZSALI202605230002",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
  };
  const subscriptions = [
    { id: 9988, group_id: 5, expires_at: "2026-06-01T00:00:00Z" },
  ];

  const result = buildSubscriptionFulfillmentRequest(order, subscriptions);

  assert.equal(result.operation, "assign");
  assert.equal(result.path, "/api/v1/admin/subscriptions/assign");
  assert.deepEqual(result.body, {
    user_id: 123,
    group_id: 10,
    validity_days: 30,
    notes: "payment:ZSALI202605230002",
  });
});

test("builds a full subscription fulfillment request for an existing subscription", () => {
  const order = {
    merchant_order_id: "ZSALI202605230003",
    sku_type: "subscription",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
  };
  const subscriptions = [
    { id: 9988, group_id: 10, status: "active", expires_at: "2026-06-01T00:00:00Z" },
  ];

  const result = buildOrderFulfillmentRequest(order, subscriptions);

  assert.deepEqual(result, {
    skuType: "subscription",
    operation: "extend",
    path: "/api/v1/admin/subscriptions/9988/extend",
    body: { days: 30 },
  });
});

test("prefers an active subscription over an expired one in the same group", () => {
  const order = {
    merchant_order_id: "ZSALI202605230005",
    sku_type: "subscription",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
  };
  const subscriptions = [
    {
      id: 1001,
      group_id: 10,
      status: "expired",
      expires_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    },
    {
      id: 2002,
      group_id: 10,
      status: "active",
      expires_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-05-20T00:00:00Z",
    },
  ];

  const result = buildOrderFulfillmentRequest(order, subscriptions);

  assert.deepEqual(result, {
    skuType: "subscription",
    operation: "extend",
    path: "/api/v1/admin/subscriptions/2002/extend",
    body: { days: 30 },
  });
});

test("builds a balance top-up fulfillment request", () => {
  const order = {
    merchant_order_id: "ZSALI202605230004",
    sku_type: "balance",
    user_id: 123,
    balance_amount: 50,
  };

  const result = buildOrderFulfillmentRequest(order);

  assert.deepEqual(result, {
    skuType: "balance",
    operation: "add",
    path: "/api/v1/admin/users/123/balance",
    body: {
      balance: 50,
      operation: "add",
      notes: "payment:ZSALI202605230004",
    },
  });
});

test("builds a top-up balance fulfillment request for a designated subscription sku", () => {
  const order = {
    merchant_order_id: "ZSALI202605230006",
    sku_type: "subscription",
    user_id: 123,
    group_id: 5,
    validity_days: 1,
    balance_amount: 100,
  };

  const result = buildOrderFulfillmentRequest(order, []);

  assert.deepEqual(result, {
    skuType: "balance",
    operation: "add",
    path: "/api/v1/admin/users/123/balance",
    body: {
      balance: 100,
      operation: "add",
      notes: "payment:ZSALI202605230006",
    },
  });
});

test("builds a balance top-up and subscription request for a designated subscription sku", () => {
  const order = {
    merchant_order_id: "ZSALI202605230007",
    sku_type: "subscription",
    user_id: 123,
    group_id: 5,
    validity_days: 1,
    balance_amount: 100,
  };
  const subscriptions = [{ id: 9988, group_id: 5, status: "active", expires_at: "2026-06-01T00:00:00Z" }];

  const result = buildOrderFulfillmentRequests(order, subscriptions);

  assert.deepEqual(result, [
    {
      skuType: "balance",
      operation: "add",
      path: "/api/v1/admin/users/123/balance",
      body: {
        balance: 100,
        operation: "add",
        notes: "payment:ZSALI202605230007",
      },
    },
    {
      skuType: "subscription",
      operation: "extend",
      path: "/api/v1/admin/subscriptions/9988/extend",
      body: { days: 1 },
    },
  ]);
});
