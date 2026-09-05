import test from "node:test";
import assert from "node:assert/strict";
import { assertDailyFixedReset, dailyFixedGroupIds } from "../plan-policy.mjs";
test("all cumulative groups are excluded from midnight and manual resets", () => {
  for (const id of [23, 24, 25, 26]) {
    assert.equal(dailyFixedGroupIds.includes(id), false);
    for (const request of [{daily: true}, {monthly: true}, {daily: true, monthly: true}]) {
      assert.throws(() => assertDailyFixedReset(id, request), /do not support/);
    }
  }
});
test("fixed plans permit only daily resets", () => {
  assert.doesNotThrow(() => assertDailyFixedReset(16, {daily: true}));
  assert.throws(() => assertDailyFixedReset(16, {daily: true, monthly: true}), /Only the daily/);
  assert.throws(() => assertDailyFixedReset(99999, {daily: true}));
});
