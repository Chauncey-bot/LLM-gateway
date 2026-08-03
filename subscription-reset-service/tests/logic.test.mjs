import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMinimumRemainingHours,
  normalizeResetWindowRequest,
  normalizeRemainingMs,
  ServiceError,
  parseIntId,
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
