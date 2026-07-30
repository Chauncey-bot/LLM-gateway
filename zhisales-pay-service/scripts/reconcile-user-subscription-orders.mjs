const BASE_DELAY_MS = 500;

const config = {
  baseUrl: process.env.PAY_SERVICE_BASE_URL || "https://www.zhisales.com",
  adminEmail: process.env.SUB2API_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.SUB2API_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "",
  targetEmail: process.env.TARGET_USER_EMAIL || process.env.USER_EMAIL || "",
  pageSize: Number(process.env.PAGE_SIZE || 50),
  maxRows: Number(process.env.MAX_ROWS || 0),
  dryRun: process.env.DRY_RUN === "1",
};

function ensurePositiveInteger(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

config.pageSize = ensurePositiveInteger(config.pageSize, 50);
config.maxRows = ensurePositiveInteger(config.maxRows, 0);

function buildRequestHeaders(token) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON response from ${url}: ${text?.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}) for ${url}: ${json?.message || json?.error || text || "unknown error"}`,
    );
  }
  if (typeof json?.code === "number" && json.code !== 0) {
    throw new Error(`Business error from ${url}: ${json.message || "unknown error"}`);
  }
  return json;
}

async function loginAdmin() {
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error("Missing admin credentials: set SUB2API_ADMIN_EMAIL/SUB2API_ADMIN_PASSWORD");
  }

  const data = await requestJson(`${config.baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: buildRequestHeaders(),
    body: JSON.stringify({
      email: config.adminEmail,
      password: config.adminPassword,
    }),
  });

  if (!data?.access_token) {
    throw new Error("Admin login returned no access_token");
  }
  return data.access_token;
}

async function listPaidUnfulfilledOrdersByEmail(token, page = 1) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(config.pageSize),
    tradeStatus: "paid",
    keyword: config.targetEmail,
  });

  const data = await requestJson(
    `${config.baseUrl}/pay-api/admin/orders?${params.toString()}`,
    {
      headers: buildRequestHeaders(token),
    },
  );

  const orders = Array.isArray(data.orders) ? data.orders : [];
  const totalPages = Number(data.totalPages || 1);
  const nextPage = page < totalPages ? page + 1 : 0;

  return {
    orders,
    nextPage,
  };
}

async function fulfillOrder(token, merchantOrderId) {
  return requestJson(`${config.baseUrl}/pay-api/admin/orders/${encodeURIComponent(merchantOrderId)}/fulfill`, {
    method: "POST",
    headers: buildRequestHeaders(token),
    body: "{}",
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!config.targetEmail) {
    throw new Error("Missing target user email: set TARGET_USER_EMAIL");
  }

  const token = await loginAdmin();
  let page = 1;
  const seen = new Set();
  let scanned = 0;
  let skipped = 0;
  let retried = 0;
  let failed = 0;
  let processed = 0;
  const failures = [];

  while (true) {
    const { orders, nextPage } = await listPaidUnfulfilledOrdersByEmail(token, page);
    const filtered = orders.filter((order) => {
      if (order?.skuType !== "subscription") {
        return false;
      }
      if (!order?.merchantOrderId) {
        return false;
      }
      if (order.fulfillmentStatus === "fulfilled") {
        return false;
      }
      return true;
    });

    for (const order of filtered) {
      scanned += 1;
      const targetEmail = order?.userEmail || "";
      if (!targetEmail.toLowerCase().includes(config.targetEmail.toLowerCase())) {
        skipped += 1;
        continue;
      }
      if (seen.has(order.merchantOrderId)) {
        skipped += 1;
        continue;
      }
      seen.add(order.merchantOrderId);

      if (order.fulfillmentStatus === "fulfilled") {
        skipped += 1;
        continue;
      }

      if (config.dryRun) {
        skipped += 1;
        processed += 1;
        continue;
      }

      try {
        const result = await fulfillOrder(token, order.merchantOrderId);
        retried += 1;
        if (result?.order?.fulfillmentStatus === "fulfilled") {
          processed += 1;
        }
      } catch (error) {
        failed += 1;
        failures.push({
          merchantOrderId: order.merchantOrderId,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (BASE_DELAY_MS > 0) {
        await sleep(BASE_DELAY_MS);
      }
      if (config.maxRows > 0 && scanned >= config.maxRows) {
        break;
      }
    }

    if (config.maxRows > 0 && scanned >= config.maxRows) {
      break;
    }
    if (!nextPage || nextPage <= page) {
      break;
    }
    page = nextPage;
  }

  const summary = {
    targetEmail: config.targetEmail,
    scanned,
    retried,
    processed,
    skipped,
    failed,
    dryRun: config.dryRun,
    failures,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
