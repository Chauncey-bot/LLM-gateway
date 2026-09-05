import fs from 'node:fs';
import { cumulativePlans, cumulativeUsage, subscriptionPlans } from './cumulative-quota.mjs';

function planDescription(plan) {
  const price = Number(plan.amount_cents) > 0 ? `标准价格 ¥${Number(plan.amount_cents) / 100}；` : '';
  const validity = `单次购买有效期 ${plan.validity_days} 天`;
  return plan.quota_mode === 'cumulative'
    ? `${price}累计总额度 $${plan.total_quota_usd}；${validity}；不按日或按月重置。`
    : `${price}每日额度 $${plan.daily_limit_usd}；${validity}；每天北京时间 00:00 重置。`;
}

export async function projectSubscriptionPayload(payload, db, paymentDb, now = new Date()) {
  async function visit(value) {
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (!value || typeof value !== 'object') return value;
    const descriptionPlan = subscriptionPlans.get(Number(value.group_id));
    if (descriptionPlan && value.id && value.user_id && value.starts_at && value.expires_at) {
      value = {...value, group: {...value.group, description: planDescription(descriptionPlan)}};
    }
    const plan = cumulativePlans.get(Number(value.group_id));
    if (plan && value.id && value.user_id && value.starts_at && value.expires_at) {
      const usage = await cumulativeUsage(db, paymentDb, value, now);
      return { ...value, quota_mode: 'cumulative', total_quota_usd: Number(plan.total_quota_usd),
        cumulative_usage_usd: usage.usedUsd, quota_period_starts_at: usage.periodStartsAt,
        quota_period_expires_at: usage.periodExpiresAt, quota_period_order_id: usage.periodOrderId,
        // Compatibility projection for the stock page. These are response-only
        // fields; native monthly counters and group configuration are untouched.
        monthly_usage_usd: usage.usedUsd, monthly_window_start: null,
        group: { ...value.group, daily_limit_usd: 0, weekly_limit_usd: 0,
          monthly_limit_usd: Number(plan.total_quota_usd), quota_mode: 'cumulative' } };
    }
    const result = { ...value };
    for (const key of ['data', 'items', 'subscriptions']) if (key in result) result[key] = await visit(result[key]);
    return result;
  }
  return visit(payload);
}

export function installSubscriptionPresentation(app, {upstreamDb, quotaDb, upstreamBaseUrl}) {
  app.get('/quota-ui/policy', (_req,res) => res.json({groups:[...cumulativePlans.values()].map(p=>({code:p.code,groupId:p.group_id}))}));
  app.get('/quota-ui/bridge.js', (_req,res) => {
    res.set('Cache-Control','no-cache').type('application/javascript').send(fs.readFileSync(new URL('./ui/bridge.js',import.meta.url),'utf8'));
  });
  const routes = [/^\/api\/v1\/(?:admin\/)?subscriptions(?:\/active|\/\d+)?$/,
    /^\/api\/v1\/admin\/users\/\d+\/subscriptions$/];
  app.get(routes, async (req,res) => {
    if (!req.headers.authorization) return res.status(401).json({error:'Missing authorization'});
    try {
      // Forward the caller's credentials, never administrative credentials.
      const upstream = await fetch(`${upstreamBaseUrl}${req.originalUrl}`, {headers:{authorization:req.headers.authorization,accept:'application/json'},signal:AbortSignal.timeout(15000)});
      const payload = await upstream.json();
      res.set('Cache-Control','no-store');
      if (!upstream.ok) return res.status(upstream.status).json(payload);
      return res.json(await projectSubscriptionPayload(payload, upstreamDb, quotaDb));
    } catch {
      return res.status(502).json({error:'Subscription quota presentation unavailable'});
    }
  });
}
