import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEffectiveDailyQuota,
  calculateTrafficPackPurchaseQuota,
  getTrafficPacksToReset,
  TRAFFIC_PACK_STATUS,
} from "../traffic-pack-state.mjs";

const NOW = new Date("2026-08-05T10:00:00.000Z");
const TONIGHT = "2026-08-05T16:00:00.000Z";
const LAST_MIDNIGHT = "2026-08-04T16:00:00.000Z";

function appliedPack(id, bonus, expiresAt = TONIGHT) {
  return {
    id,
    traffic_pack_status: TRAFFIC_PACK_STATUS.APPLIED,
    traffic_pack_bonus_usd: bonus,
    traffic_pack_expires_at: expiresAt,
  };
}

test("a purchase adds its bonus to the current effective quota", () => {
  const result = calculateTrafficPackPurchaseQuota({
    baseDailyQuota: 400,
    packs: [appliedPack(1, 100)],
    bonusQuotaUsd: 100,
    now: NOW,
  });
  assert.deepEqual(result, {
    baseDailyQuota: 400,
    trafficPackBonusUsd: 100,
    effectiveDailyQuota: 500,
    newDailyQuota: 600,
  });
});

test("midnight ignores all expired traffic packs and restores the plan quota", () => {
  const result = calculateEffectiveDailyQuota({
    baseDailyQuota: 400,
    packs: [appliedPack(1, 100, LAST_MIDNIGHT), appliedPack(2, 100, LAST_MIDNIGHT)],
    now: NOW,
  });
  assert.deepEqual(result, {
    baseDailyQuota: 400,
    trafficPackBonusUsd: 0,
    effectiveDailyQuota: 400,
  });
  assert.deepEqual(
    getTrafficPacksToReset({ packs: [appliedPack(1, 100, LAST_MIDNIGHT)], now: NOW, reason: "midnight" }).map((pack) => pack.id),
    [1],
  );
});

test("manual reset cancels every currently active traffic pack", () => {
  const packs = [appliedPack(1, 100), appliedPack(2, 100), appliedPack(3, 100, LAST_MIDNIGHT)];
  assert.deepEqual(
    getTrafficPacksToReset({ packs, now: NOW, reason: "manual_reset" }).map((pack) => pack.id),
    [1, 2],
  );
  const cancelled = packs.map((pack) =>
    pack.id <= 2 ? { ...pack, traffic_pack_status: TRAFFIC_PACK_STATUS.CANCELLED_BY_MANUAL_RESET } : pack,
  );
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: 400, packs: cancelled, now: NOW }).effectiveDailyQuota, 400);
});

test("cancelled packs never contribute to the effective quota", () => {
  const result = calculateEffectiveDailyQuota({
    baseDailyQuota: 400,
    packs: [
      appliedPack(1, 100),
      { ...appliedPack(2, 100), traffic_pack_status: TRAFFIC_PACK_STATUS.CANCELLED_BY_MANUAL_RESET },
    ],
    now: NOW,
  });
  assert.equal(result.effectiveDailyQuota, 500);
});

test("a purchase requires a finite positive plan quota", () => {
  assert.throws(
    () => calculateTrafficPackPurchaseQuota({ baseDailyQuota: 0, packs: [], bonusQuotaUsd: 100, now: NOW }),
    /finite current daily quota limit/,
  );
});

test("the effective quota is recalculated from the current plan instead of a stale extension", () => {
  const packs = [appliedPack(1, 100)];
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: 400, packs, now: NOW }).effectiveDailyQuota, 500);
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: 600, packs, now: NOW }).effectiveDailyQuota, 700);
});

test("a pack expires exactly at midnight and cannot be applied twice", () => {
  const midnight = new Date(TONIGHT);
  const pack = appliedPack(1, 100);
  assert.equal(calculateEffectiveDailyQuota({ baseDailyQuota: 400, packs: [pack], now: midnight }).effectiveDailyQuota, 400);
  assert.deepEqual(
    getTrafficPacksToReset({ packs: [pack], now: midnight, reason: "midnight" }).map((item) => item.id),
    [1],
  );
  const expired = { ...pack, traffic_pack_status: TRAFFIC_PACK_STATUS.EXPIRED };
  assert.deepEqual(getTrafficPacksToReset({ packs: [expired], now: midnight, reason: "midnight" }), []);
});
