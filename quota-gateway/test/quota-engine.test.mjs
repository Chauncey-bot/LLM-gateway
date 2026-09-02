import test from "node:test";
import assert from "node:assert/strict";

import { chinaDay, normalizeQuotaState } from "../quota-engine.mjs";

const today = new Date("2026-08-07T10:00:00.000+08:00");

test("China day is always ISO formatted for PostgreSQL DATE values", () => {
  assert.match(chinaDay(today), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(chinaDay(today), "2026-08-07");
});

test("expired traffic pack resets to plan baseline at China midnight", () => {
  const state = normalizeQuotaState({
    dailyWindowStart: "2026-08-06",
    baseDailyQuota: 400,
    effectiveDailyQuota: 500,
    dailyUsageUsd: 110,
    reservedUsageUsd: 30,
    trafficPackExpiresAt: "2026-08-06T15:59:59.999Z",
  }, today);

  assert.equal(state.effectiveDailyQuota, 400);
  assert.equal(state.dailyUsageUsd, 0);
  assert.equal(state.reservedUsageUsd, 0);
  assert.equal(state.trafficPackExpiresAt, null);
});

test("a one-day temporary plan has no new daily allowance after midnight", () => {
  const state = normalizeQuotaState({
    dailyWindowStart: "2026-08-06",
    baseDailyQuota: 100,
    renewalDailyQuota: 0,
    effectiveDailyQuota: 200,
    dailyUsageUsd: 10,
    reservedUsageUsd: 20,
    trafficPackExpiresAt: "2026-08-06T15:59:59.999Z",
  }, today);

  assert.equal(state.baseDailyQuota, 0);
  assert.equal(state.effectiveDailyQuota, 0);
  assert.equal(state.dailyUsageUsd, 0);
  assert.equal(state.reservedUsageUsd, 0);
});
