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
export const dailyFixedGroupIds = catalog.subscriptions.filter(s => s.quota_mode === "daily_fixed").map(s => Number(s.group_id));
export function assertDailyFixedReset(groupId, request) {
  if (!dailyFixedGroupIds.includes(Number(groupId))) throw new Error("Cumulative subscriptions do not support quota reset");
  if (!request.daily || request.weekly || request.monthly) throw new Error("Only the daily quota can be reset");
}
