import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubscriptionValidityDays } from "../subscription-duration.mjs";

test("uses daily quota duration type as 1 day", () => {
  const result = resolveSubscriptionValidityDays(
    { quota_duration_type: "daily", validity_days: 30 },
    { fallbackDays: 30 },
  );
  assert.equal(result, 1);
});

test("uses monthly quota duration type as 30 days", () => {
  const result = resolveSubscriptionValidityDays(
    { quota_duration_type: "monthly", validity_days: 1 },
    { fallbackDays: 30 },
  );
  assert.equal(result, 30);
});

test("falls back to validity_days when no duration type is configured", () => {
  const result = resolveSubscriptionValidityDays(
    { quota_duration_type: "", validity_days: 15 },
    { fallbackDays: 30 },
  );
  assert.equal(result, 15);
});

test("falls back to configured default when validity value is invalid", () => {
  const result = resolveSubscriptionValidityDays(
    { validity_days: 0 },
    { fallbackDays: 30 },
  );
  assert.equal(result, 30);
});
