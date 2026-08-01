import test from "node:test";
import assert from "node:assert/strict";

import {
  hasMinimumRemainingHours,
  normalizeResetWindowRequest,
  normalizeRemainingMs,
  ServiceError,
  parseIntId,
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
