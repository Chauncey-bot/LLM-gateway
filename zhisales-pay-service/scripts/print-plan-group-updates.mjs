// Read-only preparation: review these payloads before applying through the
// existing Sub2API admin API. This script never connects to any service.
import fs from "node:fs";
import { nativeGroupQuota } from "../subscription-policy.mjs";
const catalog = JSON.parse(fs.readFileSync(new URL("../catalog.json", import.meta.url)));
console.log(JSON.stringify(catalog.subscriptions.map(sku => ({
  sku: sku.code, quotaMode: sku.quota_mode, validityDays: sku.validity_days,
  method: "PUT", path: `/api/v1/admin/groups/${sku.group_id}`,
  body: nativeGroupQuota(sku),
})), null, 2));
