const CHINA_TIME_ZONE = "Asia/Shanghai";

export function chinaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).reduce((result, part) => {
    if (part.type === "year" || part.type === "month" || part.type === "day") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function normalizeQuotaState(state, now = new Date()) {
  if (!state) return null;
  const today = chinaDay(now);
  const expiresAt = state.trafficPackExpiresAt ? new Date(state.trafficPackExpiresAt) : null;
  const expiredPack = expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt <= now;
  const staleDay = state.dailyWindowStart !== today;
  const renewalDailyQuota = Number(state.renewalDailyQuota ?? state.baseDailyQuota ?? 0);
  const baseDailyQuota = Number(state.baseDailyQuota || 0);
  const nextBaseDailyQuota = staleDay ? renewalDailyQuota : baseDailyQuota;
  const effectiveDailyQuota = staleDay || expiredPack
    ? nextBaseDailyQuota
    : Number(state.effectiveDailyQuota || 0);
  return {
    ...state,
    dailyWindowStart: today,
    baseDailyQuota: nextBaseDailyQuota,
    renewalDailyQuota,
    effectiveDailyQuota,
    trafficPackExpiresAt: expiredPack ? null : state.trafficPackExpiresAt || null,
    dailyUsageUsd: staleDay ? 0 : Number(state.dailyUsageUsd || 0),
    reservedUsageUsd: staleDay ? 0 : Number(state.reservedUsageUsd || 0),
    changed: staleDay || expiredPack,
  };
}
