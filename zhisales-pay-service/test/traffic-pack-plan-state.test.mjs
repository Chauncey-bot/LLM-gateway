import assert from "node:assert/strict";
import test from "node:test";

import { calculatePlanDailyQuotaProfile } from "../traffic-pack-plan-state.mjs";

test("one-day temporary subscription contributes only on its purchase day", () => {
  const subscription = {
    status: "active",
    starts_at: "2026-08-07T12:00:00.000+08:00",
    expires_at: "2026-08-08T12:00:00.000+08:00",
    group: { daily_limit_usd: 100 },
  };
  assert.deepEqual(
    calculatePlanDailyQuotaProfile([subscription], new Date("2026-08-07T23:00:00.000+08:00")),
    { currentDailyQuota: 100, renewalDailyQuota: 0 },
  );
  assert.deepEqual(
    calculatePlanDailyQuotaProfile([subscription], new Date("2026-08-08T00:00:01.000+08:00")),
    { currentDailyQuota: 0, renewalDailyQuota: 0 },
  );
});

test("a normal plan remains the next-day baseline alongside a temporary plan", () => {
  const subscriptions = [
    { status: "active", group: { daily_limit_usd: 400 } },
    {
      status: "active",
      starts_at: "2026-08-07T12:00:00.000+08:00",
      expires_at: "2026-08-08T12:00:00.000+08:00",
      group: { daily_limit_usd: 100 },
    },
  ];
  assert.deepEqual(
    calculatePlanDailyQuotaProfile(subscriptions, new Date("2026-08-07T23:00:00.000+08:00")),
    { currentDailyQuota: 400, renewalDailyQuota: 400 },
  );
});

test("explicit daily quota type still only contributes on the purchase day", () => {
  const subscription = {
    status: "active",
    quota_duration_type: "daily",
    starts_at: "2026-08-07T12:00:00.000+08:00",
    expires_at: "2026-09-06T12:00:00.000+08:00",
    group: { daily_limit_usd: 120 },
  };
  assert.deepEqual(
    calculatePlanDailyQuotaProfile([subscription], new Date("2026-08-07T23:00:00.000+08:00")),
    { currentDailyQuota: 120, renewalDailyQuota: 0 },
  );
});

test("explicit monthly quota type contributes to renewal baseline even with short validity", () => {
  const subscription = {
    status: "active",
    quota_duration_type: "monthly",
    starts_at: "2026-08-07T12:00:00.000+08:00",
    expires_at: "2026-08-08T13:00:00.000+08:00",
    group: { daily_limit_usd: 120 },
  };
  assert.deepEqual(
    calculatePlanDailyQuotaProfile([subscription], new Date("2026-08-07T23:00:00.000+08:00")),
    { currentDailyQuota: 120, renewalDailyQuota: 120 },
  );
});
