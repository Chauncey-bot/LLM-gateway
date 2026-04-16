import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUrl = (process.env.REWARDS_BASE_URL || "http://127.0.0.1:18191").replace(/\/+$/, "");
const adminKey = process.env.ADMIN_API_KEY || "";
const catalogPath = process.env.CATALOG_PATH || path.join(__dirname, "../../zhisales-pay-service/catalog.json");

if (!adminKey) {
  console.error("Missing ADMIN_API_KEY");
  process.exit(1);
}

async function readCatalog() {
  const raw = await fs.readFile(catalogPath, "utf8");
  return JSON.parse(raw);
}

async function request(method, pathname, body) {
  const resp = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(`${method} ${pathname} failed (${resp.status}): ${text}`);
  }
  return json;
}

async function main() {
  const catalog = await readCatalog();
  const subscriptions = Array.isArray(catalog.subscriptions) ? catalog.subscriptions : [];

  const plan = subscriptions
    .filter((item) => item.enabled)
    .map((item) => ({
      sku_code: item.code,
      reward_points_per_purchase: Math.max(1, Math.floor(Number(item.amount_cents || 0) / 100)),
      points_cost: Math.max(1, Math.floor(Number(item.amount_cents || 0) / 10)),
      group_id: Number(item.group_id),
      validity_days: Number(item.validity_days || 30),
    }));

  console.log("Bootstrapping rules for enabled subscription SKUs...\n");

  for (const item of plan) {
    const rewardResult = await request("PUT", `/admin/reward-rules/${encodeURIComponent(item.sku_code)}`, {
      enabled: true,
      reward_points_per_purchase: item.reward_points_per_purchase,
    });
    console.log(`[reward] ${item.sku_code} -> ${item.reward_points_per_purchase} pts`, rewardResult.rule);

    const redemptionResult = await request("PUT", `/admin/redemption-rules/${encodeURIComponent(item.sku_code)}`, {
      enabled: true,
      points_cost: item.points_cost,
      group_id: item.group_id,
      validity_days: item.validity_days,
    });
    console.log(`[redeem] ${item.sku_code} -> ${item.points_cost} pts`, redemptionResult.rule);
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("bootstrap failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
