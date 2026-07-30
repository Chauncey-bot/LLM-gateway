import assert from "node:assert/strict";
import test from "node:test";

import { isSubscriptionConflictError } from "../subscription-fulfillment.mjs";
import { fulfillSubscriptionWithRetry } from "../subscription-fulfillment-retry.mjs";

test("detects subscription conflict errors", () => {
  assert.equal(
    isSubscriptionConflictError("sub2api request failed (409): subscription exists but request conflicts with existing assignment semantics"),
    true,
  );
  assert.equal(isSubscriptionConflictError("sub2api request failed (500): boom"), false);
});

test("retries subscription fulfillment after a 409 by refreshing subscriptions", async () => {
  const order = {
    merchant_order_id: "ZSALI202605260001",
    sku_type: "subscription",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
  };

  const listCalls = [];
  const submitCalls = [];
  const conflict = new Error("sub2api request failed (409): subscription exists but request conflicts with existing assignment semantics");

  const result = await fulfillSubscriptionWithRetry(order, {
    listSubscriptions: async (userId) => {
      listCalls.push(userId);
      if (listCalls.length === 1) {
        return [];
      }
      return [
        {
          id: 9988,
          group_id: 10,
          status: "active",
          expires_at: "2026-06-01T00:00:00Z",
          updated_at: "2026-05-26T00:00:00Z",
        },
      ];
    },
    submitFulfillment: async (fulfillment) => {
      submitCalls.push(fulfillment);
      if (submitCalls.length === 1) {
        throw conflict;
      }
      return { ok: true };
    },
  });

  assert.deepEqual(listCalls, [123, 123]);
  assert.equal(submitCalls.length, 2);
  assert.deepEqual(submitCalls[0], {
    skuType: "subscription",
    operation: "assign",
    path: "/api/v1/admin/subscriptions/assign",
    body: {
      user_id: 123,
      group_id: 10,
      validity_days: 30,
      notes: "payment:ZSALI202605260001",
    },
  });
  assert.deepEqual(submitCalls[1], {
    skuType: "subscription",
    operation: "extend",
    path: "/api/v1/admin/subscriptions/9988/extend",
    body: { days: 30 },
  });
  assert.deepEqual(result, {
    skuType: "subscription",
    operation: "extend",
    path: "/api/v1/admin/subscriptions/9988/extend",
    body: { days: 30 },
  });
});

test("retries only subscription fulfillment after a 409 while keeping prior top-up actions", async () => {
  const order = {
    merchant_order_id: "ZSALI202605260003",
    sku_type: "subscription",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
    balance_amount: 100,
  };

  const submitCalls = [];
  const conflict = new Error("sub2api request failed (409): subscription exists but request conflicts with existing assignment semantics");
  let subscriptionSubmitCount = 0;

  const result = await fulfillSubscriptionWithRetry(order, {
    listSubscriptions: async (userId) => {
      if (userId !== 123) {
        throw new Error("unexpected user id");
      }
      return [];
    },
    submitFulfillment: async (fulfillment) => {
      submitCalls.push(fulfillment);
      if (fulfillment.skuType === "balance") {
        return { ok: true };
      }

      subscriptionSubmitCount += 1;
      if (subscriptionSubmitCount === 1) {
        throw conflict;
      }

      return { ok: true };
    },
  });

  assert.equal(submitCalls.length, 3);
  assert.deepEqual(submitCalls[0], {
    skuType: "balance",
    operation: "add",
    path: "/api/v1/admin/users/123/balance",
    body: {
      balance: 100,
      operation: "add",
      notes: "payment:ZSALI202605260003",
    },
  });
  assert.deepEqual(submitCalls[1], {
    skuType: "subscription",
    operation: "assign",
    path: "/api/v1/admin/subscriptions/assign",
    body: {
      user_id: 123,
      group_id: 10,
      validity_days: 30,
      notes: "payment:ZSALI202605260003",
    },
  });
  assert.deepEqual(submitCalls[2], {
    skuType: "subscription",
    operation: "assign",
    path: "/api/v1/admin/subscriptions/assign",
    body: {
      user_id: 123,
      group_id: 10,
      validity_days: 30,
      notes: "payment:ZSALI202605260003",
    },
  });
  assert.equal(result.skuType, "subscription");
});

test("does not swallow non-conflict errors", async () => {
  const order = {
    merchant_order_id: "ZSALI202605260002",
    sku_type: "subscription",
    user_id: 123,
    group_id: 10,
    validity_days: 30,
  };

  let listCount = 0;
  let submitCount = 0;

  await assert.rejects(
    fulfillSubscriptionWithRetry(order, {
      listSubscriptions: async () => {
        listCount += 1;
        return [];
      },
      submitFulfillment: async () => {
        submitCount += 1;
        throw new Error("sub2api request failed (500): boom");
      },
    }),
  );

  assert.equal(listCount, 1);
  assert.equal(submitCount, 1);
});
