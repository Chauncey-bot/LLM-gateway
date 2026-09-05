import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync(process.env.PLAN_CATALOG_PATH || new URL("../zhisales-pay-service/catalog.json", import.meta.url), "utf8"));
const groupIds = new Set();
for (const sku of catalog.subscriptions) {
  const id = Number(sku.group_id);
  if (!["daily_fixed", "cumulative"].includes(sku.quota_mode) || !Number.isInteger(id) || id <= 0 || groupIds.has(id)) {
    throw new Error(`Invalid or ambiguous quota policy for ${sku.code}`);
  }
  groupIds.add(id);
}
export const cumulativePlans = new Map(catalog.subscriptions.filter(s => s.quota_mode === "cumulative").map(s => {
  if (!Number.isFinite(Number(s.total_quota_usd)) || !(Number(s.total_quota_usd) > 0)) throw new Error(`Invalid total quota for ${s.code}`);
  return [Number(s.group_id), s];
}));

// No reservations: committed, billed usage across ALL keys for this subscription.
// In-flight requests may overshoot the cap, as with the native daily limiter.
export async function checkCumulativeQuota(db, owner, plans = cumulativePlans, now = new Date()) {
  const plan = plans.get(Number(owner.group_id));
  if (!plan) return null;
  const { rows } = await db.query(`
    SELECT s.id, COALESCE(SUM(u.actual_cost), 0) AS used_usd
      FROM user_subscriptions s
      LEFT JOIN usage_logs u ON u.subscription_id = s.id AND u.user_id = s.user_id
     WHERE s.user_id = $1 AND s.group_id = $2 AND s.deleted_at IS NULL
       AND s.status = 'active' AND s.starts_at <= $3 AND s.expires_at > $3
     GROUP BY s.id
     ORDER BY s.id DESC`, [owner.user_id, owner.group_id, now]);
  if (!rows.length) return { allowed: false, status: 403, code: "SUBSCRIPTION_EXPIRED", message: "No active cumulative subscription" };
  if (rows.length !== 1) throw new Error("Ambiguous cumulative subscription assignment");
  const used = Number(rows[0].used_usd);
  if (!Number.isFinite(used) || used < 0) throw new Error("Invalid cumulative usage");
  return { allowed: used < Number(plan.total_quota_usd), status: 429,
    code: "TOTAL_QUOTA_EXCEEDED", message: "Total subscription quota exceeded",
    usedUsd: used, totalQuotaUsd: Number(plan.total_quota_usd) };
}
