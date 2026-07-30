import pg from "pg";

import { buildSubscriptionFulfillmentRequest, isSubscriptionConflictError } from "../subscription-fulfillment.mjs";

const { Pool } = pg;

const config = {
  db: {
    host: process.env.DB_HOST || "sub2api-postgres",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "zhisales_pay",
    user: process.env.DB_USER || "sub2api",
    password: process.env.DB_PASSWORD || "",
  },
  sub2apiBaseUrl: (process.env.SUB2API_BASE_URL || "http://host.docker.internal:18080").replace(/\/+$/, ""),
  sub2apiAdminEmail: process.env.SUB2API_ADMIN_EMAIL || "",
  sub2apiAdminPassword: process.env.SUB2API_ADMIN_PASSWORD || "",
  skuCode: process.env.TARGET_SKU_CODE || "coding-plan-daily-100",
  includeFulfilled: process.env.INCLUDE_FULFILLED === "1",
  lookbackDays: Number(process.env.LOOKBACK_DAYS || 30),
  dryRun: process.env.DRY_RUN === "1",
  maxRows: Number(process.env.MAX_ROWS || 0),
};

function parseInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}

function normalizeIntervalDays(value, defaultDays) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : defaultDays;
}

config.lookbackDays = normalizeIntervalDays(process.env.LOOKBACK_DAYS || config.lookbackDays, 30);
config.maxRows = parseInteger(process.env.MAX_ROWS || 0, 0);

function nowIso() {
  return new Date().toISOString();
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${config.sub2apiBaseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`sub2api invalid response (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`sub2api request failed (${response.status}): ${json?.message || text || `HTTP ${response.status}`}`);
  }
  if (typeof json?.code === "number" && json.code !== 0) {
    throw new Error(`sub2api business error (${json.code}): ${json.message || "unknown error"}`);
  }
  return json;
}

let cachedAdminToken = null;
let cachedAdminTokenExpiresAt = 0;

async function getAdminToken() {
  const now = Date.now();
  if (cachedAdminToken && now < cachedAdminTokenExpiresAt - 60_000) {
    return cachedAdminToken;
  }
  if (!config.sub2apiAdminEmail || !config.sub2apiAdminPassword) {
    throw new Error("Missing SUB2API_ADMIN_EMAIL or SUB2API_ADMIN_PASSWORD");
  }
  const data = await requestJson("/api/v1/auth/login", {
    method: "POST",
    body: { email: config.sub2apiAdminEmail, password: config.sub2apiAdminPassword },
  });
  cachedAdminToken = data.access_token;
  cachedAdminTokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
  return cachedAdminToken;
}

async function sub2apiAdminJson(pathname, options = {}) {
  const token = await getAdminToken();
  return requestJson(pathname, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

function normalizeSubscriptionListResponse(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.items)) {
    return data.items;
  }
  return [];
}

async function listUserSubscriptions(userId) {
  const data = await sub2apiAdminJson(`/api/v1/admin/users/${userId}/subscriptions?page=1&page_size=100`);
  return normalizeSubscriptionListResponse(data);
}

async function submitFulfillment(fulfillment) {
  return sub2apiAdminJson(fulfillment.path, {
    method: "POST",
    body: fulfillment.body,
  });
}

async function submitSubscriptionFulfillmentWithRetry(order, userSubscriptions) {
  let fulfillment = buildSubscriptionFulfillmentRequest(order, userSubscriptions);
  try {
    await submitFulfillment(fulfillment);
    return fulfillment;
  } catch (error) {
    if (!isSubscriptionConflictError(error)) {
      throw error;
    }
    const refreshedSubscriptions = await listUserSubscriptions(order.user_id);
    fulfillment = buildSubscriptionFulfillmentRequest(order, refreshedSubscriptions);
    await submitFulfillment(fulfillment);
    return fulfillment;
  }
}

function shouldProcessOrder(order, fulfillment) {
  if (!config.includeFulfilled && order.fulfillment_status === "fulfilled") {
    return false;
  }
  if (order.fulfillment_status === "fulfilled" && fulfillment.operation === "extend") {
    return false;
  }
  return true;
}

function buildOrderTargetInfo(order, subscriptions) {
  const fulfillment = buildSubscriptionFulfillmentRequest(order, subscriptions);
  return {
    operation: fulfillment.operation,
    path: fulfillment.path,
    body: fulfillment.body,
    shouldProcess: shouldProcessOrder(order, fulfillment),
    fulfillmentType: fulfillment.operation === "assign" ? "assign" : "extend",
  };
}

function buildOrderQuery() {
  const conditions = ["sku_code = $1", "trade_status = $2"];
  const params = [config.skuCode, "paid"];

  if (!config.includeFulfilled) {
    conditions.push(`fulfillment_status != 'fulfilled'`);
  }

  if (config.lookbackDays > 0) {
    params.push(config.lookbackDays);
    conditions.push(`created_at >= NOW() - ($${params.length} * INTERVAL '1 day')`);
  }

  let limitClause = "";
  if (config.maxRows > 0) {
    params.push(config.maxRows);
    limitClause = ` LIMIT $${params.length}`;
  }

  return {
    sql: `
      SELECT
        merchant_order_id,
        user_id,
        user_email,
        user_username,
        sku_type,
        sku_code,
        group_id,
        validity_days,
        balance_amount,
        trade_status,
        fulfillment_status,
        created_at,
        fulfilled_at
      FROM payment_orders
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC${limitClause}`,
    params,
  };
}

async function main() {
  const pool = new Pool(config.db);
  const client = await pool.connect();
  const startedAt = nowIso();
  let scanned = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];

  try {
    const query = buildOrderQuery();
    const { rows } = await client.query(query.sql, query.params);
    scanned = rows.length;

    for (const row of rows) {
      const order = {
        ...row,
        balance_amount: Number(row.balance_amount),
        group_id: Number(row.group_id),
        validity_days: Number(row.validity_days),
        user_id: Number(row.user_id),
      };

      try {
        const subscriptions = await listUserSubscriptions(order.user_id);
        const target = buildOrderTargetInfo(order, subscriptions);
        if (!target.shouldProcess) {
          skipped += 1;
          continue;
        }

        if (config.dryRun) {
          skipped += 1;
          continue;
        }

        await submitSubscriptionFulfillmentWithRetry(order, subscriptions);
        await client.query(
          `
          UPDATE payment_orders
          SET fulfillment_status = 'fulfilled',
              fulfilled_at = COALESCE(fulfilled_at, NOW()),
              error_message = NULL,
              updated_at = NOW()
          WHERE merchant_order_id = $1
          `,
          [order.merchant_order_id],
        );
        processed += 1;
      } catch (error) {
        failed += 1;
        failures.push({
          merchantOrderId: order.merchant_order_id,
          userId: order.user_id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await client.release();
    await pool.end();
  }

  console.log(JSON.stringify({
    startedAt,
    completedAt: nowIso(),
    skuCode: config.skuCode,
    includeFulfilled: config.includeFulfilled,
    lookbackDays: config.lookbackDays,
    dryRun: config.dryRun,
    scanned,
    processed,
    skipped,
    failed,
    failures,
  }, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("reconcile failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
