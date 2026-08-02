import assert from "node:assert/strict";
import test from "node:test";

import { calculateTrafficPackQuota } from "../server.mjs";

test("stacks a later same-day traffic pack while preserving the original quota", () => {
  const result = calculateTrafficPackQuota({
    currentDailyLimit: 200,
    activePackBaseDailyQuota: 100,
    bonusQuotaUsd: 100,
  });

  assert.deepEqual(result, {
    baseDailyQuota: 100,
    newDailyLimit: 300,
  });
});

test("uses the current quota as the baseline for the first traffic pack of the day", () => {
  const result = calculateTrafficPackQuota({
    currentDailyLimit: 100,
    activePackBaseDailyQuota: null,
    bonusQuotaUsd: 100,
  });

  assert.deepEqual(result, {
    baseDailyQuota: 100,
    newDailyLimit: 200,
  });
});

test("rejects an invalid traffic pack quota update", () => {
  assert.throws(
    () => calculateTrafficPackQuota({ currentDailyLimit: 0, activePackBaseDailyQuota: null, bonusQuotaUsd: 100 }),
    /finite current daily quota limit/,
  );
  assert.throws(
    () => calculateTrafficPackQuota({ currentDailyLimit: 100, activePackBaseDailyQuota: null, bonusQuotaUsd: 0 }),
    /bonus must be positive/,
  );
});
