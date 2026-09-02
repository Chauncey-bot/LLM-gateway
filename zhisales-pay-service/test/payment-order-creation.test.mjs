import assert from "node:assert/strict";
import test from "node:test";

import { createPersistedTradingOrder } from "../payment-order-creation.mjs";

const dailyV2Sku = {
  code: "coding-plan-daily-100-v2",
  type: "subscription",
  group_id: 24,
  amount_cents: 1000,
  validity_days: 1,
  quota_duration_type: "daily",
};

const dailyV2DraftOrder = {
  merchantOrderId: "ZSALI20260901000000V2TEST",
  skuCode: dailyV2Sku.code,
  skuType: "subscription",
  groupId: 24,
  validityDays: 1,
  amountCents: 1000,
};

test("persists the daily v2 order before creating the payment-platform trade", async () => {
  const steps = [];
  const result = await createPersistedTradingOrder({
    draftOrder: dailyV2DraftOrder,
    sku: dailyV2Sku,
    insertDraft: async (order) => {
      steps.push(["insert", order.skuCode, order.validityDays]);
    },
    createTradingOrder: async () => {
      steps.push(["trading"]);
      return { data: { orderno: "gateway-order-1", formHtml: "<form></form>" } };
    },
    storeTradingSuccess: async (_order, trading) => {
      steps.push(["success", trading.data.orderno]);
      return { merchant_order_id: dailyV2DraftOrder.merchantOrderId, trade_status: "pending" };
    },
    storeTradingFailure: async () => {
      steps.push(["failure"]);
    },
  });

  assert.deepEqual(steps, [
    ["insert", "coding-plan-daily-100-v2", 1],
    ["trading"],
    ["success", "gateway-order-1"],
  ]);
  assert.equal(result.order.trade_status, "pending");
});

test("keeps a failed daily v2 order for diagnosis when trade creation fails", async () => {
  const steps = [];
  const gatewayError = new Error("Trading API HTTP 400: rejected product configuration");

  await assert.rejects(
    createPersistedTradingOrder({
      draftOrder: dailyV2DraftOrder,
      sku: dailyV2Sku,
      insertDraft: async () => {
        steps.push("insert");
      },
      createTradingOrder: async () => {
        steps.push("trading");
        throw gatewayError;
      },
      storeTradingSuccess: async () => {
        steps.push("success");
      },
      storeTradingFailure: async (order, error) => {
        steps.push(["failure", order.skuCode, error.message]);
      },
    }),
    gatewayError,
  );

  assert.deepEqual(steps, [
    "insert",
    "trading",
    ["failure", "coding-plan-daily-100-v2", gatewayError.message],
  ]);
});
