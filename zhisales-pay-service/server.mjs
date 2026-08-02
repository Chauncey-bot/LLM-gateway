import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import pg from "pg";

import { buildOrderFulfillmentRequest } from "./subscription-fulfillment.mjs";
import { fulfillSubscriptionWithRetry } from "./subscription-fulfillment-retry.mjs";
import { normalizeSubscriptionListResponse } from "./subscription-list.mjs";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: (process.env.PAY_PUBLIC_BASE_URL || "https://www.zhisales.com").replace(/\/+$/, ""),
  catalogPath: process.env.PAY_CATALOG_PATH || path.join(__dirname, "catalog.json"),
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
  referralRewardsBaseUrl: (process.env.REFERRAL_REWARDS_BASE_URL || "").replace(/\/+$/, ""),
  referralRewardsInternalKey: process.env.REFERRAL_REWARDS_INTERNAL_KEY || "",
  alipayBaseUrl: (process.env.ALIPAY_OPEN_BASE_URL || "").replace(/\/+$/, ""),
  alipayToken: process.env.ALIPAY_OPEN_TOKEN || "",
  alipaySign: process.env.ALIPAY_OPEN_SIGN || "",
  trafficPackReclaimIntervalMs: Number(process.env.TRAFFIC_PACK_RECLAIM_INTERVAL_MS || 60_000),
};

const pool = new Pool(config.db);
const app = express();
const adminSession = {
  token: null,
  expiresAt: 0,
};
const skuGroupCache = {
  value: new Map(),
  expiresAt: 0,
};
const skuGroupCacheTtlMs = 30_000;

const HIDDEN_SKU_CODES = new Set([
  "coding-plan-daily-1200",
  "coding-plan-daily-1600",
  "coding-plan-daily-2800"
]);
const HIDDEN_SKU_AMOUNT_CENTS = new Set([300000, 400000, 700000]);
const paymentPollIntervalMs = Number(process.env.PAYMENT_POLL_INTERVAL_MS || 60_000);
let paymentPollTimer = null;
let trafficPackReclaimTimer = null;

const corsAllowedOrigins = new Set([
  "https://ai.zhisales.com",
  "https://www.zhisales.com",
]);

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (!origin || !corsAllowedOrigins.has(origin)) {
    return next();
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept-Language",
  );
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false, limit: "512kb" }));

function nowIso() {
  return new Date().toISOString();
}

function jsonError(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
}

function orderTitleFromSku(sku) {
  return sku.title || sku.code;
}

function orderBodyFromSku(sku) {
  if (sku.type === "subscription") {
    return `${sku.title} / group ${sku.group_id} / ${sku.validity_days} days`;
  }
  if (sku.type === "traffic") {
    const bonusAmount = Number(sku.daily_quota_bonus_usd || sku.balance_amount || 0);
    return `${sku.title} / traffic +$${bonusAmount}`;
  }
  return `${sku.title} / balance +${sku.balance_amount}`;
}

