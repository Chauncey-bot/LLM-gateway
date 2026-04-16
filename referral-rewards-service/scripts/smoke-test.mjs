const rewardsBaseUrl = (process.env.REWARDS_BASE_URL || "http://127.0.0.1:18191").replace(/\/+$/, "");
const adminKey = process.env.ADMIN_API_KEY || "";
const internalKey = process.env.INTERNAL_API_KEY || "";

async function request(method, pathname, body, extraHeaders = {}) {
  const response = await fetch(`${rewardsBaseUrl}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Running smoke checks against ${rewardsBaseUrl}`);

  const health = await request("GET", "/health");
  assert(health.ok, `health failed: ${health.status} ${health.text}`);
  console.log("[ok] /health", health.json);

  if (adminKey) {
    const rewardRules = await request("GET", "/admin/reward-rules", null, { "X-Admin-Key": adminKey });
    assert(rewardRules.ok, `admin reward rules failed: ${rewardRules.status} ${rewardRules.text}`);
    console.log(`[ok] /admin/reward-rules -> ${Array.isArray(rewardRules.json.items) ? rewardRules.json.items.length : 0} item(s)`);

    const redemptionRules = await request("GET", "/admin/redemption-rules", null, { "X-Admin-Key": adminKey });
    assert(redemptionRules.ok, `admin redemption rules failed: ${redemptionRules.status} ${redemptionRules.text}`);
    console.log(`[ok] /admin/redemption-rules -> ${Array.isArray(redemptionRules.json.items) ? redemptionRules.json.items.length : 0} item(s)`);

    const rewardEvents = await request("GET", "/admin/reward-events", null, { "X-Admin-Key": adminKey });
    assert(rewardEvents.ok, `admin reward events failed: ${rewardEvents.status} ${rewardEvents.text}`);
    console.log(`[ok] /admin/reward-events -> ${Array.isArray(rewardEvents.json.items) ? rewardEvents.json.items.length : 0} item(s)`);
  } else {
    console.log("[skip] admin checks skipped (ADMIN_API_KEY not set)");
  }

  if (internalKey) {
    const callback = await request(
      "POST",
      "/internal/events/order-fulfilled",
      {
        event_id: `smoke-${Date.now()}`,
        order_id: `SMOKE-${Date.now()}`,
        buyer_user_id: 999999,
        sku_code: "smoke-sku",
        amount_cents: 100,
        fulfilled_at: new Date().toISOString(),
      },
      { "X-Internal-Key": internalKey },
    );
    assert(callback.ok, `internal callback failed: ${callback.status} ${callback.text}`);
    console.log("[ok] /internal/events/order-fulfilled", callback.json);
  } else {
    console.log("[skip] internal callback check skipped (INTERNAL_API_KEY not set)");
  }

  console.log("Smoke test completed.");
}

main().catch((error) => {
  console.error("smoke test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
