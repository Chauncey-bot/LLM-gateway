const CHINA_TIME_ZONE = "Asia/Shanghai";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function chinaDay(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function subscriptionStart(subscription) {
  return subscription?.starts_at || subscription?.startsAt || subscription?.start_at || subscription?.startAt || null;
}

function subscriptionExpiry(subscription) {
  return subscription?.expires_at || subscription?.expiresAt || null;
}

export function isOneDayTemporarySubscription(subscription) {
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
  for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
    if (!subscription || subscription.status !== "active") continue;
    const quota = Number(subscription?.group?.daily_limit_usd);
    if (!Number.isFinite(quota) || quota <= 0) continue;
    const expiryValue = subscriptionExpiry(subscription);
    const expiry = expiryValue ? new Date(expiryValue).getTime() : Number.NaN;
    if (Number.isFinite(expiry) && expiry <= now.getTime()) continue;
    if (!isOneDayTemporarySubscription(subscription)) {
      currentDailyQuota = Math.max(currentDailyQuota, quota);
      renewalDailyQuota = Math.max(renewalDailyQuota, quota);
      continue;
    }
    const start = subscriptionStart(subscription);
    if (start && chinaDay(start) === today) {
      currentDailyQuota = Math.max(currentDailyQuota, quota);
    }
  }
  return { currentDailyQuota, renewalDailyQuota };
}