function signFields(payload, secret) {
  const pairs = Object.entries(payload)
    .filter(([key, value]) => key !== "sign" && value !== null && value !== "" && value !== "null" && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  const content = `${pairs.join("&")}&key=${secret}`;
  return crypto.createHmac("sha256", secret).update(content).digest("hex").toUpperCase();
}

function verifyTradingResponseSignature(payload, secret) {
  if (!payload?.sign) return false;
  const candidate = signFields(
    {
      code: payload.code,
      data: payload.data,
      message: payload.message,
    },
    secret,
  );
  return candidate === payload.sign;
}

function verifyTradingNotificationSignature(payload, secret) {
  if (!payload?.sign) return false;
  const candidate = signFields(
    {
      code: payload.code,
      data: typeof payload.data === "string" ? payload.data : payload.data == null ? "" : JSON.stringify(payload.data),
      message: payload.message,
    },
    secret,
  );
  return candidate === payload.sign;
}

function generateMerchantOrderId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ZSALI${stamp}${random}`;
}

function buildReturnUrl(merchantOrderId) {
  return `${config.publicBaseUrl}/purchase/return?merchantOrderId=${encodeURIComponent(merchantOrderId)}`;
}

function buildNotifyUrl() {
  return `${config.publicBaseUrl}/pay-api/trading/notify`;
}

function isQueryConfigured() {
  return Boolean(config.alipayBaseUrl && config.alipayToken && config.alipaySign);
}

function generateNonce(prefix = "pay") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function amountToCents(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 100);
}

function parseOptionalNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseDecimalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric;
}

function nowDateWithHoursOffset(hours = 0) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function normalizeTradingStatus(status) {
  switch (status) {
    case "TRADE_SUCCESS":
    case "TRADE_FINISHED":
      return "paid";
    case "WAIT_BUYER_PAY":
      return "pending";
    case "TRADE_CLOSED":
      return "closed";
    case "TRADE_FAILED":
      return "failed";
    case "REFUND_SUCCESS":
    case "TRADE_REFUND":
    case "PARTIAL_REFUND":
      return "refunded";
    default:
      return "pending";
  }
}

function formatPaymentStatusLabel(tradeStatus) {
  switch (tradeStatus) {
    case "paid":
      return "已支付";
    case "pending":
      return "待支付";
    case "closed":
      return "已关闭";
    case "failed":
      return "支付失败";
    case "refunded":
      return "已退款";
    default:
      return "未知";
  }
}

function formatFulfillmentStatusLabel(fulfillmentStatus) {
  switch (fulfillmentStatus) {
    case "pending":
      return "待发放";
    case "fulfilled":
      return "已发放";
    case "fulfillment_failed":
      return "发放失败";
    default:
      return "未知";
  }
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeTradingNotificationBody(body) {
  const envelope = body && typeof body === "object" ? body : {};
  const parsedData = safeJsonParse(envelope.data);
  const data = parsedData && typeof parsedData === "object"
    ? parsedData
    : (envelope.data && typeof envelope.data === "object" ? envelope.data : envelope);

  return { envelope, data };
}

function readBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return "";
}

async function readCatalog() {
  const raw = await fs.readFile(config.catalogPath, "utf8");
  const parsed = JSON.parse(raw);
  const subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
  const balancePacks = Array.isArray(parsed.balance_packs) ? parsed.balance_packs : [];
  const trafficPacks = Array.isArray(parsed.traffic_packs) ? parsed.traffic_packs : [];
  return {
    subscriptions: subscriptions.map((item) => ({ ...item, type: "subscription" })),
    balancePacks: balancePacks.map((item) => ({ ...item, type: "balance" })),
    trafficPacks: trafficPacks.map((item) => ({ ...item, type: "traffic" })),
  };
}

async function getEnabledCatalog() {
  const catalog = await readCatalog();
  return {
    subscriptions: catalog.subscriptions.filter((item) => {
      const amountCents = Number(item.amount_cents);
      if (!item.enabled || Number.isNaN(amountCents) || amountCents <= 0) {
        return false;
      }

      if (HIDDEN_SKU_CODES.has(item.code)) {
        return false;
      }
      return !HIDDEN_SKU_AMOUNT_CENTS.has(amountCents);
    }),
    balancePacks: catalog.balancePacks.filter((item) => item.enabled && Number(item.amount_cents) > 0),
    trafficPacks: catalog.trafficPacks.filter((item) => {
      const amountCents = Number(item.amount_cents);
      if (!item.enabled || Number.isNaN(amountCents) || amountCents <= 0) {
        return false;
      }
      return true;
    }),
  };
}

async function getSkuToGroupIdMap() {
  const now = Date.now();
  if (skuGroupCache.expiresAt > now) {
    return skuGroupCache.value;
  }

  const catalog = await readCatalog();
  const map = new Map();
  for (const item of catalog.subscriptions) {
    if (!item || !item.code) {
      continue;
    }
    const groupId = Number(item.group_id);
    if (Number.isFinite(groupId)) {
      map.set(item.code, groupId);
    }
  }

  skuGroupCache.value = map;
  skuGroupCache.expiresAt = now + skuGroupCacheTtlMs;
  return map;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id BIGSERIAL PRIMARY KEY,
      merchant_order_id VARCHAR(64) NOT NULL UNIQUE,
      user_id BIGINT NOT NULL,
      user_email TEXT,
      user_username TEXT,
      sku_type VARCHAR(32) NOT NULL,
      sku_code VARCHAR(64) NOT NULL,
      group_id BIGINT,
      validity_days INTEGER,
      balance_amount NUMERIC(20,8),
      amount_cents INTEGER NOT NULL,
      currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
      platform_order_no TEXT,
      trade_status VARCHAR(32) NOT NULL DEFAULT 'created',
      fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
      fulfilled_at TIMESTAMPTZ,
      error_message TEXT,
      raw_create_response JSONB,
      raw_query_response JSONB,
      raw_notify_response JSONB,
      notify_received_at TIMESTAMPTZ,
      last_checked_at TIMESTAMPTZ,
      traffic_pack_bonus_usd NUMERIC(20,8),
      traffic_pack_base_daily_quota_usd NUMERIC(20,8),
      traffic_pack_applied_at TIMESTAMPTZ,
      traffic_pack_expires_at TIMESTAMPTZ,
      traffic_pack_reverted BOOLEAN NOT NULL DEFAULT FALSE,
      traffic_pack_reverted_at TIMESTAMPTZ,
      traffic_pack_revert_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_payment_orders_trade_status ON payment_orders(trade_status);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_extensions (
      user_id BIGINT PRIMARY KEY,
      quota_daily_limit NUMERIC(20,8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS user_username TEXT;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS raw_notify_response JSONB;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS notify_received_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_bonus_usd NUMERIC(20,8);`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_base_daily_quota_usd NUMERIC(20,8);`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_applied_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_expires_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_reverted BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_reverted_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS traffic_pack_revert_error TEXT;`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_payment_orders_traffic_pack_reclaim ON payment_orders (traffic_pack_expires_at)\n   WHERE sku_type = 'traffic' AND COALESCE(traffic_pack_reverted, false) = false;`,
  );
}

async function sub2apiJson(pathname, options = {}) {
  const response = await fetch(`${config.sub2apiBaseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`sub2api invalid JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const detail = json?.message || json?.error || text || `HTTP ${response.status}`;
    throw new Error(`sub2api request failed (${response.status}): ${detail}`);
  }
  if (typeof json?.code === "number" && json.code !== 0) {
    throw new Error(`sub2api business error (${json.code}): ${json.message || "unknown error"}`);
  }
  if (json && Object.prototype.hasOwnProperty.call(json, "data")) {
    return json.data;
  }
  return json;
}

async function resolveCurrentUser(embeddedToken) {
  if (!embeddedToken) {
    throw new Error("Missing embedded token");
  }
  const data = await sub2apiJson("/api/v1/auth/me", {
    headers: {
      Authorization: `Bearer ${embeddedToken}`,
    },
  });
  return data;
}

async function getAdminToken() {
  const now = Date.now();
  if (adminSession.token && now < adminSession.expiresAt - 60_000) {
    return adminSession.token;
  }
  if (!config.sub2apiAdminEmail || !config.sub2apiAdminPassword) {
    throw new Error("Missing sub2api admin credentials");
  }
  const data = await sub2apiJson("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: config.sub2apiAdminEmail,
      password: config.sub2apiAdminPassword,
    },
  });
  adminSession.token = data.access_token;
  adminSession.expiresAt = now + Number(data.expires_in || 3600) * 1000;
  return adminSession.token;
}

async function sub2apiAdminJson(pathname, options = {}) {
  const token = await getAdminToken();
  return sub2apiJson(pathname, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function getAdminUserById(userId) {
  return sub2apiAdminJson(`/api/v1/admin/users/${Number(userId)}`);
}

async function updateAdminUserQuotaDailyLimit(userId, payload) {
  return sub2apiAdminJson(`/api/v1/admin/users/${Number(userId)}`, {
    method: "PUT",
    body: payload,
  });
}

async function listUserSubscriptions(userId) {
  const data = await sub2apiAdminJson(`/api/v1/admin/users/${userId}/subscriptions?page=1&page_size=100`);
  return normalizeSubscriptionListResponse(data);
}

async function notifyReferralReward(order) {
  if (!config.referralRewardsBaseUrl || !config.referralRewardsInternalKey) {
    return { sent: false, skipped: true, reason: "referral rewards callback not configured" };
  }

  const eventId = `pay-order-fulfilled:${order.merchant_order_id}`;
  const payload = {
    event_id: eventId,
    order_id: order.merchant_order_id,
    buyer_user_id: Number(order.user_id),
    sku_code: order.sku_code,
    amount_cents: Number(order.amount_cents),
    fulfilled_at: order.fulfilled_at || nowIso(),
  };

  const response = await fetch(`${config.referralRewardsBaseUrl}/internal/events/order-fulfilled`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": config.referralRewardsInternalKey,
      "X-Request-Id": eventId,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Referral rewards callback failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return { sent: true, payload, result: json };
}

async function fulfillOrder(order, client) {
  if (order.fulfillment_status === "fulfilled") {
    return order;
  }

  try {
    if (order.sku_type === "traffic") {
      order = await applyTrafficPackOrder(order, client);
    } else if (order.sku_type === "subscription") {
      await fulfillSubscriptionWithRetry(order, {
        listSubscriptions: listUserSubscriptions,
        submitFulfillment: async (fulfillment) => {
          await sub2apiAdminJson(fulfillment.path, {
            method: "POST",
            body: fulfillment.body,
          });
        },
      });

      const { rows } = await client.query(
        `
        UPDATE payment_orders
        SET fulfillment_status = 'fulfilled',
            fulfilled_at = NOW(),
            error_message = NULL,
            updated_at = NOW()
        WHERE merchant_order_id = $1
        RETURNING *
        `,
        [order.merchant_order_id],
      );
      order = rows[0];
    } else {
      const fulfillment = buildOrderFulfillmentRequest(order, []);
      await sub2apiAdminJson(fulfillment.path, {
        method: "POST",
        body: fulfillment.body,
      });

      const { rows } = await client.query(
        `
        UPDATE payment_orders
        SET fulfillment_status = 'fulfilled',
            fulfilled_at = NOW(),
            error_message = NULL,
            updated_at = NOW()
        WHERE merchant_order_id = $1
        RETURNING *
        `,
        [order.merchant_order_id],
      );
      order = rows[0];
    }

    const fulfilledOrder = order;
    try {
      await notifyReferralReward(fulfilledOrder);
    } catch (callbackError) {
      console.warn(
        `[zhisales-pay-service] referral rewards callback failed for ${fulfilledOrder.merchant_order_id}:`,
        callbackError instanceof Error ? callbackError.message : callbackError,
      );
    }

    return fulfilledOrder;
  } catch (error) {
    const { rows } = await client.query(
      `
      UPDATE payment_orders
      SET fulfillment_status = 'fulfillment_failed',
          error_message = $2,
          updated_at = NOW()
      WHERE merchant_order_id = $1
      RETURNING *
      `,
      [order.merchant_order_id, error instanceof Error ? error.message : String(error)],
    );
    return rows[0];
  }
}

async function reconcilePendingPaymentOrders(limit = 20) {
  if (!isQueryConfigured()) {
    return { scanned: 0, fulfilled: 0, skipped: true };
  }

  const client = await pool.connect();
  let fulfilled = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
      SELECT *
      FROM payment_orders
      WHERE fulfillment_status = 'pending'
        AND trade_status IN ('created', 'pending', 'paid')
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
      `,
      [limit],
    );

    for (const row of rows) {
      let order = row;
      try {
        if (order.trade_status !== "paid") {
          const queryResult = await queryTrade(order);
          if (queryResult.normalizedStatus) {
            const update = await client.query(
              `
              UPDATE payment_orders
              SET trade_status = $2,
                  platform_order_no = COALESCE($3, platform_order_no),
                  raw_query_response = $4,
                  last_checked_at = NOW(),
                  updated_at = NOW()
              WHERE merchant_order_id = $1
              RETURNING *
              `,
              [
                order.merchant_order_id,
                queryResult.normalizedStatus,
                queryResult.platformOrderNo || null,
                JSON.stringify(queryResult.raw || null),
              ],
            );
            order = update.rows[0];
          }
        }

        if (order.trade_status === "paid" && order.fulfillment_status !== "fulfilled") {
          order = await fulfillOrder(order, client);
          if (order.fulfillment_status === "fulfilled") {
            fulfilled += 1;
          }
        }
      } catch (error) {
        if (isTradeNotExistError(error) && isOlderThan(order.created_at, 15)) {
          await client.query(
            `
            UPDATE payment_orders
            SET trade_status = 'closed',
                error_message = COALESCE(error_message, $2),
                last_checked_at = NOW(),
                updated_at = NOW()
            WHERE merchant_order_id = $1
            `,
            [
              order.merchant_order_id,
              error instanceof Error ? error.message : String(error),
            ],
          );
          continue;
        }

        console.warn(
          `[zhisales-pay-service] payment poller skipped ${order.merchant_order_id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    await client.query("COMMIT");
    return { scanned: rows.length, fulfilled, skipped: false };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function startPaymentOrderPoller() {
  if (paymentPollTimer || paymentPollIntervalMs <= 0) {
    return;
  }

  const run = async () => {
    try {
      const result = await reconcilePendingPaymentOrders();
      if (!result.skipped && result.scanned > 0) {
        console.log(
          `[zhisales-pay-service] payment poller scanned=${result.scanned} fulfilled=${result.fulfilled}`,
        );
      }
    } catch (error) {
      console.warn(
        "[zhisales-pay-service] payment poller failed:",
        error instanceof Error ? error.message : error,
      );
    }
  };

  paymentPollTimer = setInterval(run, paymentPollIntervalMs);
  paymentPollTimer.unref?.();
  setTimeout(run, 10_000).unref?.();
}

function isTradeNotExistError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("TRADE_NOT_EXIST") || message.includes("交易不存在");
}

function isOlderThan(dateValue, minutes) {
  if (!dateValue) return false;
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp > minutes * 60_000;
}

function getTrafficPackExpiresAt() {
  const chinaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      chinaNow.getUTCFullYear(),
      chinaNow.getUTCMonth(),
      chinaNow.getUTCDate() + 1,
    ) - 8 * 60 * 60 * 1000,
  );
}

function getTrafficPackBonus(order) {
  const bonus = parseDecimalNumber(order.balance_amount);
  return bonus !== null ? bonus : 0;
}

export function calculateTrafficPackQuota({ currentDailyLimit, activePackBaseDailyQuota, bonusQuotaUsd }) {
  if (!Number.isFinite(currentDailyLimit) || currentDailyLimit <= 0) {
    throw new Error("User does not have a finite current daily quota limit");
  }
  if (!Number.isFinite(bonusQuotaUsd) || bonusQuotaUsd <= 0) {
    throw new Error("Traffic pack quota bonus must be positive");
  }

  return {
    baseDailyQuota: activePackBaseDailyQuota ?? currentDailyLimit,
    newDailyLimit: currentDailyLimit + bonusQuotaUsd,
  };
}

async function getUserDailyQuotaExtensionForUpdate(client, userId) {
  await client.query(
    `
    INSERT INTO user_extensions (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [Number(userId)],
  );
  const { rows } = await client.query(
    `
    SELECT quota_daily_limit
    FROM user_extensions
    WHERE user_id = $1
    FOR UPDATE
    `,
    [Number(userId)],
  );
  const quotaDailyLimit = rows.length ? parseDecimalNumber(rows[0].quota_daily_limit) : null;
  if (quotaDailyLimit === null || quotaDailyLimit < 0) {
    throw new Error(`Invalid user daily quota extension for user ${userId}`);
  }
  return quotaDailyLimit;
}

async function setUserDailyQuotaExtension(client, userId, quotaDailyLimit) {
  await client.query(
    `
    UPDATE user_extensions
    SET quota_daily_limit = $2,
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [Number(userId), quotaDailyLimit],
  );
}

async function getUserDailyQuotaExtension(client, userId) {
  const { rows } = await client.query(
    `
    SELECT quota_daily_limit
    FROM user_extensions
    WHERE user_id = $1
    `,
    [Number(userId)],
  );
  return rows.length ? parseDecimalNumber(rows[0].quota_daily_limit) ?? 0 : 0;
}

async function upsertUserDailyQuotaExtension(client, userId, quotaDailyLimit) {
  await client.query(
    `
    INSERT INTO user_extensions (user_id, quota_daily_limit)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE
    SET quota_daily_limit = EXCLUDED.quota_daily_limit,
        updated_at = NOW()
    `,
    [Number(userId), quotaDailyLimit],
  );
}

async function lockTrafficPackUser(client, userId) {
  // A user can complete payments through notify, polling, or a manual retry at
  // the same time. Serialize the read-modify-write quota update across all of
  // those paths so every paid pack contributes its full bonus.
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [Number(userId)]);
}

async function getActiveTrafficPackBaseDailyQuota(client, userId) {
  const { rows } = await client.query(
    `
    SELECT traffic_pack_base_daily_quota_usd
    FROM payment_orders
    WHERE user_id = $1
      AND sku_type = 'traffic'
      AND fulfillment_status = 'fulfilled'
      AND COALESCE(traffic_pack_reverted, false) = false
      AND traffic_pack_expires_at > NOW()
    ORDER BY traffic_pack_applied_at ASC NULLS LAST, id ASC
    LIMIT 1
    FOR UPDATE
    `,
    [Number(userId)],
  );
  return rows.length ? parseDecimalNumber(rows[0].traffic_pack_base_daily_quota_usd) : null;
}

async function queryTrade(order) {
  if (!isQueryConfigured()) {
    return { supported: false, message: "Alipay credentials are not configured." };
  }

  const payload = {
    opt: "order_query",
    orderid: order.merchant_order_id,
    timestamp: String(Date.now()),
    nonce: generateNonce("query"),
  };
  const signedPayload = { ...payload, sign: signFields(payload, config.alipaySign) };

  const response = await fetch(`${config.alipayBaseUrl}/trade`, {
    method: "POST",
    headers: {
      token: config.alipayToken,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(signedPayload),
  });

  const rawText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Trading query invalid JSON: ${rawText.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`Trading query HTTP ${response.status}: ${parsed?.message || rawText}`);
  }
  if (parsed.code !== "200") {
    throw new Error(`Trading query error ${parsed.code}: ${parsed.message || "unknown error"}`);
  }
  if (!verifyTradingResponseSignature(parsed, config.alipaySign)) {
    throw new Error("Trading query response signature verification failed");
  }

  let data;
  try {
    data = JSON.parse(parsed.data);
  } catch {
    throw new Error("Trading query returned invalid data payload");
  }

  if (data.orderid && data.orderid !== order.merchant_order_id) {
    throw new Error(`Trading query order mismatch: expected ${order.merchant_order_id}, got ${data.orderid}`);
  }

  const normalizedStatus = normalizeTradingStatus(data.tradeStatus);
  const queriedAmountCents = amountToCents(data.totalAmount);
  if (normalizedStatus === "paid" && queriedAmountCents !== null && queriedAmountCents !== Number(order.amount_cents)) {
    throw new Error(
      `Trading query amount mismatch: expected ${order.amount_cents}, got ${queriedAmountCents} from totalAmount=${data.totalAmount}`,
    );
  }

  return {
    supported: true,
    normalizedStatus,
    platformOrderNo: data.orderno || null,
    tradeNo: data.tradeNo || null,
    tradeStatus: data.tradeStatus || null,
    paidAt: data.sendPayDate || null,
    raw: {
      envelope: parsed,
      data,
      dataRaw: parsed.data,
    },
  };
}

async function applyTrafficPackOrder(order, client) {
  const bonusQuotaUsd = getTrafficPackBonus(order);
  if (!Number.isFinite(bonusQuotaUsd) || bonusQuotaUsd <= 0) {
    throw new Error(`Invalid traffic pack quota bonus for order ${order.merchant_order_id}`);
  }

  await lockTrafficPackUser(client, order.user_id);
  await reclaimExpiredTrafficPacksForUser(client, order.user_id);

  // All packs bought on a given day share the first pack's baseline. This
  // lets their bonuses stack now while allowing a single correct reset at the
  // next China midnight.
  const currentDailyLimit = await getUserDailyQuotaExtensionForUpdate(client, order.user_id);
  const activePackBaseDailyQuota = await getActiveTrafficPackBaseDailyQuota(client, order.user_id);
  const { baseDailyQuota, newDailyLimit } = calculateTrafficPackQuota({
    currentDailyLimit,
    activePackBaseDailyQuota,
    bonusQuotaUsd,
  });
  const expiresAt = getTrafficPackExpiresAt();

  await setUserDailyQuotaExtension(client, order.user_id, newDailyLimit);

  const update = await client.query(
    `
    UPDATE payment_orders
    SET fulfillment_status = 'fulfilled',
        fulfilled_at = NOW(),
        error_message = NULL,
        traffic_pack_bonus_usd = $2,
        traffic_pack_base_daily_quota_usd = $3,
        traffic_pack_applied_at = NOW(),
        traffic_pack_expires_at = $4,
        updated_at = NOW()
    WHERE merchant_order_id = $1
    RETURNING *
    `,
    [
      order.merchant_order_id,
      bonusQuotaUsd,
      baseDailyQuota,
      expiresAt,
    ],
  );
  return update.rows[0];
}

async function reclaimExpiredTrafficPacksForUser(client, userId) {
  const { rows } = await client.query(
    `
    SELECT *
    FROM payment_orders
    WHERE user_id = $1
      AND sku_type = 'traffic'
      AND fulfillment_status = 'fulfilled'
      AND COALESCE(traffic_pack_reverted, false) = false
      AND traffic_pack_expires_at IS NOT NULL
      AND traffic_pack_expires_at <= NOW()
    ORDER BY traffic_pack_applied_at ASC NULLS LAST, id ASC
    FOR UPDATE
    `,
    [Number(userId)],
  );
  if (!rows.length) {
    return { scanned: 0, reclaimed: 0 };
  }

  const baseDailyQuota = parseDecimalNumber(rows[0].traffic_pack_base_daily_quota_usd);
  if (baseDailyQuota === null) {
    const errorMessage = `Traffic pack baseline is missing for user ${userId}`;
    await client.query(
      `
      UPDATE payment_orders
      SET traffic_pack_revert_error = $2,
          updated_at = NOW()
      WHERE user_id = $1
        AND sku_type = 'traffic'
        AND fulfillment_status = 'fulfilled'
        AND COALESCE(traffic_pack_reverted, false) = false
        AND traffic_pack_expires_at IS NOT NULL
        AND traffic_pack_expires_at <= NOW()
      `,
      [Number(userId), errorMessage],
    );
    throw new Error(errorMessage);
  }

  try {
    await setUserDailyQuotaExtension(client, userId, baseDailyQuota);
    await client.query(
      `
      UPDATE payment_orders
      SET traffic_pack_reverted = true,
          traffic_pack_reverted_at = NOW(),
          traffic_pack_revert_error = NULL,
          updated_at = NOW()
      WHERE user_id = $1
        AND sku_type = 'traffic'
        AND fulfillment_status = 'fulfilled'
        AND COALESCE(traffic_pack_reverted, false) = false
        AND traffic_pack_expires_at IS NOT NULL
        AND traffic_pack_expires_at <= NOW()
      `,
      [Number(userId)],
    );
    return { scanned: rows.length, reclaimed: rows.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await client.query(
      `
      UPDATE payment_orders
      SET traffic_pack_revert_error = $2,
          updated_at = NOW()
      WHERE user_id = $1
        AND sku_type = 'traffic'
        AND fulfillment_status = 'fulfilled'
        AND COALESCE(traffic_pack_reverted, false) = false
        AND traffic_pack_expires_at IS NOT NULL
        AND traffic_pack_expires_at <= NOW()
      `,
      [Number(userId), errorMessage],
    );
    throw error;
  }
}

async function resetActiveTrafficPacksForUser(client, userId) {
  const { rows } = await client.query(
    `
    SELECT traffic_pack_base_daily_quota_usd
    FROM payment_orders
    WHERE user_id = $1
      AND sku_type = 'traffic'
      AND fulfillment_status = 'fulfilled'
      AND COALESCE(traffic_pack_reverted, false) = false
      AND traffic_pack_expires_at IS NOT NULL
      AND traffic_pack_expires_at > NOW()
    ORDER BY traffic_pack_applied_at ASC NULLS LAST, id ASC
    FOR UPDATE
    `,
    [Number(userId)],
  );

  if (!rows.length) {
    return {
      restored: false,
      baselineDailyQuota: null,
      reverted: 0,
    };
  }

  const baselineDailyQuota = parseDecimalNumber(rows[0].traffic_pack_base_daily_quota_usd) || 0;
  await setUserDailyQuotaExtension(client, userId, baselineDailyQuota);

  const updateResult = await client.query(
    `
    UPDATE payment_orders
       SET traffic_pack_reverted = true,
           traffic_pack_reverted_at = NOW(),
           traffic_pack_revert_error = NULL,
           updated_at = NOW()
     WHERE user_id = $1
       AND sku_type = 'traffic'
       AND fulfillment_status = 'fulfilled'
       AND COALESCE(traffic_pack_reverted, false) = false
       AND traffic_pack_expires_at IS NOT NULL
       AND traffic_pack_expires_at > NOW()
    `,
    [Number(userId)],
  );

  return {
    restored: true,
    baselineDailyQuota,
    reverted: updateResult.rowCount || 0,
  };
}

async function reconcileExpiredTrafficPacks(limit = 20) {
  const client = await pool.connect();
  let reclaimed = 0;
  let failed = 0;

  try {
    await client.query("BEGIN");
    const { rows: userRows } = await client.query(
      `
      SELECT DISTINCT user_id
      FROM payment_orders
      WHERE sku_type = 'traffic'
        AND fulfillment_status = 'fulfilled'
        AND COALESCE(traffic_pack_reverted, false) = false
        AND traffic_pack_expires_at IS NOT NULL
        AND traffic_pack_expires_at <= NOW()
      ORDER BY user_id ASC
      LIMIT $1
      `,
      [limit],
    );

    for (const row of userRows) {
      try {
        await lockTrafficPackUser(client, row.user_id);
        const result = await reclaimExpiredTrafficPacksForUser(client, row.user_id);
        reclaimed += result.reclaimed;
      } catch (error) {
        failed += 1;
      }
    }

    await client.query("COMMIT");
    return { scanned: userRows.length, reclaimed, failed, skipped: false };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function startTrafficPackReclaimPoller() {
  if (trafficPackReclaimTimer || config.trafficPackReclaimIntervalMs <= 0) {
    return;
  }

  const run = async () => {
    try {
      const result = await reconcileExpiredTrafficPacks();
      if (!result.skipped && result.reclaimed > 0) {
        console.log(
          `[zhisales-pay-service] traffic pack reclaim scanned=${result.scanned} reclaimed=${result.reclaimed} failed=${result.failed}`,
        );
      }
    } catch (error) {
      console.warn(
        "[zhisales-pay-service] traffic pack reclaim poller failed:",
        error instanceof Error ? error.message : error,
      );
    }
  };

  trafficPackReclaimTimer = setInterval(run, config.trafficPackReclaimIntervalMs);
  trafficPackReclaimTimer.unref?.();
  setTimeout(run, 7_000).unref?.();
}

function normalizeOrderRow(row) {
  return {
    merchantOrderId: row.merchant_order_id,
    userId: Number(row.user_id),
    userEmail: row.user_email,
    userUsername: row.user_username,
    skuType: row.sku_type,
    skuCode: row.sku_code,
    groupId: row.group_id === null ? null : Number(row.group_id),
    validityDays: row.validity_days === null ? null : Number(row.validity_days),
    balanceAmount: row.balance_amount === null ? null : Number(row.balance_amount),
    amountCents: Number(row.amount_cents),
    platformOrderNo: row.platform_order_no,
    tradeStatus: row.trade_status,
    tradeStatusLabel: formatPaymentStatusLabel(row.trade_status),
    fulfillmentStatus: row.fulfillment_status,
    fulfillmentStatusLabel: formatFulfillmentStatusLabel(row.fulfillment_status),
    fulfilledAt: row.fulfilled_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCheckedAt: row.last_checked_at,
    trafficPackBonusUsd: row.traffic_pack_bonus_usd === null ? null : Number(row.traffic_pack_bonus_usd),
    trafficPackBaseDailyQuotaUsd:
      row.traffic_pack_base_daily_quota_usd === null ? null : Number(row.traffic_pack_base_daily_quota_usd),
    trafficPackAppliedAt: row.traffic_pack_applied_at,
    trafficPackExpiresAt: row.traffic_pack_expires_at,
    trafficPackReverted: row.traffic_pack_reverted,
    trafficPackRevertedAt: row.traffic_pack_reverted_at,
    trafficPackRevertError: row.traffic_pack_revert_error,
  };
}

function normalizeOrderListResponse(rows) {
  return rows.map((row) => normalizeOrderRow(row));
}

function buildOrderConsistencyInfo(row, skuToGroupMap) {
  if (row.sku_type !== "subscription") {
    return {
      expectedGroupId: null,
      expectedGroupConfigFound: false,
      groupIdMismatch: false,
    };
  }

  const expectedGroupId = skuToGroupMap?.has(row.sku_code) ? Number(skuToGroupMap.get(row.sku_code)) : null;
  const expectedGroupConfigFound = expectedGroupId !== null;
  const actualGroupId = row.group_id === null ? null : Number(row.group_id);
  const groupIdMismatch =
    expectedGroupConfigFound &&
    (actualGroupId === null || !Number.isFinite(actualGroupId) || actualGroupId !== expectedGroupId);

  return {
    expectedGroupId,
    expectedGroupConfigFound,
    groupIdMismatch,
  };
}

async function normalizeAdminOrderListResponse(rows) {
  const skuToGroupMap = await getSkuToGroupIdMap();
  return rows.map((row) => ({
    ...normalizeOrderRow(row),
    ...buildOrderConsistencyInfo(row, skuToGroupMap),
  }));
}

function parseListLimit(value, fallback = 100, max = 200) {
  const numeric = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.min(numeric, max);
}

function parsePositiveInt(value, fallback = 1) {
  const numeric = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function parseOptionalFilter(value) {
  const normalized = String(Array.isArray(value) ? value[0] : value || "").trim().toLowerCase();
  return normalized && normalized !== "all" ? normalized : "";
}

function buildOrderListFilters(reqQuery, includeUserId = false, allowUserIdentityKeyword = false) {
  const tradeStatus = parseOptionalFilter(reqQuery.tradeStatus);
  const fulfillmentStatus = parseOptionalFilter(reqQuery.fulfillmentStatus);
  const keyword = String(Array.isArray(reqQuery.keyword) ? reqQuery.keyword[0] : reqQuery.keyword || "").trim();

  const where = [];
  const params = [];

  if (includeUserId) {
    params.push(null);
    where.push(`user_id = $${params.length}`);
  }

  if (tradeStatus) {
    params.push(tradeStatus);
    where.push(`trade_status = $${params.length}`);
  }

  if (fulfillmentStatus) {
    params.push(fulfillmentStatus);
    where.push(`fulfillment_status = $${params.length}`);
  }

  if (keyword) {
    params.push(`%${keyword}%`);
    const placeholder = `$${params.length}`;
    const keywordClauses = [
      `merchant_order_id ILIKE ${placeholder}`,
      `sku_code ILIKE ${placeholder}`,
    ];
    if (allowUserIdentityKeyword) {
      keywordClauses.push(`COALESCE(user_email, '') ILIKE ${placeholder}`);
      keywordClauses.push(`COALESCE(user_username, '') ILIKE ${placeholder}`);
    }
    where.push(`(${keywordClauses.join(" OR ")})`);
  }

  return {
    tradeStatus,
    fulfillmentStatus,
    keyword,
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

async function requireCurrentUser(req) {
  const token = readBearerToken(req);
  return resolveCurrentUser(token);
}

async function requireCurrentAdmin(req) {
  const user = await requireCurrentUser(req);
  if (String(user.role) !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}

function html(mode) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PYTHAGORAS Purchase</title>
    <style>
      :root { color-scheme: light; --bg:#f5f7fb; --card:#ffffff; --text:#111827; --muted:#6b7280; --line:#e5e7eb; --primary:#2563eb; --primary-dark:#1d4ed8; --ok:#059669; --warn:#d97706; --err:#dc2626; }
      body.theme-dark { --bg:#0b1020; --card:#111827; --text:#f3f4f6; --muted:#9ca3af; --line:#263142; --primary:#60a5fa; --primary-dark:#3b82f6; --ok:#34d399; --warn:#fbbf24; --err:#f87171; color-scheme: dark; }
      * { box-sizing:border-box; }
      body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:linear-gradient(180deg,var(--bg),color-mix(in srgb, var(--bg) 80%, #c7d2fe 20%)); color:var(--text); }
      .wrap { max-width:980px; margin:0 auto; padding:28px 20px 40px; }
      .hero { display:flex; flex-direction:column; gap:12px; margin-bottom:24px; }
      .badge { display:inline-flex; align-items:center; gap:8px; width:max-content; padding:7px 12px; border-radius:999px; background:color-mix(in srgb,var(--primary) 12%, transparent); color:var(--primary); font-size:12px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
      h1 { margin:0; font-size:32px; line-height:1.1; }
      .sub { color:var(--muted); max-width:780px; line-height:1.6; }
      .status { margin-top:16px; padding:14px 16px; border:1px solid var(--line); border-radius:16px; background:var(--card); line-height:1.5; }
      .status.ok { border-color: color-mix(in srgb, var(--ok) 40%, var(--line) 60%); }
      .status.warn { border-color: color-mix(in srgb, var(--warn) 40%, var(--line) 60%); }
      .status.err { border-color: color-mix(in srgb, var(--err) 40%, var(--line) 60%); }
      .status-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-top:12px; }
      .status-chip { padding:12px 14px; border:1px solid var(--line); border-radius:14px; background:color-mix(in srgb, var(--card) 90%, var(--bg) 10%); }
      .status-chip .label { display:block; color:var(--muted); font-size:12px; margin-bottom:6px; }
      .status-chip strong { font-size:15px; }
      .panel { display:grid; grid-template-columns:1fr; gap:20px; }
      .user { padding:18px; border-radius:18px; border:1px solid var(--line); background:var(--card); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; }
      .user .meta { color:var(--muted); font-size:14px; }
      .section-title { margin:28px 0 12px; font-size:20px; }
      .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; }
      .card { border:1px solid var(--line); border-radius:18px; background:var(--card); padding:18px; display:flex; flex-direction:column; gap:12px; min-height:220px; }
      .card h3 { margin:0; font-size:18px; }
      .desc { color:var(--muted); font-size:14px; line-height:1.6; min-height:44px; }
      .price { font-size:28px; font-weight:800; }
      .meta-list { font-size:13px; color:var(--muted); display:flex; flex-direction:column; gap:6px; }
      .btn { border:0; border-radius:12px; padding:12px 14px; font-weight:700; cursor:pointer; transition:.15s ease; }
      .btn.primary { background:var(--primary); color:#fff; }
      .btn.primary:hover { background:var(--primary-dark); }
      .btn.secondary { background:transparent; color:var(--text); border:1px solid var(--line); }
      .btn:disabled { opacity:.55; cursor:not-allowed; }
      .empty { padding:24px; border-radius:18px; border:1px dashed var(--line); color:var(--muted); background:var(--card); }
      .return-box { max-width:none; display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,440px); align-items:start; gap:28px; padding:28px; }
      .return-order { display:flex; min-height:190px; flex-direction:column; align-items:flex-start; justify-content:center; gap:10px; }
      .return-order .label { color:var(--muted); font-size:13px; }
      .return-order .order-id { font-size:18px; line-height:1.45; }
      .return-order p { margin:0; max-width:460px; line-height:1.6; }
      .return-console { display:inline-flex; align-items:center; justify-content:center; width:max-content; margin-top:10px; text-decoration:none; }
      .return-box .status-grid { grid-template-columns:repeat(2,minmax(0,1fr)); margin:0; }
      .return-box .status-chip:last-child:nth-child(odd) { grid-column:1 / -1; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break:break-all; }
      @media (max-width: 720px) { h1 { font-size:26px; } .wrap { padding:20px 14px 30px; } .return-box { grid-template-columns:1fr; gap:20px; padding:20px; } .return-order { min-height:0; } }
    </style>
  </head>
  <body>
    <script>window.__PAY_MODE__ = ${JSON.stringify(mode)};</script>
    <div class="wrap">
      <div class="hero">
        <div class="badge">PYTHAGORAS PAY</div>
        <h1 id="page-title">购买套餐</h1>
        <div class="sub" id="page-subtitle">通过支付宝购买订阅或余额。支付完成后，页面会自动确认订单状态并触发发货。</div>
      </div>
      <div id="status" class="status">正在初始化购买页面...</div>
      <div id="app"></div>
    </div>
    <script>
      (function () {
        const mode = window.__PAY_MODE__ || 'purchase';
        const statusEl = document.getElementById('status');
        const appEl = document.getElementById('app');
        const titleEl = document.getElementById('page-title');
        const subtitleEl = document.getElementById('page-subtitle');
        const qs = new URLSearchParams(window.location.search);
        const rawTheme = qs.get('theme') || sessionStorage.getItem('pay_theme') || 'light';
        document.body.classList.toggle('theme-dark', rawTheme === 'dark');
        sessionStorage.setItem('pay_theme', rawTheme);

        const embeddedToken = qs.get('token') || sessionStorage.getItem('pay_embedded_token') || localStorage.getItem('auth_token') || '';
        if (qs.get('token')) {
          sessionStorage.setItem('pay_embedded_token', qs.get('token'));
          const clean = new URL(window.location.href);
          clean.searchParams.delete('token');
          window.history.replaceState({}, '', clean.toString());
        }

        function setStatus(kind, message) {
          statusEl.className = 'status ' + (kind || '');
          statusEl.textContent = message;
        }

        function formatCny(amountCents) {
          return '¥' + (Number(amountCents || 0) / 100).toFixed(2);
        }

        async function api(path, options) {
          const headers = Object.assign(
            { 'Content-Type': 'application/json' },
            (options && options.headers) || {}
          );
          if (embeddedToken) {
            headers.Authorization = 'Bearer ' + embeddedToken;
          }
          const resp = await fetch(path, Object.assign({}, options || {}, { headers }));
          const text = await resp.text();
          let json = {};
          try { json = text ? JSON.parse(text) : {}; } catch (_) {}
          if (!resp.ok) {
            throw new Error(json.error || text || ('HTTP ' + resp.status));
          }
          return json;
        }

        function renderUser(user) {
          return '<div class="user">' +
            '<div><div><strong>' + (user.email || 'Unknown user') + '</strong></div>' +
            '<div class="meta">User ID: ' + user.id + (user.username ? ' / ' + user.username : '') + '</div></div>' +
            '<div class="meta">当前订单会直接发货到这个账号</div>' +
          '</div>';
        }

        function renderCatalogSection(title, items, type) {
          if (!items.length) {
            return '<div class="empty">' + title + ' 暂未配置。请先在支付服务的 catalog.json 里填写价格并启用 SKU。</div>';
          }
          return '<div><div class="section-title">' + title + '</div><div class="grid">' + items.map(function (item) {
            let extra = '';
            if (type === 'subscription') {
              extra = '<div class="meta-list"><div>Group ID: ' + item.groupId + '</div><div>有效期: ' + item.validityDays + ' 天</div></div>';
            } else if (type === 'balance') {
              extra = '<div class="meta-list"><div>到账余额: ' + item.balanceAmount + '</div></div>';
            } else if (type === 'traffic') {
              extra = '<div class="meta-list"><div>当日额度加成: ' + item.bonusQuotaUsd + '</div><div>有效期: ' + item.validityDays + ' 天</div></div>';
            }
            return '<div class="card">' +
              '<h3>' + item.title + '</h3>' +
              '<div class="desc">' + (item.description || '') + '</div>' +
              '<div class="price">' + formatCny(item.amountCents) + '</div>' +
              extra +
              '<button class="btn primary" data-sku="' + item.code + '">立即支付</button>' +
            '</div>';
          }).join('') + '</div></div>';
        }

        async function submitOrder(skuCode) {
          setStatus('', '正在创建支付订单...');
          const result = await api('/pay-api/orders', {
            method: 'POST',
            body: JSON.stringify({ skuCode: skuCode })
          });
          setStatus('ok', '订单已创建，正在跳转到支付宝...');
          const host = document.createElement('div');
          host.style.display = 'none';
          host.innerHTML = result.formHtml;
          document.body.appendChild(host);
          const form = host.querySelector('form');
          if (!form) throw new Error('支付平台没有返回有效表单');
          form.submit();
        }

        async function loadPurchase() {
          titleEl.textContent = '购买套餐';
          subtitleEl.textContent = '通过支付宝购买订阅或余额。支付完成后，页面会自动确认订单状态并触发发货。';
          const session = await api('/pay-api/session');
          const catalog = await api('/pay-api/catalog');
          setStatus('ok', '当前登录用户已确认，可以开始购买。');
          appEl.innerHTML =
            '<div class="panel">' +
              renderUser(session.user) +
              renderCatalogSection('订阅套餐', catalog.subscriptions || [], 'subscription') +
              renderCatalogSection('余额充值', catalog.balancePacks || [], 'balance') +
              renderCatalogSection('流量包', catalog.trafficPacks || [], 'traffic') +
            '</div>';
          appEl.querySelectorAll('[data-sku]').forEach(function (button) {
            button.addEventListener('click', async function () {
              try {
                button.disabled = true;
                await submitOrder(button.getAttribute('data-sku'));
              } catch (error) {
                setStatus('err', error.message || '创建支付订单失败');
                button.disabled = false;
              }
            });
          });
        }

        async function loadReturn() {
          titleEl.textContent = '支付结果确认';
          subtitleEl.textContent = '浏览器回跳只代表支付流程返回，最终结果以服务端查单、支付状态和发放状态为准。';
          const merchantOrderId = qs.get('merchantOrderId');
          if (!merchantOrderId) {
            setStatus('err', '缺少 merchantOrderId，无法确认订单。');
            return;
          }
          appEl.innerHTML = '<section class="return-box user"><div class="return-order"><span class="label">订单号</span><strong class="order-id mono">' + merchantOrderId + '</strong><p class="meta">支付结果会自动更新，最终以支付状态和发放状态为准。</p><a class="btn primary return-console" href="/">返回控制台</a></div><div class="status-grid" id="status-grid"><div class="status-chip"><span class="label">支付状态</span><strong>查询中</strong></div><div class="status-chip"><span class="label">发放状态</span><strong>查询中</strong></div></div></section>';
          async function tick() {
            try {
              const result = await api('/pay-api/orders/' + encodeURIComponent(merchantOrderId) + '/check', { method: 'POST' });
              const order = result.order;
              const statusGrid = document.getElementById('status-grid');
              if (statusGrid) {
                statusGrid.innerHTML =
                  '<div class="status-chip"><span class="label">支付状态</span><strong>' + (order.tradeStatusLabel || order.tradeStatus || '未知') + '</strong></div>' +
                  '<div class="status-chip"><span class="label">发放状态</span><strong>' + (order.fulfillmentStatusLabel || order.fulfillmentStatus || '未知') + '</strong></div>' +
                  '<div class="status-chip"><span class="label">支付流水</span><strong>' + (order.platformOrderNo || '暂无') + '</strong></div>';
              }
              if (result.querySupported === false) {
                setStatus('warn', '支付订单已记录，但当前支付查询暂不可用。请稍后重试或联系管理员处理。');
                return;
              }
              if (order.fulfillmentStatus === 'fulfilled') {
                setStatus('ok', '支付已确认，订阅/余额已成功发放。');
                return;
              }
              if (order.fulfillmentStatus === 'fulfillment_failed') {
                setStatus('err', '支付已确认，但发放失败：' + (order.errorMessage || '未知错误'));
                return;
              }
              if (order.tradeStatus === 'failed' || order.tradeStatus === 'closed' || order.tradeStatus === 'refunded') {
                setStatus('err', '订单当前支付状态为 ' + (order.tradeStatusLabel || order.tradeStatus) + '，未执行发放。');
                return;
              }
              setStatus('warn', '订单仍在确认中，已支付后会自动进入发放流程，请稍后刷新或重试。');
              setTimeout(tick, 5000);
            } catch (error) {
              setStatus('err', error.message || '查询订单失败');
            }
          }
          setStatus('', '正在确认支付状态...');
          tick();
        }

        if (!embeddedToken && mode !== 'return') {
          setStatus('err', '缺少嵌入 token，无法识别当前登录用户。');
          return;
        }

        (mode === 'return' ? loadReturn : loadPurchase)().catch(function (error) {
          setStatus('err', error.message || '页面初始化失败');
        });
      })();
    </script>
  </body>
</html>`;
}

async function createTradingOrder(order, sku) {
  if (!config.alipayBaseUrl || !config.alipayToken || !config.alipaySign) {
    throw new Error("Missing Alipay credentials");
  }

  const payload = {
    opt: "order",
    orderid: order.merchantOrderId,
    amount: String(order.amountCents),
    method: "ali_page",
    subject: orderTitleFromSku(sku),
    body: orderBodyFromSku(sku),
    returnurl: buildReturnUrl(order.merchantOrderId),
    notifyurl: buildNotifyUrl(),
    timestamp: String(Date.now()),
    nonce: generateNonce("pay"),
    clientip: order.clientIp,
  };
  const signedPayload = { ...payload, sign: signFields(payload, config.alipaySign) };

  const response = await fetch(`${config.alipayBaseUrl}/trade`, {
    method: "POST",
    headers: {
      token: config.alipayToken,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(signedPayload),
  });

  const rawText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`Trading API invalid JSON: ${rawText.slice(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(`Trading API HTTP ${response.status}: ${parsed?.message || rawText}`);
  }
  if (parsed.code !== "200") {
    throw new Error(`Trading API error ${parsed.code}: ${parsed.message || "unknown error"}`);
  }
  if (!verifyTradingResponseSignature(parsed, config.alipaySign)) {
    throw new Error("Trading API response signature verification failed");
  }

  let data;
  try {
    data = JSON.parse(parsed.data);
  } catch {
    throw new Error("Trading API returned invalid data payload");
  }
  if (!data.formHtml) {
    throw new Error("Trading API did not return formHtml");
  }

  return {
    response: parsed,
    data,
  };
}

app.disable("x-powered-by");

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      status: "ok",
      queryConfigured: isQueryConfigured(),
      timestamp: nowIso(),
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "database error");
  }
});

app.get("/purchase", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(html("purchase"));
});

app.get("/purchase/return", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(html("return"));
});

app.get("/pay-api/session", async (req, res) => {
  try {
    const token = readBearerToken(req);
    const user = await resolveCurrentUser(token);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username || "",
        role: user.role,
      },
      querySupported: isQueryConfigured(),
    });
  } catch (error) {
    jsonError(res, 401, error instanceof Error ? error.message : "Unauthorized");
  }
});

app.get("/pay-api/catalog", async (_req, res) => {
  try {
    const catalog = await getEnabledCatalog();
    res.setHeader("Cache-Control", "no-store");
    const sortedSubscriptions = catalog.subscriptions
      .map((item) => ({
        code: item.code,
        title: item.title,
        description: item.description,
        amountCents: Number(item.amount_cents),
        validityDays: Number(item.validity_days || 30),
      }))
      .sort((a, b) => a.amountCents - b.amountCents);
    res.json({
      subscriptions: sortedSubscriptions,
      balancePacks: catalog.balancePacks.map((item) => ({
        code: item.code,
        title: item.title,
        description: item.description,
        amountCents: Number(item.amount_cents),
        balanceAmount: Number(item.balance_amount),
      })),
      trafficPacks: catalog.trafficPacks.map((item) => ({
        code: item.code,
        title: item.title,
        description: item.description,
        amountCents: Number(item.amount_cents),
        bonusQuotaUsd: Number(item.daily_quota_bonus_usd || 0),
        validityDays: Number(item.validity_days || 1),
      })),
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to load catalog");
  }
});

app.get("/pay-api/daily-quota", async (req, res) => {
  const client = await pool.connect();
  try {
    const user = await requireCurrentUser(req);
    const quotaDailyLimit = await getUserDailyQuotaExtension(client, user.id);
    const { rows } = await client.query(
      `
      SELECT MAX(traffic_pack_expires_at) AS traffic_pack_expires_at
      FROM payment_orders
      WHERE user_id = $1
        AND sku_type = 'traffic'
        AND fulfillment_status = 'fulfilled'
        AND COALESCE(traffic_pack_reverted, false) = false
        AND traffic_pack_expires_at > NOW()
      `,
      [Number(user.id)],
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      quotaDailyLimit,
      trafficPackExpiresAt: rows[0]?.traffic_pack_expires_at || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch daily quota";
    jsonError(res, message === "Missing embedded token" ? 401 : 500, message);
  } finally {
    client.release();
  }
});

app.post("/pay-api/orders", async (req, res) => {
  const client = await pool.connect();
  try {
    const token = readBearerToken(req);
    const user = await resolveCurrentUser(token);
    const catalog = await getEnabledCatalog();
    const allSkus = [...catalog.subscriptions, ...catalog.balancePacks, ...catalog.trafficPacks];
    const sku = allSkus.find((item) => item.code === req.body?.skuCode);
    if (!sku) {
      return jsonError(res, 400, "Invalid or disabled skuCode");
    }
    const isTrafficPack = sku.type === "traffic";
    const merchantOrderId = generateMerchantOrderId();
    const draftOrder = {
      merchantOrderId,
      userId: Number(user.id),
      userEmail: user.email || null,
      userUsername: user.username || null,
      skuType: isTrafficPack ? "traffic" : sku.type,
      skuCode: sku.code,
      groupId: sku.type === "subscription" ? Number(sku.group_id) : null,
      validityDays: sku.type === "subscription" ? Number(sku.validity_days || 30) : null,
      balanceAmount:
        sku.type === "balance" || sku.type === "traffic"
          ? parseOptionalNumber(sku.balance_amount ?? sku.daily_quota_bonus_usd)
          : parseOptionalNumber(sku.topup_balance_amount),
      amountCents: Number(sku.amount_cents),
      clientIp: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "",
    };
    const trading = await createTradingOrder(draftOrder, sku);
    const { rows } = await client.query(
      `
      INSERT INTO payment_orders (
        merchant_order_id, user_id, user_email, user_username, sku_type, sku_code, group_id,
        validity_days, balance_amount, amount_cents, platform_order_no,
        trade_status, fulfillment_status, raw_create_response
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending','pending',$12
      )
      RETURNING *
      `,
      [
        draftOrder.merchantOrderId,
        draftOrder.userId,
        draftOrder.userEmail,
        draftOrder.userUsername,
        draftOrder.skuType,
        draftOrder.skuCode,
        draftOrder.groupId,
        draftOrder.validityDays,
        draftOrder.balanceAmount,
        draftOrder.amountCents,
        trading.data.orderno || null,
        JSON.stringify(trading.response),
      ],
    );

    res.json({
      merchantOrderId,
      formHtml: trading.data.formHtml,
      order: normalizeOrderRow(rows[0]),
      querySupported: isQueryConfigured(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create order";
    jsonError(res, 500, message);
  } finally {
    client.release();
  }
});

app.get("/pay-api/orders/:merchantOrderId", async (req, res) => {
  const client = await pool.connect();
  try {
    const user = await requireCurrentUser(req);
    const { rows } = await client.query(
      `SELECT * FROM payment_orders WHERE merchant_order_id = $1 AND user_id = $2 LIMIT 1`,
      [req.params.merchantOrderId, Number(user.id)],
    );
    if (!rows.length) {
      return jsonError(res, 404, "Order not found");
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({
      order: normalizeOrderRow(rows[0]),
      querySupported: isQueryConfigured(),
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to fetch order");
  } finally {
    client.release();
  }
});

app.get("/pay-api/orders", async (req, res) => {
  const client = await pool.connect();
  try {
    const user = await requireCurrentUser(req);
    const pageSize = parseListLimit(req.query.pageSize ?? req.query.limit, 20, 200);
    const page = parsePositiveInt(req.query.page, 1);
    const offset = (page - 1) * pageSize;
    const filters = buildOrderListFilters(req.query, true, false);
    filters.params[0] = Number(user.id);
    const countParams = [...filters.params];
    const countQuery = await client.query(
      `
      SELECT COUNT(*)::bigint AS total
      FROM payment_orders
      ${filters.whereSql}
      `,
      countParams,
    );
    const total = Number(countQuery.rows[0]?.total || 0);
    filters.params.push(pageSize, offset);
    const { rows } = await client.query(
      `
      SELECT *
      FROM payment_orders
      ${filters.whereSql}
      ORDER BY created_at DESC
      LIMIT $${filters.params.length - 1} OFFSET $${filters.params.length}
      `,
      filters.params,
    );
    res.setHeader("Cache-Control", "no-store");
    res.json({
      orders: normalizeOrderListResponse(rows),
      querySupported: isQueryConfigured(),
      page,
      pageSize,
      offset,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tradeStatus: filters.tradeStatus || "all",
      fulfillmentStatus: filters.fulfillmentStatus || "all",
      keyword: filters.keyword,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list orders";
    jsonError(res, message === "Missing embedded token" ? 401 : 500, message);
  } finally {
    client.release();
  }
});

app.get("/pay-api/admin/users/:userId/daily-quota", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);
    const userId = parsePositiveInt(req.params.userId, 0);
    if (!userId) {
      return jsonError(res, 400, "Invalid user id");
    }
    res.json({ userId, quotaDailyLimit: await getUserDailyQuotaExtension(client, userId) });
  } catch (error) {
    const message = error instanceof Error && error.message === "Forbidden" ? "Forbidden" : error instanceof Error ? error.message : "Failed to fetch daily quota";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.put("/pay-api/admin/users/:userId/daily-quota", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);
    const userId = parsePositiveInt(req.params.userId, 0);
    const quotaDailyLimit = parseDecimalNumber(req.body?.quotaDailyLimit);
    if (!userId || quotaDailyLimit === null || quotaDailyLimit < 0) {
      return jsonError(res, 400, "userId and a non-negative quotaDailyLimit are required");
    }
    await upsertUserDailyQuotaExtension(client, userId, quotaDailyLimit);
    res.json({ userId, quotaDailyLimit });
  } catch (error) {
    const message = error instanceof Error && error.message === "Forbidden" ? "Forbidden" : error instanceof Error ? error.message : "Failed to update daily quota";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.post("/pay-api/admin/users/:userId/reset-traffic-packs", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);
    const userId = parsePositiveInt(req.params.userId, 0);
    if (!userId) {
      return jsonError(res, 400, "Invalid user id");
    }

    await client.query("BEGIN");
    await lockTrafficPackUser(client, userId);
    const result = await resetActiveTrafficPacksForUser(client, userId);
    await client.query("COMMIT");
    res.json({
      userId,
      restored: result.restored,
      baselineDailyQuota: result.baselineDailyQuota,
      revertedOrders: result.reverted,
      quotaDailyLimit: await getUserDailyQuotaExtension(client, userId),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error && error.message === "Forbidden"
      ? "Forbidden"
      : error instanceof Error
        ? error.message
        : "Failed to reset traffic pack quota";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.get("/pay-api/admin/orders", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);
    const pageSize = parseListLimit(req.query.pageSize ?? req.query.limit, 20, 200);
    const page = parsePositiveInt(req.query.page, 1);
    const offset = (page - 1) * pageSize;
    const filters = buildOrderListFilters(req.query, false, true);
    const countParams = [...filters.params];
    const countQuery = await client.query(
      `
      SELECT COUNT(*)::bigint AS total
      FROM payment_orders
      ${filters.whereSql}
      `,
      countParams,
    );
    const total = Number(countQuery.rows[0]?.total || 0);
    filters.params.push(pageSize, offset);
    const { rows } = await client.query(
      `
      SELECT *
      FROM payment_orders
      ${filters.whereSql}
      ORDER BY created_at DESC
      LIMIT $${filters.params.length - 1} OFFSET $${filters.params.length}
      `,
      filters.params,
    );
    const orders = await normalizeAdminOrderListResponse(rows);
    const mismatchedOrders = orders.filter((order) => order.groupIdMismatch);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      orders,
      consistency: {
        mismatchRate: rows.length ? mismatchedOrders.length / rows.length : 0,
        mismatchedCount: mismatchedOrders.length,
        scanned: rows.length,
      },
      querySupported: isQueryConfigured(),
      page,
      pageSize,
      offset,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tradeStatus: filters.tradeStatus || "all",
      fulfillmentStatus: filters.fulfillmentStatus || "all",
      keyword: filters.keyword,
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "Forbidden" ? "Forbidden" : error instanceof Error ? error.message : "Failed to list orders";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.get("/pay-api/admin/orders/consistency-check", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);
    const pageSize = parseListLimit(req.query.pageSize ?? req.query.limit, 100, 500);
    const page = parsePositiveInt(req.query.page, 1);
    const offset = (page - 1) * pageSize;
    const mismatchOnly = String(req.query.mismatchOnly || "true").toLowerCase() !== "false";
    const filters = buildOrderListFilters(req.query, false, true);

    const baseWhere = filters.whereSql ? filters.whereSql.replace(/^WHERE\s+/i, "") : "";
    const whereSql = baseWhere
      ? `WHERE sku_type = 'subscription' AND ${baseWhere}`
      : `WHERE sku_type = 'subscription'`;

    const countQuery = await client.query(
      `
      SELECT COUNT(*)::bigint AS total
      FROM payment_orders
      ${whereSql}
      `,
      [...filters.params],
    );
    const total = Number(countQuery.rows[0]?.total || 0);
    filters.params.push(pageSize, offset);
    const { rows } = await client.query(
      `
      SELECT *
      FROM payment_orders
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${filters.params.length - 1} OFFSET $${filters.params.length}
      `,
      filters.params,
    );

    const scannedOrders = await normalizeAdminOrderListResponse(rows);
    const mismatchedOrders = scannedOrders.filter((order) => order.groupIdMismatch);
    const responseOrders = mismatchOnly ? mismatchedOrders : scannedOrders;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      orders: responseOrders,
      querySupported: isQueryConfigured(),
      page,
      pageSize,
      offset,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      tradeStatus: filters.tradeStatus || "all",
      fulfillmentStatus: filters.fulfillmentStatus || "all",
      keyword: filters.keyword,
      consistency: {
        scanned: rows.length,
        mismatchedCount: mismatchedOrders.length,
        mismatchOnly,
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "Forbidden" ? "Forbidden" : error instanceof Error ? error.message : "Failed consistency check";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.post("/pay-api/admin/orders/:merchantOrderId/status", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);
    const targetStatus = String(req.body?.tradeStatus || "").trim().toLowerCase();
    if (!["paid", "closed"].includes(targetStatus)) {
      return jsonError(res, 400, "Unsupported tradeStatus");
    }

    await client.query("BEGIN");
    const select = await client.query(
      `SELECT * FROM payment_orders WHERE merchant_order_id = $1 FOR UPDATE`,
      [req.params.merchantOrderId],
    );
    if (!select.rows.length) {
      await client.query("ROLLBACK");
      return jsonError(res, 404, "Order not found");
    }

    let order = select.rows[0];
    if (order.trade_status === "paid" || order.trade_status === "refunded") {
      await client.query("ROLLBACK");
      return jsonError(res, 400, "Current order status cannot be modified");
    }

    const update = await client.query(
      `
      UPDATE payment_orders
      SET trade_status = $2,
          last_checked_at = NOW(),
          updated_at = NOW(),
          error_message = CASE WHEN $2 = 'paid' THEN NULL ELSE error_message END
      WHERE merchant_order_id = $1
      RETURNING *
      `,
      [order.merchant_order_id, targetStatus],
    );
    order = update.rows[0];

    if (order.trade_status === "paid" && order.fulfillment_status !== "fulfilled") {
      order = await fulfillOrder(order, client);
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      order: normalizeOrderRow(order),
      paymentStatus: formatPaymentStatusLabel(order.trade_status),
      fulfillmentStatus: formatFulfillmentStatusLabel(order.fulfillment_status),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    const message = error instanceof Error && error.message === "Forbidden" ? "Forbidden" : error instanceof Error ? error.message : "Failed to update order status";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.post("/pay-api/admin/orders/:merchantOrderId/fulfill", async (req, res) => {
  const client = await pool.connect();
  try {
    await requireCurrentAdmin(req);

    await client.query("BEGIN");
    const select = await client.query(
      "SELECT * FROM payment_orders WHERE merchant_order_id = $1 FOR UPDATE",
      [req.params.merchantOrderId],
    );
    if (!select.rows.length) {
      await client.query("ROLLBACK");
      return jsonError(res, 404, "Order not found");
    }

    let order = select.rows[0];
    if (order.trade_status !== "paid" && isQueryConfigured()) {
      const queryResult = await queryTrade(order);
      if (queryResult.normalizedStatus) {
        const update = await client.query(
          `
          UPDATE payment_orders
          SET trade_status = $2,
              platform_order_no = COALESCE($3, platform_order_no),
              raw_query_response = $4,
              last_checked_at = NOW(),
              updated_at = NOW()
          WHERE merchant_order_id = $1
          RETURNING *
          `,
          [
            order.merchant_order_id,
            queryResult.normalizedStatus,
            queryResult.platformOrderNo || null,
            JSON.stringify(queryResult.raw || null),
          ],
        );
        order = update.rows[0];
      }
    }

    if (order.fulfillment_status === "fulfilled") {
      await client.query("COMMIT");
      return res.json({
        ok: true,
        retried: false,
        order: normalizeOrderRow(order),
        paymentStatus: formatPaymentStatusLabel(order.trade_status),
        fulfillmentStatus: formatFulfillmentStatusLabel(order.fulfillment_status),
        message: "Order has already been fulfilled",
      });
    }

    if (order.trade_status !== "paid") {
      await client.query("ROLLBACK");
      return jsonError(
        res,
        400,
        `Order payment status is ${formatPaymentStatusLabel(order.trade_status)} and cannot be fulfilled yet`,
      );
    }

    order = await fulfillOrder(order, client);
    await client.query("COMMIT");
    res.json({
      ok: true,
      retried: true,
      order: normalizeOrderRow(order),
      paymentStatus: formatPaymentStatusLabel(order.trade_status),
      fulfillmentStatus: formatFulfillmentStatusLabel(order.fulfillment_status),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    const message = error instanceof Error && error.message === "Forbidden" ? "Forbidden" : error instanceof Error ? error.message : "Failed to fulfill order";
    jsonError(res, message === "Forbidden" ? 403 : 500, message);
  } finally {
    client.release();
  }
});

app.post("/pay-api/orders/:merchantOrderId/check", async (req, res) => {
  const client = await pool.connect();
  try {
    const user = await requireCurrentUser(req);

    await client.query("BEGIN");
    const select = await client.query(
      `SELECT * FROM payment_orders WHERE merchant_order_id = $1 AND user_id = $2 FOR UPDATE`,
      [req.params.merchantOrderId, Number(user.id)],
    );
    if (!select.rows.length) {
      await client.query("ROLLBACK");
      return jsonError(res, 404, "Order not found");
    }
    let order = select.rows[0];

    if (!isQueryConfigured()) {
      await client.query("COMMIT");
      return res.json({
        querySupported: false,
        order: normalizeOrderRow(order),
      });
    }

    const queryResult = await queryTrade(order);
    if (queryResult.normalizedStatus) {
      const update = await client.query(
        `
        UPDATE payment_orders
        SET trade_status = $2,
            platform_order_no = COALESCE($3, platform_order_no),
            raw_query_response = $4,
            last_checked_at = NOW(),
            updated_at = NOW()
        WHERE merchant_order_id = $1
        RETURNING *
        `,
        [
          order.merchant_order_id,
          queryResult.normalizedStatus,
          queryResult.platformOrderNo || null,
          JSON.stringify(queryResult.raw || null),
        ],
      );
      order = update.rows[0];
    }

    if (order.trade_status === "paid" && order.fulfillment_status !== "fulfilled") {
      order = await fulfillOrder(order, client);
    }

    await client.query("COMMIT");
    res.json({
      querySupported: true,
      order: normalizeOrderRow(order),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to check order");
  } finally {
    client.release();
  }
});

app.post("/pay-api/trading/notify", async (req, res) => {
  const client = await pool.connect();
  try {
    const { envelope, data } = normalizeTradingNotificationBody(req.body);
    if (!Object.keys(envelope).length) {
      return jsonError(res, 400, "Empty notification body");
    }

    if (config.alipaySign && !verifyTradingNotificationSignature(envelope, config.alipaySign)) {
      return jsonError(res, 400, "Invalid notification signature");
    }

    const merchantOrderId =
      data.orderid ||
      data.orderId ||
      data.out_trade_no ||
      envelope.orderid ||
      envelope.orderId ||
      envelope.out_trade_no;
    if (!merchantOrderId) {
      return jsonError(res, 400, "Missing merchant order id");
    }

    const notifiedStatusRaw =
      data.tradeStatus ||
      data.trade_status ||
      data.status ||
      envelope.tradeStatus ||
      envelope.trade_status ||
      envelope.status;
    const normalizedStatus = normalizeTradingStatus(notifiedStatusRaw);
    const notifiedAmountCents = amountToCents(
      data.totalAmount ??
      data.total_amount ??
      data.amount ??
      envelope.totalAmount ??
      envelope.total_amount ??
      envelope.amount,
    );
    const notifiedPlatformOrderNo =
      data.orderno ||
      data.tradeNo ||
      data.trade_no ||
      envelope.orderno ||
      envelope.tradeNo ||
      envelope.trade_no ||
      null;

    await client.query("BEGIN");
    const select = await client.query(
      `SELECT * FROM payment_orders WHERE merchant_order_id = $1 FOR UPDATE`,
      [merchantOrderId],
    );
    if (!select.rows.length) {
      await client.query("ROLLBACK");
      return jsonError(res, 404, "Order not found");
    }

    let order = select.rows[0];
    if (normalizedStatus === "paid" && notifiedAmountCents !== null && notifiedAmountCents !== Number(order.amount_cents)) {
      throw new Error(
        `Notification amount mismatch: expected ${order.amount_cents}, got ${notifiedAmountCents}`,
      );
    }

    if (normalizedStatus && normalizedStatus !== "pending") {
      const update = await client.query(
        `
        UPDATE payment_orders
        SET trade_status = $2,
            platform_order_no = COALESCE($3, platform_order_no),
            raw_notify_response = $4,
            notify_received_at = NOW(),
            last_checked_at = NOW(),
            updated_at = NOW()
        WHERE merchant_order_id = $1
        RETURNING *
        `,
        [
          order.merchant_order_id,
          normalizedStatus,
          notifiedPlatformOrderNo,
          JSON.stringify({ envelope, data }),
        ],
      );
      order = update.rows[0];
    }

    if (order.trade_status === "paid" && order.fulfillment_status !== "fulfilled") {
      order = await fulfillOrder(order, client);
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      order: normalizeOrderRow(order),
      paymentStatus: formatPaymentStatusLabel(order.trade_status),
      fulfillmentStatus: formatFulfillmentStatusLabel(order.fulfillment_status),
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to process notification");
  } finally {
    client.release();
  }
});

async function main() {
  await initDb();
  startPaymentOrderPoller();
  startTrafficPackReclaimPoller();
  app.listen(config.port, () => {
    console.log(`[zhisales-pay-service] listening on :${config.port}`);
  });
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  main().catch((error) => {
    console.error("[zhisales-pay-service] fatal:", error);
    process.exit(1);
  });
}
