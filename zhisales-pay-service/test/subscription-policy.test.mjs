import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nativeGroupQuota, assertNativeGroupQuota, resolveQuotaMode } from "../subscription-policy.mjs";
import { resolveSubscriptionValidityDays } from "../subscription-duration.mjs";
import { calculatePlanDailyQuotaProfile } from "../traffic-pack-plan-state.mjs";

const catalog = JSON.parse(fs.readFileSync(new URL("../catalog.json", import.meta.url)));
test("all SKU quota policies and independent durations are valid", () => {
  for (const sku of catalog.subscriptions) {
    assert.ok(["daily_fixed", "cumulative"].includes(resolveQuotaMode(sku)));
    assert.equal(resolveSubscriptionValidityDays(sku), sku.validity_days);
    assert.doesNotThrow(() => nativeGroupQuota(sku));
  }
});
test("one day and 30 day cumulative plans use total quota, never a daily cap or balance topup", () => {
  for (const code of ["coding-plan-daily-100-v2", "coding-plan-monthly-84000", "coding-plan-monthly-12000"]) {
    const sku = catalog.subscriptions.find(s => s.code === code);
    assert.equal(sku.quota_mode, "cumulative");
    assert.equal(sku.topup_balance_amount, undefined);
    assert.deepEqual(nativeGroupQuota(sku), {daily_limit_usd: 0, weekly_limit_usd: 0, monthly_limit_usd: sku.total_quota_usd});
    assert.throws(() => assertNativeGroupQuota(sku, {daily_limit_usd: 100}), /not configured/);
    assert.doesNotThrow(() => assertNativeGroupQuota(sku, nativeGroupQuota(sku)));
  }
});
for (const mode of ["daily_fixed", "cumulative"]) {
  for (const days of [1, 7, 30, 60]) {
    test(`${mode} allows independent ${days} day validity`, () => {
      assert.equal(resolveSubscriptionValidityDays({quota_mode: mode, validity_days: days}), days);
    });
  }
}
test("cumulative subscriptions never inflate daily baseline even before group migration", () => {
  const plans = [
    {status: "active", quota_mode: "daily_fixed", group: {daily_limit_usd: 400}},
    {status: "active", quota_mode: "cumulative", group: {daily_limit_usd: 1000}},
  ];
  assert.equal(calculatePlanDailyQuotaProfile(plans).currentDailyQuota, 400);
  assert.equal(calculatePlanDailyQuotaProfile(plans.slice(1)).currentDailyQuota, 0);
});
test("one-day fixed plan remains eligible after midnight until exact expiry", () => {
  const plan = {status: "active", quota_mode: "daily_fixed", starts_at: "2026-09-05T12:00:00+08:00", expires_at: "2026-09-06T12:00:00+08:00", group: {daily_limit_usd: 100}};
  assert.equal(calculatePlanDailyQuotaProfile([plan], new Date("2026-09-06T00:00:00+08:00")).currentDailyQuota, 100);
  assert.equal(calculatePlanDailyQuotaProfile([plan], new Date(plan.expires_at)).currentDailyQuota, 0);
});
