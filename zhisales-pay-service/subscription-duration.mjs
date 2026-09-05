export const SUBSCRIPTION_DURATION_TYPES = Object.freeze(["daily", "monthly"]);

const DAILY_QUOTA_TYPE = SUBSCRIPTION_DURATION_TYPES[0];
const MONTHLY_QUOTA_TYPE = SUBSCRIPTION_DURATION_TYPES[1];
const DEFAULT_MONTHLY_DAYS = 30;
const DEFAULT_DAILY_DAYS = 1;

export function normalizeSubscriptionDurationType(rawType) {
  if (rawType === DAILY_QUOTA_TYPE || rawType === MONTHLY_QUOTA_TYPE) {
    return rawType;
  }
  return "";
}

export function resolveSubscriptionDurationTypeFromSku(sku) {
  const rawType = sku?.quota_duration_type || sku?.quotaDurationType;
  const normalized = normalizeSubscriptionDurationType(rawType);
  if (normalized) {
    return normalized;
  }
  return "";
}

export function resolveSubscriptionValidityDays(sku, { fallbackDays = null } = {}) {
  const rawSku = sku || {};
  // Duration is independent of the quota mode. Legacy type is only a fallback.
  const configured = Number(rawSku.validity_days ?? rawSku.validityDays);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const type = resolveSubscriptionDurationTypeFromSku(rawSku);
  if (type === DAILY_QUOTA_TYPE) {
    return DEFAULT_DAILY_DAYS;
  }
  if (type === MONTHLY_QUOTA_TYPE) {
    return DEFAULT_MONTHLY_DAYS;
  }

  if (Number.isFinite(fallbackDays) && fallbackDays > 0) {
    return fallbackDays;
  }
  return DEFAULT_MONTHLY_DAYS;
}
