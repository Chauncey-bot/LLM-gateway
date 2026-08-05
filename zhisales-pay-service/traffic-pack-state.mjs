export const TRAFFIC_PACK_STATUS = Object.freeze({
  APPLIED: "applied",
  EXPIRED: "expired",
  CANCELLED_BY_MANUAL_RESET: "cancelled_by_manual_reset",
});

function asFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function isActiveTrafficPack(pack, now = new Date()) {
  if (!pack || pack.traffic_pack_status !== TRAFFIC_PACK_STATUS.APPLIED) {
    return false;
  }
  const expiresAt = new Date(pack.traffic_pack_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function calculateEffectiveDailyQuota({ baseDailyQuota, packs = [], now = new Date() }) {
  const base = asFiniteNumber(baseDailyQuota, -1);
  if (base < 0) {
    throw new Error("Base daily quota must be non-negative");
  }
  const trafficPackBonusUsd = packs
    .filter((pack) => isActiveTrafficPack(pack, now))
    .reduce((total, pack) => total + Math.max(0, asFiniteNumber(pack.traffic_pack_bonus_usd)), 0);

  return {
    baseDailyQuota: base,
    trafficPackBonusUsd,
    effectiveDailyQuota: base + trafficPackBonusUsd,
  };
}

export function calculateTrafficPackPurchaseQuota({ baseDailyQuota, packs = [], bonusQuotaUsd, now = new Date() }) {
  const bonus = asFiniteNumber(bonusQuotaUsd, 0);
  if (bonus <= 0) {
    throw new Error("Traffic pack quota bonus must be positive");
  }
  const current = calculateEffectiveDailyQuota({ baseDailyQuota, packs, now });
  if (current.baseDailyQuota <= 0) {
    throw new Error("User does not have a finite current daily quota limit");
  }

  return {
    ...current,
    newDailyQuota: current.effectiveDailyQuota + bonus,
  };
}

export function getTrafficPacksToReset({ packs = [], now = new Date(), reason }) {
  if (reason === "midnight") {
    return packs.filter(
      (pack) =>
        pack?.traffic_pack_status === TRAFFIC_PACK_STATUS.APPLIED &&
        new Date(pack.traffic_pack_expires_at).getTime() <= now.getTime(),
    );
  }
  if (reason === "manual_reset") {
    return packs.filter((pack) => isActiveTrafficPack(pack, now));
  }
  throw new Error("Unsupported traffic pack reset reason");
}
