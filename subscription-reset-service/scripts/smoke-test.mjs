const baseUrl = (process.env.RESET_SERVICE_BASE_URL || "http://127.0.0.1:18192").replace(/\/+$/, "");
const token = process.env.USER_ACCESS_TOKEN || "";
const subscriptionId = process.env.SUBSCRIPTION_ID || "";

async function request(method, pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, ok: response.ok, json, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`[smoke] checking ${baseUrl}`);

  const health = await request("GET", "/health");
  assert(health.ok, `health failed: ${health.status} ${health.text}`);
  console.log("[ok] health:", health.json);

  if (!token || !subscriptionId) {
    console.log("[skip] user reset request: USER_ACCESS_TOKEN and SUBSCRIPTION_ID are required");
    console.log("Smoke test completed.");
    return;
  }

  const reset = await request(
    "POST",
    `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/reset-quota`,
    {
      daily: true,
      weekly: true,
      monthly: true,
    },
    {
      Authorization: `Bearer ${token}`,
    },
  );
  assert(reset.ok || reset.status === 404 || reset.status === 409, `unexpected reset result: ${reset.status} ${reset.text}`);
  console.log(`[ok] reset attempt -> status=${reset.status}`);
  if (!reset.ok) {
    console.log("[info] body:", reset.json);
  } else {
    console.log("[ok] reset success");
  }
}

main()
  .catch((error) => {
    console.error("Smoke test failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(() => {
    console.log("Smoke test completed.");
  });
