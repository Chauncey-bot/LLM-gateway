import test from "node:test";
import assert from "node:assert/strict";

import { releaseExpiredQuotaHolds } from "../server.mjs";

class MockQuotaPool {
  constructor() {
    this.holds = new Map();
    this.states = new Map();
    this.now = Date.now();
  }

  addHold({ requestId, userId, reservedUsd, status, expiresAt }) {
    this.holds.set(requestId, {
      request_id: requestId,
      user_id: userId,
      reserved_usd: String(reservedUsd),
      status,
      expires_at: new Date(expiresAt),
    });
  }

  setState(userId, reservedUsageUsd) {
    this.states.set(Number(userId), Number(reservedUsageUsd));
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release() {},
    };
  }

  async query(sql, params = []) {
    const statement = sql.replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(statement)) {
      return { rows: [] };
    }

    if (statement.startsWith("WITH to_release AS")) {
      const limit = Number(params[0] || 500);
      const expiredHolds = [...this.holds.values()].filter((hold) =>
        hold.status === "pending" && hold.expires_at.getTime() <= this.now
      ).sort((a, b) => a.expires_at.getTime() - b.expires_at.getTime()).slice(0, limit);

      for (const hold of expiredHolds) {
        hold.status = "released";
      }

      const grouped = new Map();
      for (const hold of expiredHolds) {
        const current = grouped.get(hold.user_id) || { released_reserved_sum: 0, released_cnt: 0 };
        grouped.set(hold.user_id, {
          released_reserved_sum: current.released_reserved_sum + Number(hold.reserved_usd),
          released_cnt: current.released_cnt + 1,
        });
      }

      return {
        rows: [...grouped.entries()].map(([userId, value]) => ({
          user_id: userId,
          released_reserved_sum: String(value.released_reserved_sum),
          released_cnt: String(value.released_cnt),
        })),
      };
    }

    if (statement.startsWith("UPDATE traffic_pack_quota_states SET reserved_usage_usd = GREATEST(0, reserved_usage_usd -")) {
      const userId = Number(params[0]);
      const releaseAmount = Number(params[1]);
      const before = this.states.get(userId) || 0;
      this.states.set(userId, Math.max(0, before - releaseAmount));
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL: ${statement}`);
  }
}

test("releaseExpiredQuotaHolds only releases expired holds and reclaims per-user reserved quota", async () => {
  const pool = new MockQuotaPool();
  pool.setState(1, 7.5);
  pool.setState(2, 3);
  pool.addHold({
    requestId: "req-expired-1",
    userId: 1,
    reservedUsd: "2.5",
    status: "pending",
    expiresAt: new Date(pool.now - 1000),
  });
  pool.addHold({
    requestId: "req-expired-2",
    userId: 1,
    reservedUsd: "1.25",
    status: "pending",
    expiresAt: new Date(pool.now - 1000),
  });
  pool.addHold({
    requestId: "req-active-3",
    userId: 1,
    reservedUsd: "9",
    status: "pending",
    expiresAt: new Date(pool.now + 1000 * 60 * 60),
  });
  pool.addHold({
    requestId: "req-expired-4",
    userId: 2,
    reservedUsd: "2.5",
    status: "pending",
    expiresAt: new Date(pool.now - 1000),
  });
  pool.addHold({
    requestId: "req-settled-5",
    userId: 2,
    reservedUsd: "7",
    status: "settled",
    expiresAt: new Date(pool.now - 1000),
  });

  const result = await releaseExpiredQuotaHolds(pool, { batchSize: 10 });
  assert.equal(result.releasedRequests, 3);
  assert.equal(result.scannedUsers, 2);
  assert.equal(pool.states.get(1), 3.75);
  assert.equal(pool.states.get(2), 0.5);
  assert.equal(pool.holds.get("req-expired-1").status, "released");
  assert.equal(pool.holds.get("req-active-3").status, "pending");
});
