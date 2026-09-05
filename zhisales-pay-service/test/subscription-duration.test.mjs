import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubscriptionValidityDays } from "../subscription-duration.mjs";

test("explicit validity overrides legacy daily type", () => {
  const result = resolveSubscriptionValidityDays(
    { quota_duration_type: "daily", validity_days: 30 },
    { fallbackDays: 30 },
  );
  assert.equal(result, 30);
});

test("explicit validity overrides legacy monthly type", () => {
  const result = resolveSubscriptionValidityDays(
    { quota_duration_type: "monthly", validity_days: 1 },
    { fallbackDays: 30 },
  );
  assert.equal(result, 1);
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
