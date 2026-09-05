import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMinimumRemainingHours,
  normalizeResetWindowRequest,
  normalizeRemainingMs,
  ServiceError,
  getDailyWindowStart,
  parseIntId,
  resetDueDailySubscriptionQuotas,
  startOfDay,
} from "../server.mjs";

const ONE_HOUR_MS = 60 * 60 * 1000;
const BASE_TIME = new Date("2026-08-01T00:00:00.000Z");

test("normalizeResetWindowRequest requires at least one window true", () => {
  assert.deepStrictEqual(normalizeResetWindowRequest({ daily: true, weekly: false, monthly: false }), {
    daily: true,
    weekly: false,
    monthly: false,
  });
  assert.throws(() => normalizeResetWindowRequest({}), ServiceError);
  assert.throws(() => normalizeResetWindowRequest(null), ServiceError);
  assert.throws(() => normalizeResetWindowRequest({ daily: 0, weekly: "", monthly: false }), ServiceError);
});

test("hasMinimumRemainingHours validates expiration window", () => {
  const expiresAt24hAhead = new Date(BASE_TIME.getTime() + 24 * ONE_HOUR_MS).toISOString();
  const expiresAt23h59Ahead = new Date(BASE_TIME.getTime() + (24 * ONE_HOUR_MS - 60000)).toISOString();
  const expiresAtNull = null;

  assert.equal(hasMinimumRemainingHours(expiresAt24hAhead, BASE_TIME, 24), true);
  assert.equal(hasMinimumRemainingHours(expiresAt23h59Ahead, BASE_TIME, 24), false);
  assert.equal(hasMinimumRemainingHours(expiresAtNull, BASE_TIME, 24), false);
});

test("normalizeRemainingMs returns null for invalid timestamp", () => {
  assert.equal(normalizeRemainingMs("not-a-date", BASE_TIME), null);
  assert.equal(normalizeRemainingMs("", BASE_TIME), null);
  const remain = normalizeRemainingMs(new Date(BASE_TIME.getTime() + 6 * ONE_HOUR_MS).toISOString(), BASE_TIME);
  assert.equal(remain, 6 * ONE_HOUR_MS);
});

test("parseIntId parses only positive integers", () => {
  assert.equal(parseIntId("123"), 123);
  assert.throws(() => parseIntId("0"), ServiceError);
  assert.throws(() => parseIntId("abc"), ServiceError);
});

test("startOfDay normalizes to local midnight", () => {
  const lateInDay = new Date(2026, 7, 1, 23, 59, 59, 999);
  const start = startOfDay(lateInDay);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 7);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(start.getSeconds(), 0);
  assert.equal(start.getMilliseconds(), 0);

  const justAfterMidnight = new Date(2026, 7, 2, 0, 0, 1);
  const nextStart = startOfDay(justAfterMidnight);
  assert.equal(nextStart.getFullYear(), 2026);
  assert.equal(nextStart.getMonth(), 7);
  assert.equal(nextStart.getDate(), 2);
  assert.equal(nextStart.getHours(), 0);
  assert.equal(nextStart.getMinutes(), 0);
  assert.equal(nextStart.getSeconds(), 0);
  assert.equal(nextStart.getMilliseconds(), 0);
});

test("startOfDay does not mutate input date", () => {
  const before = new Date(2026, 7, 1, 12, 34, 56);
  const beforeSnapshot = before.getTime();
  const normalized = startOfDay(before);
  assert.equal(before.getTime(), beforeSnapshot);
  assert.equal(normalized.getTime() < before.getTime(), true);
});

test("getDailyWindowStart delegates midnight calculation to PostgreSQL in the configured timezone", async () => {
  const calls = [];
  const windowStart = "2026-08-06T00:00:00.000+08:00";
  const value = await getDailyWindowStart({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ window_start: windowStart }] };
    },
  });

  assert.equal(value, windowStart);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /date_trunc\('day', NOW\(\) AT TIME ZONE \$1\)/);
  assert.deepStrictEqual(calls[0].params, ["Asia/Shanghai"]);
});

test("daily reset job finds due multi-day subscriptions and uses the upstream reset API", async () => {
  const calls = [];
  const resetCalls = [];
  let released = false;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }], rowCount: 1 };
      if (sql.includes("WITH today AS")) {
        return {
          rowCount: 2,
          rows: [
            { id: 101, user_id: 5, group_id: 16 },
            { id: 102, user_id: 22, group_id: 22 },
          ],
        };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    release() {
      released = true;
    },
  };

  const result = await resetDueDailySubscriptionQuotas({
    db: { connect: async () => client },
    batchSize: 50,
    resetSubscription: async (subscriptionId) => {
      resetCalls.push(subscriptionId);
    },
  });

  assert.deepStrictEqual(result, {
    skipped: false,
    reset: 2,
    failed: 0,
    subscriptions: [
      { id: 101, user_id: 5, group_id: 16 },
      { id: 102, user_id: 22, group_id: 22 },
    ],
    failures: [],
  });
  assert.equal(released, true);
  assert.deepStrictEqual(resetCalls, [101, 102]);
  assert.equal(calls[2].params[0], "Asia/Shanghai");
  assert.equal(calls[2].params[1], 50);
  assert.match(calls[2].sql, /daily_window_start < today\.window_start/);
  assert.match(calls[2].sql, /subscription.group_id = ANY\(\$3::bigint\[\]\)/);
  assert.ok(calls[2].params[2].includes(16));
  assert.ok(!calls[2].params[2].includes(24));
  assert.ok(!calls[2].params[2].includes(25));
  assert.ok(!calls[2].params[2].includes(26));
});

test("daily reset job skips a concurrent runner without updating subscriptions", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: false }], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
    release() {},
  };

  const result = await resetDueDailySubscriptionQuotas({ db: { connect: async () => client } });

  assert.deepStrictEqual(result, { skipped: true, reset: 0, failed: 0, subscriptions: [] });
  assert.equal(calls.some((sql) => sql.includes("UPDATE user_subscriptions")), false);
});

test("daily reset job leaves failed resets due for the next poll", async () => {
  const client = {
    async query(sql) {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: true }], rowCount: 1 };
      if (sql.includes("WITH today AS")) return { rows: [{ id: 101, user_id: 5, group_id: 16 }], rowCount: 1 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
    release() {},
  };

  const result = await resetDueDailySubscriptionQuotas({
    db: { connect: async () => client },
    resetSubscription: async () => {
      throw new Error("upstream unavailable");
    },
  });

  assert.deepStrictEqual(result, {
    skipped: false,
    reset: 0,
    failed: 1,
    subscriptions: [{ id: 101, user_id: 5, group_id: 16 }],
    failures: [{ subscriptionId: 101, error: "upstream unavailable" }],
  });
});
