const CHINA_TIME_ZONE = "Asia/Shanghai";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function chinaDay(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value)).reduce((result, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function subscriptionStart(subscription) {
  return subscription?.starts_at || subscription?.startsAt || subscription?.start_at || subscription?.startAt || null;
}

function subscriptionExpiry(subscription) {
  return subscription?.expires_at || subscription?.expiresAt || null;
}

export function isOneDayTemporarySubscription(subscription) {
  if (!subscription) return false;
  const explicitType = (
    subscription.quota_duration_type
    || subscription.quotaDurationType
    || subscription.group?.quota_duration_type
    || subscription.group?.quotaDurationType
  );
  if (explicitType === "daily") {
    return true;
  }
  if (explicitType === "monthly") {
    return false;
  }

  const startValue = subscriptionStart(subscription);
  const expiryValue = subscriptionExpiry(subscription);
  if (!startValue || !expiryValue) return false;
  const start = new Date(startValue).getTime();
  const expiry = new Date(expiryValue).getTime();
  return Number.isFinite(start) && Number.isFinite(expiry) && expiry - start <= ONE_DAY_MS + 60_000;
}

export function calculatePlanDailyQuotaProfile(subscriptions, now = new Date()) {
  const today = chinaDay(now);
  let currentDailyQuota = 0;
  let renewalDailyQuota = 0;
  let currentGroupId = null;
  let currentSubscriptionId = null;
  for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
    if (!subscription || subscription.status !== "active") continue;
    const mode = subscription.quota_mode || subscription.quotaMode || subscription.group?.quota_mode;
    if (mode === "cumulative") continue;
    const startsAt = subscriptionStart(subscription);
    if (startsAt && new Date(startsAt).getTime() > now.getTime()) continue;
    const quota = Number(subscription?.group?.daily_limit_usd);
    if (!Number.isFinite(quota) || quota <= 0) continue;
    const expiryValue = subscriptionExpiry(subscription);
    const expiry = expiryValue ? new Date(expiryValue).getTime() : Number.NaN;
    if (Number.isFinite(expiry) && expiry <= now.getTime()) continue;
    if (mode === "daily_fixed" || !isOneDayTemporarySubscription(subscription)) {
      if (quota > currentDailyQuota) {
        currentDailyQuota = quota;
        currentGroupId = Number(subscription.group_id || subscription.group?.id) || null;
        currentSubscriptionId = Number(subscription.id) || null;
      }
      renewalDailyQuota = Math.max(renewalDailyQuota, quota);
      continue;
    }
    const start = subscriptionStart(subscription);
    if (start && chinaDay(start) === today && quota > currentDailyQuota) {
      currentDailyQuota = quota;
      currentGroupId = Number(subscription.group_id || subscription.group?.id) || null;
      currentSubscriptionId = Number(subscription.id) || null;
    }
  }
  return { currentDailyQuota, renewalDailyQuota, currentGroupId, currentSubscriptionId };
}
