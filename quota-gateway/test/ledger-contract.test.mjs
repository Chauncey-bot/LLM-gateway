import test from "node:test";
import assert from "node:assert/strict";

import { chinaDay } from "../quota-engine.mjs";
import { createApp, reserveQuota, settleQuotaHold } from "../server.mjs";

class MemoryQuotaPool {
  constructor(state) {
    this.state = { ...state };
    this.holds = new Map();
  }

  async connect() {
    return {
      query: (sql, params = []) => this.query(sql, params),
      release() {},
    };
  }

  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) return { rows: [] };
    if (statement.startsWith("SELECT * FROM traffic_pack_quota_states")) return { rows: [this.state] };
    if (statement.startsWith("UPDATE traffic_pack_quota_states SET reserved_usage_usd = reserved_usage_usd +")) {
      this.state.reserved_usage_usd = Number(this.state.reserved_usage_usd) + Number(params[1]);
      return { rows: [] };
    }
    if (statement.startsWith("INSERT INTO traffic_pack_quota_holds")) {
      this.holds.set(params[0], {
        request_id: params[0], user_id: params[1], api_key_id: params[2], daily_window_start: params[3], reserved_usd: params[4], status: "pending",
      });
      return { rows: [] };
    }
    if (statement.startsWith("SELECT * FROM traffic_pack_quota_holds")) {
      return { rows: [this.holds.get(params[0])].filter(Boolean) };
    }
    if (statement.includes("daily_usage_usd = daily_usage_usd +")) {
      this.state.reserved_usage_usd = Math.max(0, Number(this.state.reserved_usage_usd) - Number(params[1]));
      this.state.daily_usage_usd = Number(this.state.daily_usage_usd) + Number(params[2]);
      return { rows: [] };
    }
    if (statement.startsWith("UPDATE traffic_pack_quota_states SET reserved_usage_usd = GREATEST(0, reserved_usage_usd -")) {
      this.state.reserved_usage_usd = Math.max(0, Number(this.state.reserved_usage_usd) - Number(params[1]));
      return { rows: [] };
    }
    if (statement.startsWith("UPDATE traffic_pack_quota_holds SET status = 'settled'")) {
      this.holds.get(params[0]).status = "settled";
      this.holds.get(params[0]).actual_usage_usd = params[1];
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  }
}

test("two API keys cannot exceed one managed account quota", async () => {
  const now = new Date("2026-08-07T10:00:00.000+08:00");
  const pool = new MemoryQuotaPool({
    user_id: 22,
    daily_window_start: chinaDay(now),
    base_daily_quota_usd: 400,
    effective_daily_quota_usd: 500,
    daily_usage_usd: 490,
    reserved_usage_usd: 0,
    traffic_pack_expires_at: null,
  });

  const first = await reserveQuota(pool, { userId: 22, apiKeyId: 1, amountUsd: 5, requestId: "00000000-0000-4000-8000-000000000001", now });
  const second = await reserveQuota(pool, { userId: 22, apiKeyId: 2, amountUsd: 10, requestId: "00000000-0000-4000-8000-000000000002", now });

  assert.deepEqual(first, { managed: true, allowed: true, requestId: "00000000-0000-4000-8000-000000000001" });
  assert.equal(second.allowed, false);
  assert.equal(pool.state.reserved_usage_usd, 5);
});

test("settlement releases the hold and records only actual upstream usage", async () => {
  const now = new Date("2026-08-07T10:00:00.000+08:00");
  const pool = new MemoryQuotaPool({
    user_id: 22,
    daily_window_start: chinaDay(now),
    base_daily_quota_usd: 400,
    effective_daily_quota_usd: 500,
    daily_usage_usd: 100,
    reserved_usage_usd: 0,
    traffic_pack_expires_at: null,
  });
  const requestId = "00000000-0000-4000-8000-000000000003";
  await reserveQuota(pool, { userId: 22, apiKeyId: 1, amountUsd: 5, requestId, now });
  const settled = await settleQuotaHold(pool, requestId, 1.25);

  assert.equal(settled, true);
  assert.equal(pool.state.reserved_usage_usd, 0);
  assert.equal(pool.state.daily_usage_usd, 101.25);
  assert.equal(pool.holds.get(requestId).status, "settled");
});

test("gateway rejects an exhausted managed account before forwarding upstream", async () => {
  const now = new Date();
  const quotaDb = new MemoryQuotaPool({
    user_id: 22,
    daily_window_start: chinaDay(now),
    base_daily_quota_usd: 400,
    effective_daily_quota_usd: 500,
    daily_usage_usd: 498,
    reserved_usage_usd: 0,
    traffic_pack_expires_at: null,
  });
  const upstreamDb = {
    async query(sql) {
      if (String(sql).includes("FROM api_keys")) return { rows: [{ id: 7, user_id: 22 }] };
      throw new Error(`Unexpected upstream SQL: ${sql}`);
    },
  };
  const server = createApp({ quotaDb, upstreamDb }).listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: "Bearer sk-test", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-test", max_tokens: 10 }),
    });
    assert.equal(response.status, 429);
    assert.match((await response.json()).error.message, /Daily quota exhausted/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
