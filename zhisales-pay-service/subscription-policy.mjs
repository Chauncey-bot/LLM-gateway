export const QUOTA_MODES = Object.freeze(["daily_fixed", "cumulative"]);

export function resolveQuotaMode(sku) {
  const mode = sku?.quota_mode ?? sku?.quotaMode;
  if (!QUOTA_MODES.includes(mode)) throw new Error(`Invalid quota_mode for ${sku?.code || "subscription"}`);
  return mode;
}

export function nativeGroupQuota(sku) {
  const mode = resolveQuotaMode(sku);
  const amount = Number(mode === "cumulative" ? sku.total_quota_usd : sku.daily_limit_usd);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Invalid quota amount for ${sku.code}`);
  // The monthly native cap is defense in depth; lifetime usage is enforced by
  // our gateway because Sub2API can reset monthly windows independently.
  return { daily_limit_usd: mode === "daily_fixed" ? amount : 0,
    weekly_limit_usd: 0, monthly_limit_usd: mode === "cumulative" ? amount : 0 };
}

export function assertNativeGroupQuota(sku, group) {
  const expected = nativeGroupQuota(sku);
  for (const [field, value] of Object.entries(expected)) {
    if (Number(group?.[field] || 0) !== value) {
      throw new Error(`Group ${sku.group_id} quota policy not configured: ${field} must be ${value}`);
    }
  }
}
