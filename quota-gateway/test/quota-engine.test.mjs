import test from "node:test";
import assert from "node:assert/strict";

import { decideReservation, estimateReservationUsd, normalizeQuotaState, settleReservation } from "../quota-engine.mjs";

const today = new Date("2026-08-07T10:00:00.000+08:00");

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

test("all API keys share one account reservation limit", () => {
  const decision = decideReservation({
    dailyWindowStart: "2026-08-07",
    baseDailyQuota: 400,
    effectiveDailyQuota: 500,
    dailyUsageUsd: 490,
    reservedUsageUsd: 4,
  }, 10, today);

  assert.equal(decision.managed, true);
  assert.equal(decision.allowed, false);
  assert.equal(decision.remainingUsd, 6);
});

test("settlement replaces a hold with actual upstream usage", () => {
  const settled = settleReservation({
    dailyWindowStart: "2026-08-07",
    baseDailyQuota: 400,
    effectiveDailyQuota: 500,
    dailyUsageUsd: 100,
    reservedUsageUsd: 5,
  }, 5, 1.25);

  assert.equal(settled.dailyUsageUsd, 101.25);
  assert.equal(settled.reservedUsageUsd, 0);
});

test("reservation estimate honors explicit maximum output tokens", () => {
  const estimated = estimateReservationUsd({
    contentLength: 4_000,
    body: { max_tokens: 20_000 },
    defaultHoldUsd: 0.5,
    maxUsdPer1kTokens: 0.2,
  });
  assert.equal(estimated, 4.2);
});
