import assert from "node:assert/strict";
import test from "node:test";

import { calculateTrafficPackQuota, resolveTrafficPackBaseDailyQuota } from "../server.mjs";

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

test("initializes a missing payment extension from the active subscription quota", () => {
  assert.equal(
    resolveTrafficPackBaseDailyQuota({ extensionDailyLimit: 0, subscriptionDailyLimit: 2800 }),
    2800,
  );
});

test("keeps an existing positive payment extension", () => {
  assert.equal(
    resolveTrafficPackBaseDailyQuota({ extensionDailyLimit: 500, subscriptionDailyLimit: 400 }),
    500,
  );
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
  assert.throws(
    () => resolveTrafficPackBaseDailyQuota({ extensionDailyLimit: 0, subscriptionDailyLimit: null }),
    /finite current daily quota limit/,
  );
});
