import assert from "node:assert/strict";
import test from "node:test";

process.env.SUB2API_ADMIN_EMAIL = "test-admin@example.com";
process.env.SUB2API_ADMIN_PASSWORD = "test-password";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const pathname = new URL(url).pathname;
  if (pathname === "/api/v1/auth/login") {
    return Response.json({ access_token: "test-admin-token", expires_in: 3600 });
  }
  if (pathname === "/api/v1/admin/users/22/subscriptions") {
    return Response.json({
      items: [
        {
          id: 88,
          status: "active",
          group: { daily_limit_usd: 2800 },
        },
      ],
    });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

const { fulfillOrder } = await import("../server.mjs");

class TrafficPackFulfillmentClient {
  constructor(order) {
    this.order = { ...order };
    this.effectiveQuota = null;
    this.events = [];
    this.commands = [];
  }

  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, " ").trim();
    this.commands.push(statement);

    if (
      statement.startsWith("SAVEPOINT") ||
      statement.startsWith("RELEASE SAVEPOINT") ||
      statement.startsWith("ROLLBACK TO SAVEPOINT") ||
      statement.includes("pg_advisory_xact_lock")
    ) {
      return { rows: [] };
    }
    if (statement.startsWith("SELECT id, merchant_order_id, traffic_pack_bonus_usd") && statement.includes("<= NOW()")) {
      return { rows: [] };
    }
    if (statement.startsWith("SELECT id, merchant_order_id, traffic_pack_bonus_usd") && statement.includes("> NOW()")) {
      return { rows: [] };
    }
    if (statement.startsWith("INSERT INTO user_extensions")) {
      this.effectiveQuota = Number(params[1]);
      return { rows: [] };
    }
    if (statement.startsWith("INSERT INTO traffic_pack_quota_states")) {
      return {
        rows: [{
          user_id: params[0],
          base_daily_quota_usd: params[1],
          effective_daily_quota_usd: params[2],
          daily_usage_usd: 0,
        }],
      };
    }
    if (statement.startsWith("UPDATE payment_orders") && statement.includes("traffic_pack_bonus_usd")) {
      this.order = {
        ...this.order,
        fulfillment_status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
        error_message: null,
        traffic_pack_bonus_usd: params[1],
        traffic_pack_base_daily_quota_usd: params[2],
        traffic_pack_expires_at: params[3],
        traffic_pack_status: params[4],
      };
      return { rows: [this.order] };
    }
    if (statement.startsWith("INSERT INTO traffic_pack_events")) {
      this.events.push({
        userId: Number(params[0]),
        merchantOrderId: params[1],
        eventType: params[2],
        baseDailyQuota: Number(params[3]),
        effectiveDailyQuota: Number(params[4]),
        details: JSON.parse(params[5]),
      });
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  }
}

test("a paid traffic-pack order is automatically fulfilled from the active subscription baseline", async () => {
  const order = {
    merchant_order_id: "TEST-TRAFFIC-AUTO-FULFILL",
    user_id: 22,
    sku_type: "traffic",
    trade_status: "paid",
    fulfillment_status: "pending",
    balance_amount: "100.00000000",
  };
  const client = new TrafficPackFulfillmentClient(order);

  try {
    const fulfilled = await fulfillOrder(order, client);

    assert.equal(fulfilled.fulfillment_status, "fulfilled");
    assert.equal(fulfilled.error_message, null);
    assert.equal(fulfilled.traffic_pack_base_daily_quota_usd, 2800);
    assert.equal(fulfilled.traffic_pack_bonus_usd, 100);
    assert.equal(fulfilled.traffic_pack_status, "applied");
    assert.equal(client.effectiveQuota, 2900);
    assert.equal(
      client.commands.some((command) => command.startsWith("INSERT INTO traffic_pack_quota_states")),
      true,
    );
    assert.deepEqual(client.events, [
      {
        userId: 22,
        merchantOrderId: "TEST-TRAFFIC-AUTO-FULFILL",
        eventType: "purchase_applied",
        baseDailyQuota: 2800,
        effectiveDailyQuota: 2900,
        details: {
          bonusQuotaUsd: 100,
          expiresAt: fulfilled.traffic_pack_expires_at.toISOString(),
        },
      },
    ]);
    assert.equal(client.commands.some((command) => command.startsWith("SAVEPOINT traffic_pack_fulfillment")), true);
    assert.equal(client.commands.some((command) => command.startsWith("RELEASE SAVEPOINT traffic_pack_fulfillment")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
