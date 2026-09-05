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
export const subscriptionPlans = new Map(catalog.subscriptions.map(s => [Number(s.group_id), s]));
export const cumulativePlans = new Map(catalog.subscriptions.filter(s => s.quota_mode === "cumulative").map(s => {
  if (!Number.isFinite(Number(s.total_quota_usd)) || !(Number(s.total_quota_usd) > 0)) throw new Error(`Invalid total quota for ${s.code}`);
  return [Number(s.group_id), s];
}));

// No reservations: committed usage across all keys in the latest fulfilled period.
// In-flight requests may overshoot the cap, as with the native daily limiter.
export async function cumulativeUsage(db, paymentDb, subscription, now = new Date()) {
  const latest = await paymentDb.query(`SELECT merchant_order_id, fulfilled_at
    FROM payment_orders WHERE user_id = $1 AND group_id = $2
      AND sku_type = 'subscription' AND fulfillment_status = 'fulfilled'
      AND fulfilled_at <= $3 AND fulfilled_at < $4
    ORDER BY fulfilled_at DESC, id DESC LIMIT 1`,
    [subscription.user_id, subscription.group_id, now, subscription.expires_at]);
  const order = latest.rows[0];
  const start = new Date(Math.max(new Date(subscription.starts_at).getTime(),
    order ? new Date(order.fulfilled_at).getTime() : 0));
  if (!Number.isFinite(start.getTime())) throw new Error('Missing cumulative period start');
  const { rows } = await db.query(`SELECT COALESCE(SUM(actual_cost), 0) AS used_usd
    FROM usage_logs WHERE subscription_id = $1 AND user_id = $2
      AND created_at >= $3 AND created_at < $4 AND created_at <= $5`,
    [subscription.id, subscription.user_id, start, subscription.expires_at, now]);
  const usedUsd = Number(rows[0].used_usd);
  if (!Number.isFinite(usedUsd) || usedUsd < 0) throw new Error('Invalid cumulative usage');
  return { usedUsd, periodStartsAt: start.toISOString(), periodExpiresAt: subscription.expires_at,
    periodOrderId: order?.merchant_order_id || null };
}

export async function checkCumulativeQuota(db, owner, plans = cumulativePlans, now = new Date(), paymentDb = db) {
  const plan = plans.get(Number(owner.group_id));
  if (!plan) return null;
  const { rows } = await db.query(`
    SELECT s.id, s.user_id, s.group_id, s.starts_at, s.expires_at
      FROM user_subscriptions s
     WHERE s.user_id = $1 AND s.group_id = $2 AND s.deleted_at IS NULL
       AND s.status = 'active' AND s.starts_at <= $3 AND s.expires_at > $3
     ORDER BY s.id DESC`, [owner.user_id, owner.group_id, now]);
  if (!rows.length) return { allowed: false, status: 403, code: "SUBSCRIPTION_EXPIRED", message: "No active cumulative subscription" };
  if (rows.length !== 1) throw new Error("Ambiguous cumulative subscription assignment");
  const usage = await cumulativeUsage(db, paymentDb, rows[0], now);
  const used = usage.usedUsd;
  return { allowed: used < Number(plan.total_quota_usd), status: 429,
    code: "TOTAL_QUOTA_EXCEEDED", message: "Total subscription quota exceeded",
    ...usage, totalQuotaUsd: Number(plan.total_quota_usd) };
}
