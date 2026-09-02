import assert from "node:assert/strict";
import test from "node:test";

import { calculatePlanDailyQuotaProfile } from "../traffic-pack-plan-state.mjs";
import {
  calculateEffectiveDailyQuota,
  getTrafficPacksToReset,
  TRAFFIC_PACK_STATUS,
} from "../traffic-pack-state.mjs";
import { normalizeQuotaState } from "../../quota-gateway/quota-engine.mjs";

const dayOne = new Date("2026-08-07T20:00:00.000+08:00");
const midnight = new Date("2026-08-08T00:00:00.000+08:00");
const expiresAt = "2026-08-07T16:00:00.000Z";

function pack(id, bonus, status = TRAFFIC_PACK_STATUS.APPLIED) {
  return {
    id,
    traffic_pack_bonus_usd: bonus,
    traffic_pack_status: status,
    traffic_pack_expires_at: expiresAt,
  };
}

test("multiple purchases, manual reset, a later purchase, and midnight reset compose correctly", () => {
  const base = 400;
  const firstTwo = [pack(1, 100), pack(2, 100)];
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: base, packs: firstTwo, now: dayOne }).effectiveDailyQuota, 600);

  const afterManualReset = firstTwo.map((item) => ({ ...item, traffic_pack_status: TRAFFIC_PACK_STATUS.CANCELLED_BY_MANUAL_RESET }));
  assert.deepEqual(getTrafficPacksToReset({ packs: firstTwo, now: dayOne, reason: "manual_reset" }).map((item) => item.id), [1, 2]);
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: base, packs: afterManualReset, now: dayOne }).effectiveDailyQuota, 400);

  const afterLaterPurchase = [...afterManualReset, pack(3, 100)];
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: base, packs: afterLaterPurchase, now: dayOne }).effectiveDailyQuota, 500);

  const nextDay = normalizeQuotaState({
    dailyWindowStart: "2026-08-07",
    baseDailyQuota: 400,
    renewalDailyQuota: 400,
    effectiveDailyQuota: 500,
    dailyUsageUsd: 123,
    reservedUsageUsd: 20,
    trafficPackExpiresAt: expiresAt,
  }, midnight);
  assert.equal(nextDay.effectiveDailyQuota, 400);
  assert.equal(nextDay.dailyUsageUsd, 0);
  assert.equal(nextDay.reservedUsageUsd, 0);
  assert.deepEqual(getTrafficPacksToReset({ packs: afterLaterPurchase, now: midnight, reason: "midnight" }).map((item) => item.id), [3]);
});

test("one-day temporary plan plus packs never creates a second-day allowance", () => {
  const temporarySubscription = {
    status: "active",
    starts_at: "2026-08-07T10:00:00.000+08:00",
    expires_at: "2026-08-08T10:00:00.000+08:00",
    group: { daily_limit_usd: 100 },
  };
  const sameDayPlan = calculatePlanDailyQuotaProfile([temporarySubscription], dayOne);
  assert.deepEqual(sameDayPlan, { currentDailyQuota: 100, renewalDailyQuota: 0, currentGroupId: null, currentSubscriptionId: null });
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: sameDayPlan.currentDailyQuota, packs: [pack(4, 100)], now: dayOne }).effectiveDailyQuota, 200);

  const afterMidnightPlan = calculatePlanDailyQuotaProfile([temporarySubscription], midnight);
  assert.deepEqual(afterMidnightPlan, { currentDailyQuota: 0, renewalDailyQuota: 0, currentGroupId: null, currentSubscriptionId: null });
  const nextDay = normalizeQuotaState({
    dailyWindowStart: "2026-08-07",
    baseDailyQuota: 100,
    renewalDailyQuota: 0,
    effectiveDailyQuota: 200,
    dailyUsageUsd: 60,
    reservedUsageUsd: 30,
    trafficPackExpiresAt: expiresAt,
  }, midnight);
  assert.equal(nextDay.effectiveDailyQuota, 0);
  assert.equal(nextDay.dailyUsageUsd, 0);
  assert.equal(nextDay.reservedUsageUsd, 0);
});
