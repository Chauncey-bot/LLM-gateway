const CHINA_TIME_ZONE = "Asia/Shanghai";

export function chinaDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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

export function decideReservation(state, amountUsd, now = new Date()) {
  const normalized = normalizeQuotaState(state, now);
  if (!normalized) return { managed: false, allowed: true, state: null };
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Reservation amount must be positive");
  }
  const total = normalized.dailyUsageUsd + normalized.reservedUsageUsd + amount;
  return {
    managed: true,
    allowed: total <= normalized.effectiveDailyQuota,
    remainingUsd: Math.max(0, normalized.effectiveDailyQuota - normalized.dailyUsageUsd - normalized.reservedUsageUsd),
    state: normalized,
  };
}

export function estimateReservationUsd({ contentLength = 0, body = null, defaultHoldUsd = 5, maxUsdPer1kTokens = 0.1 } = {}) {
  let maxTokens = 0;
  if (body && typeof body === "object") {
    maxTokens = Number(body.max_tokens ?? body.max_completion_tokens ?? body.max_output_tokens ?? 0);
  }
  const inputTokens = Math.ceil(Math.max(0, Number(contentLength) || 0) / 4);
  const estimated = ((inputTokens + Math.max(0, maxTokens)) / 1000) * maxUsdPer1kTokens;
  return Math.max(Number(defaultHoldUsd) || 0.01, estimated, 0.01);
}

function parseStateDay(state) {
  if (!state || !state.dailyWindowStart) return null;
  return new Date(`${state.dailyWindowStart}T00:00:00+08:00`);
}

export function settleReservation(state, reservedUsd, actualUsd, now = parseStateDay(state) || new Date()) {
  const normalized = normalizeQuotaState(state, now);
  if (!normalized) return null;
  const reserved = Math.max(0, Number(reservedUsd) || 0);
  const actual = Math.max(0, Number(actualUsd) || 0);
  return {
    ...normalized,
    reservedUsageUsd: Math.max(0, normalized.reservedUsageUsd - reserved),
    dailyUsageUsd: normalized.dailyUsageUsd + actual,
  };
}
