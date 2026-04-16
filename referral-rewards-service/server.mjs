import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: (process.env.REWARDS_PUBLIC_BASE_URL || "https://www.zhisales.com").replace(/\/+$/, ""),
  registerPath: process.env.REWARDS_REGISTER_PATH || "/register",
  sourceCatalogPath: process.env.REWARDS_SOURCE_CATALOG_PATH || path.join(__dirname, "catalog.json"),
  db: {
    host: process.env.DB_HOST || "sub2api-postgres",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "zhisales_rewards",
    user: process.env.DB_USER || "sub2api",
    password: process.env.DB_PASSWORD || "",
  },
  sub2apiBaseUrl: (process.env.SUB2API_BASE_URL || "http://host.docker.internal:18080").replace(/\/+$/, ""),
  sub2apiAdminEmail: process.env.SUB2API_ADMIN_EMAIL || "",
  sub2apiAdminPassword: process.env.SUB2API_ADMIN_PASSWORD || "",
  internalApiKey: process.env.INTERNAL_API_KEY || "",
  adminApiKey: process.env.ADMIN_API_KEY || "",
};

const pool = new Pool(config.db);
const app = express();
const adminSession = {
  token: null,
  expiresAt: 0,
};

app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

function nowIso() {
  return new Date().toISOString();
}

function jsonError(res, status, message, extra = {}) {
  res.status(status).json({ error: message, ...extra });
}

function readBearerToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return "";
}

function buildInviteUrl(referralCode) {
  return `${config.publicBaseUrl}${config.registerPath}?ref=${encodeURIComponent(referralCode)}`;
}

function generateReferralCode() {
  return crypto.randomBytes(5).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
}

function generateRedeemNo() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `RDM${stamp}${random}`;
}

function parsePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseInteger(value) {
  const num = Number(value);
  if (!Number.isInteger(num)) return null;
  return num;
}

function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ["admin", "super_admin", "superadmin", "owner", "root"].includes(normalized);
}

async function readSourceCatalog() {
  try {
    const raw = await fs.readFile(config.sourceCatalogPath, "utf8");
    const parsed = JSON.parse(raw);
    const subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
    const balancePacks = Array.isArray(parsed.balance_packs) ? parsed.balance_packs : [];
    const items = [
      ...subscriptions.map((item) => ({
        type: "subscription",
        code: item.code,
        enabled: Boolean(item.enabled),
        title: item.title || item.code,
        description: item.description || "",
        amountCents: Number(item.amount_cents || 0),
        groupId: item.group_id == null ? null : Number(item.group_id),
        validityDays: item.validity_days == null ? null : Number(item.validity_days),
        balanceAmount: null,
      })),
      ...balancePacks.map((item) => ({
        type: "balance",
        code: item.code,
        enabled: Boolean(item.enabled),
        title: item.title || item.code,
        description: item.description || "",
        amountCents: Number(item.amount_cents || 0),
        groupId: null,
        validityDays: null,
        balanceAmount: item.balance_amount == null ? null : Number(item.balance_amount),
      })),
    ];
    return items;
  } catch {
    return [];
  }
}

async function getCatalogItemMap() {
  const items = await readSourceCatalog();
  return new Map(items.map((item) => [item.code, item]));
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
  return sub2apiJson("/api/v1/auth/me", {
    headers: {
      Authorization: `Bearer ${embeddedToken}`,
    },
  });
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

async function listUserSubscriptions(userId) {
  const data = await sub2apiAdminJson(`/api/v1/admin/users/${userId}/subscriptions?page=1&page_size=100`);
  return Array.isArray(data?.items) ? data.items : [];
}

function pickMatchingSubscription(subscriptions, groupId) {
  return subscriptions.find((item) => Number(item.group_id) === Number(groupId)) || null;
}

async function ensureAuthenticatedUser(req, res) {
  try {
    const user = await resolveCurrentUser(readBearerToken(req));
    return user;
  } catch (error) {
    jsonError(res, 401, error instanceof Error ? error.message : "Unauthorized");
    return null;
  }
}

async function ensureAdmin(req, res) {
  const headerKey = req.headers["x-admin-key"]?.toString() || "";
  if (config.adminApiKey && headerKey && headerKey === config.adminApiKey) {
    return { id: 0, email: "internal-admin", role: "admin" };
  }
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) return null;
  if (!isAdminRole(user.role)) {
    jsonError(res, 403, "Admin permission required");
    return null;
  }
  return user;
}

function ensureInternal(req, res) {
  const headerKey = req.headers["x-internal-key"]?.toString() || "";
  if (!config.internalApiKey) {
    jsonError(res, 500, "INTERNAL_API_KEY is not configured");
    return false;
  }
  if (!headerKey || headerKey !== config.internalApiKey) {
    jsonError(res, 403, "Invalid internal API key");
    return false;
  }
  return true;
}

async function ensureReferralProfile(userId, client = pool) {
  const existing = await client.query(
    `SELECT user_id, referral_code, created_at, updated_at FROM referral_profiles WHERE user_id = $1 LIMIT 1`,
    [Number(userId)],
  );
  if (existing.rows.length) {
    return existing.rows[0];
  }
  for (let attempt = 1; attempt <= 8; attempt++) {
    const referralCode = generateReferralCode();
    try {
      const insert = await client.query(
        `
        INSERT INTO referral_profiles (user_id, referral_code, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET updated_at = referral_profiles.updated_at
        RETURNING user_id, referral_code, created_at, updated_at
        `,
        [Number(userId), referralCode],
      );
      return insert.rows[0];
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("referral_profiles_referral_code_key")) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Failed to generate unique referral code");
}

async function createPointsAccountIfMissing(client, userId) {
  await client.query(
    `
    INSERT INTO points_accounts (user_id, balance, total_earned, total_spent, created_at, updated_at)
    VALUES ($1, 0, 0, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO NOTHING
    `,
    [Number(userId)],
  );
}

async function getLockedPointsAccount(client, userId) {
  await createPointsAccountIfMissing(client, userId);
  const result = await client.query(
    `SELECT user_id, balance, total_earned, total_spent FROM points_accounts WHERE user_id = $1 FOR UPDATE`,
    [Number(userId)],
  );
  if (!result.rows.length) {
    throw new Error("Points account not found");
  }
  return result.rows[0];
}

async function creditPoints(client, { userId, amount, type, referenceType, referenceId, remark }) {
  const account = await getLockedPointsAccount(client, userId);
  const currentBalance = Number(account.balance || 0);
  const nextBalance = currentBalance + Number(amount);
  await client.query(
    `
    UPDATE points_accounts
    SET balance = $2,
        total_earned = total_earned + $3,
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [Number(userId), nextBalance, Number(amount)],
  );
  await client.query(
    `
    INSERT INTO points_ledger (
      user_id, direction, amount, balance_after, type,
      reference_type, reference_id, remark, created_at
    ) VALUES ($1, 'credit', $2, $3, $4, $5, $6, $7, NOW())
    `,
    [Number(userId), Number(amount), nextBalance, type, referenceType || null, referenceId || null, remark || null],
  );
  return { balance: nextBalance };
}

async function debitPoints(client, { userId, amount, type, referenceType, referenceId, remark }) {
  const account = await getLockedPointsAccount(client, userId);
  const currentBalance = Number(account.balance || 0);
  const debitAmount = Number(amount);
  if (currentBalance < debitAmount) {
    throw new Error("Insufficient points balance");
  }
  const nextBalance = currentBalance - debitAmount;
  await client.query(
    `
    UPDATE points_accounts
    SET balance = $2,
        total_spent = total_spent + $3,
        updated_at = NOW()
    WHERE user_id = $1
    `,
    [Number(userId), nextBalance, debitAmount],
  );
  await client.query(
    `
    INSERT INTO points_ledger (
      user_id, direction, amount, balance_after, type,
      reference_type, reference_id, remark, created_at
    ) VALUES ($1, 'debit', $2, $3, $4, $5, $6, $7, NOW())
    `,
    [Number(userId), debitAmount, nextBalance, type, referenceType || null, referenceId || null, remark || null],
  );
  return { balance: nextBalance };
}

async function resolveReferrerByCode(client, referralCode) {
  const result = await client.query(
    `SELECT user_id, referral_code FROM referral_profiles WHERE referral_code = $1 LIMIT 1`,
    [String(referralCode || "").trim().toUpperCase()],
  );
  return result.rows[0] || null;
}

async function bindReferralRelationship(client, { referredUserId, referralCode }) {
  const normalizedCode = String(referralCode || "").trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error("referral_code is required");
  }
  const referrerProfile = await resolveReferrerByCode(client, normalizedCode);
  if (!referrerProfile) {
    throw new Error("Referral code not found");
  }
  const referrerUserId = Number(referrerProfile.user_id);
  const normalizedReferredUserId = Number(referredUserId);
  if (normalizedReferredUserId === referrerUserId) {
    throw new Error("Self-referral is not allowed");
  }

  const existing = await client.query(
    `
    SELECT id, referred_user_id, referrer_user_id, source_code, status, bound_at
    FROM referral_relationships
    WHERE referred_user_id = $1
    LIMIT 1
    `,
    [normalizedReferredUserId],
  );
  if (existing.rows.length) {
    const current = existing.rows[0];
    if (Number(current.referrer_user_id) === referrerUserId) {
      return { created: false, relationship: current };
    }
    throw new Error("Referral relationship already exists and can only be corrected by admin");
  }

  const inserted = await client.query(
    `
    INSERT INTO referral_relationships (
      referred_user_id, referrer_user_id, source_code, status,
      bound_at, created_at, updated_at
    ) VALUES ($1, $2, $3, 'active', NOW(), NOW(), NOW())
    RETURNING id, referred_user_id, referrer_user_id, source_code, status, bound_at
    `,
    [normalizedReferredUserId, referrerUserId, normalizedCode],
  );
  return { created: true, relationship: inserted.rows[0] };
}

async function loadRewardRule(client, skuCode) {
  const result = await client.query(
    `SELECT sku_code, enabled, reward_points_per_purchase, created_at, updated_at FROM reward_rules WHERE sku_code = $1 LIMIT 1`,
    [skuCode],
  );
  return result.rows[0] || null;
}

async function loadRedemptionRule(client, skuCode) {
  const result = await client.query(
    `
    SELECT sku_code, enabled, points_cost, group_id, validity_days, created_at, updated_at
    FROM redemption_rules WHERE sku_code = $1 LIMIT 1
    `,
    [skuCode],
  );
  return result.rows[0] || null;
}

async function grantRewardForOrder(body) {
  const client = await pool.connect();
  try {
    const eventId = String(body.event_id || "").trim();
    const orderId = String(body.order_id || "").trim();
    const skuCode = String(body.sku_code || "").trim();
    const buyerUserId = parseInteger(body.buyer_user_id);
    const amountCents = parseInteger(body.amount_cents);
    const fulfilledAt = body.fulfilled_at ? String(body.fulfilled_at) : nowIso();

    if (!orderId || !skuCode || buyerUserId == null || amountCents == null) {
      throw new Error("event_id/order_id, buyer_user_id, sku_code, amount_cents are required");
    }

    const eventKey = eventId || `order:${orderId}`;

    await client.query("BEGIN");

    const inserted = await client.query(
      `
      INSERT INTO reward_events (
        event_key, order_id, buyer_user_id, referrer_user_id, sku_code,
        status, payload, created_at, updated_at
      ) VALUES ($1, $2, $3, NULL, $4, 'processing', $5, NOW(), NOW())
      ON CONFLICT (event_key) DO NOTHING
      RETURNING id, event_key, status
      `,
      [eventKey, orderId, buyerUserId, skuCode, JSON.stringify(body)],
    );

    if (!inserted.rows.length) {
      const existing = await client.query(
        `
        SELECT event_key, order_id, buyer_user_id, referrer_user_id, sku_code, status
        FROM reward_events WHERE event_key = $1 LIMIT 1
        `,
        [eventKey],
      );
      await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        event: existing.rows[0] || null,
      };
    }

    const relationshipResult = await client.query(
      `
      SELECT referrer_user_id
      FROM referral_relationships
      WHERE referred_user_id = $1
      LIMIT 1
      `,
      [buyerUserId],
    );
    const relationship = relationshipResult.rows[0] || null;
    const rewardRule = await loadRewardRule(client, skuCode);

    if (!relationship || !rewardRule || !rewardRule.enabled || Number(rewardRule.reward_points_per_purchase || 0) <= 0) {
      const status = !relationship ? "ignored_no_referrer" : "ignored_no_rule";
      await client.query(
        `
        UPDATE reward_events
        SET status = $2,
            payload = $3,
            updated_at = NOW()
        WHERE event_key = $1
        `,
        [eventKey, status, JSON.stringify(body)],
      );
      await client.query("COMMIT");
      return {
        ok: true,
        rewarded: false,
        reason: status,
      };
    }

    const referrerUserId = Number(relationship.referrer_user_id);
    if (referrerUserId === buyerUserId) {
      await client.query(
        `UPDATE reward_events SET status = 'ignored_self_referral', updated_at = NOW() WHERE event_key = $1`,
        [eventKey],
      );
      await client.query("COMMIT");
      return { ok: true, rewarded: false, reason: "ignored_self_referral" };
    }

    const rewardPoints = Number(rewardRule.reward_points_per_purchase);
    const credit = await creditPoints(client, {
      userId: referrerUserId,
      amount: rewardPoints,
      type: "referral_reward",
      referenceType: "order",
      referenceId: orderId,
      remark: `Reward for referred purchase ${skuCode}`,
    });

    await client.query(
      `
      UPDATE reward_events
      SET referrer_user_id = $2,
          status = 'rewarded',
          payload = $3,
          updated_at = NOW()
      WHERE event_key = $1
      `,
      [eventKey, referrerUserId, JSON.stringify({ ...body, reward_points: rewardPoints, fulfilled_at: fulfilledAt })],
    );

    await client.query("COMMIT");
    return {
      ok: true,
      rewarded: true,
      referrer_user_id: referrerUserId,
      reward_points: rewardPoints,
      balance_after: credit.balance,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function fulfillSubscriptionRedemption(userId, rule, redeemNo) {
  const subscriptions = await listUserSubscriptions(userId);
  const notes = `points-redeem:${redeemNo}`;
  const existing = pickMatchingSubscription(subscriptions, rule.group_id);
  if (existing) {
    await sub2apiAdminJson(`/api/v1/admin/subscriptions/${existing.id}/extend`, {
      method: "POST",
      body: { days: Number(rule.validity_days) },
    });
    return {
      subscriptionId: Number(existing.id),
      operation: "extend",
    };
  }
  const created = await sub2apiAdminJson("/api/v1/admin/subscriptions/assign", {
    method: "POST",
    body: {
      user_id: Number(userId),
      group_id: Number(rule.group_id),
      validity_days: Number(rule.validity_days),
      notes,
    },
  });
  return {
    subscriptionId: created?.id == null ? null : Number(created.id),
    operation: "assign",
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_profiles (
      user_id BIGINT PRIMARY KEY,
      referral_code VARCHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_relationships (
      id BIGSERIAL PRIMARY KEY,
      referred_user_id BIGINT NOT NULL UNIQUE,
      referrer_user_id BIGINT NOT NULL,
      source_code VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      corrected_by BIGINT,
      corrected_at TIMESTAMPTZ,
      correct_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_relationships_referrer ON referral_relationships(referrer_user_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_accounts (
      user_id BIGINT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      total_earned INTEGER NOT NULL DEFAULT 0,
      total_spent INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS points_ledger (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      direction VARCHAR(16) NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type VARCHAR(64) NOT NULL,
      reference_type VARCHAR(64),
      reference_id VARCHAR(128),
      remark TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_points_ledger_user_created ON points_ledger(user_id, created_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reward_rules (
      sku_code VARCHAR(64) PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      reward_points_per_purchase INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS redemption_rules (
      sku_code VARCHAR(64) PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      points_cost INTEGER NOT NULL,
      group_id BIGINT NOT NULL,
      validity_days INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reward_events (
      id BIGSERIAL PRIMARY KEY,
      event_key VARCHAR(128) NOT NULL UNIQUE,
      order_id VARCHAR(128) NOT NULL,
      buyer_user_id BIGINT NOT NULL,
      referrer_user_id BIGINT,
      sku_code VARCHAR(64) NOT NULL,
      status VARCHAR(64) NOT NULL,
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reward_events_buyer ON reward_events(buyer_user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_reward_events_referrer ON reward_events(referrer_user_id, created_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS redemption_orders (
      id BIGSERIAL PRIMARY KEY,
      redeem_no VARCHAR(64) NOT NULL UNIQUE,
      user_id BIGINT NOT NULL,
      sku_code VARCHAR(64) NOT NULL,
      points_cost INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL,
      subscription_id BIGINT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_redemption_orders_user ON redemption_orders(user_id, created_at DESC);`);
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const catalog = await readSourceCatalog();
    res.json({
      status: "ok",
      timestamp: nowIso(),
      catalogItems: catalog.length,
      internalApiKeyConfigured: Boolean(config.internalApiKey),
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "database error");
  }
});

app.get("/api/referral/me", async (req, res) => {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const client = await pool.connect();
    try {
      const profile = await ensureReferralProfile(user.id, client);
      await createPointsAccountIfMissing(client, user.id);
      const invitedResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM referral_relationships WHERE referrer_user_id = $1`,
        [Number(user.id)],
      );
      const rewardedResult = await client.query(
        `SELECT COUNT(*)::int AS count FROM reward_events WHERE referrer_user_id = $1 AND status = 'rewarded'`,
        [Number(user.id)],
      );
      const accountResult = await client.query(
        `SELECT balance, total_earned, total_spent FROM points_accounts WHERE user_id = $1 LIMIT 1`,
        [Number(user.id)],
      );
      const account = accountResult.rows[0] || { balance: 0, total_earned: 0, total_spent: 0 };
      res.setHeader("Cache-Control", "no-store");
      res.json({
        referral_code: profile.referral_code,
        invite_url: buildInviteUrl(profile.referral_code),
        invited_count: Number(invitedResult.rows[0]?.count || 0),
        rewarded_purchase_count: Number(rewardedResult.rows[0]?.count || 0),
        points_balance: Number(account.balance || 0),
        total_earned: Number(account.total_earned || 0),
        total_spent: Number(account.total_spent || 0),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to load referral profile");
  }
});

app.post("/api/referral/bind-registration", async (req, res) => {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) return;

  const referralCode = String(req.body?.referral_code || "").trim();
  if (!referralCode) {
    return jsonError(res, 400, "referral_code is required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await bindReferralRelationship(client, {
      referredUserId: user.id,
      referralCode,
    });
    await client.query("COMMIT");
    return res.json({ success: true, created: result.created, relationship: result.relationship });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    const message = error instanceof Error ? error.message : "Failed to bind referral";
    const status = message.includes("already exists") ? 409 : 400;
    return jsonError(res, status, message);
  } finally {
    client.release();
  }
});

app.post("/internal/referrals/bind-registration", async (req, res) => {
  if (!ensureInternal(req, res)) return;

  const referredUserId = parseInteger(req.body?.referred_user_id);
  const referralCode = String(req.body?.referral_code || "").trim();
  if (referredUserId == null || !referralCode) {
    return jsonError(res, 400, "referred_user_id and referral_code are required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await bindReferralRelationship(client, {
      referredUserId,
      referralCode,
    });
    await client.query("COMMIT");
    return res.json({ success: true, created: result.created, relationship: result.relationship });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    const message = error instanceof Error ? error.message : "Failed to bind referral";
    const status = message.includes("already exists") ? 409 : 400;
    return jsonError(res, status, message);
  } finally {
    client.release();
  }
});

app.get("/api/points/ledger", async (req, res) => {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) return;

  const page = Math.max(1, parseInteger(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInteger(req.query.page_size) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT id, direction, amount, balance_after, type, reference_type, reference_id, remark, created_at
        FROM points_ledger
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT $2 OFFSET $3
        `,
        [Number(user.id), pageSize, offset],
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM points_ledger WHERE user_id = $1`, [Number(user.id)]),
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      page,
      page_size: pageSize,
      total: Number(totalResult.rows[0]?.count || 0),
      items: itemsResult.rows.map((row) => ({
        id: Number(row.id),
        direction: row.direction,
        amount: Number(row.amount),
        balance_after: Number(row.balance_after),
        type: row.type,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        remark: row.remark,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to load points ledger");
  }
});

app.get("/api/redemptions/catalog", async (_req, res) => {
  try {
    const [catalogMap, rulesResult] = await Promise.all([
      getCatalogItemMap(),
      pool.query(
        `
        SELECT sku_code, enabled, points_cost, group_id, validity_days
        FROM redemption_rules
        WHERE enabled = TRUE
        ORDER BY points_cost ASC, sku_code ASC
        `,
      ),
    ]);

    const items = rulesResult.rows.map((rule) => {
      const catalog = catalogMap.get(rule.sku_code) || null;
      return {
        sku_code: rule.sku_code,
        title: catalog?.title || rule.sku_code,
        description: catalog?.description || "",
        cash_amount_cents: catalog?.amountCents ?? null,
        points_cost: Number(rule.points_cost),
        group_id: Number(rule.group_id),
        validity_days: Number(rule.validity_days),
        type: catalog?.type || "subscription",
      };
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({ items });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to load redemption catalog");
  }
});

app.post("/api/redemptions/redeem", async (req, res) => {
  const user = await ensureAuthenticatedUser(req, res);
  if (!user) return;

  const skuCode = String(req.body?.sku_code || "").trim();
  if (!skuCode) {
    return jsonError(res, 400, "sku_code is required");
  }

  const client = await pool.connect();
  try {
    const rule = await loadRedemptionRule(client, skuCode);
    if (!rule || !rule.enabled) {
      return jsonError(res, 400, "SKU is not enabled for points redemption");
    }
    const redeemNo = generateRedeemNo();
    await client.query("BEGIN");
    await client.query(
      `
      INSERT INTO redemption_orders (
        redeem_no, user_id, sku_code, points_cost, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'pending', NOW(), NOW())
      `,
      [redeemNo, Number(user.id), skuCode, Number(rule.points_cost)],
    );

    const debit = await debitPoints(client, {
      userId: user.id,
      amount: Number(rule.points_cost),
      type: "redeem_subscription",
      referenceType: "redeem_no",
      referenceId: redeemNo,
      remark: `Redeem ${skuCode}`,
    });

    const fulfillment = await fulfillSubscriptionRedemption(Number(user.id), rule, redeemNo);

    await client.query(
      `
      UPDATE redemption_orders
      SET status = 'fulfilled',
          subscription_id = $2,
          updated_at = NOW()
      WHERE redeem_no = $1
      `,
      [redeemNo, fulfillment.subscriptionId],
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      redeem_no: redeemNo,
      sku_code: skuCode,
      points_cost: Number(rule.points_cost),
      balance_after: debit.balance,
      fulfillment,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    const message = error instanceof Error ? error.message : "Failed to redeem points";
    return jsonError(res, message.includes("Insufficient points") ? 400 : 500, message);
  } finally {
    client.release();
  }
});

app.post("/internal/events/order-fulfilled", async (req, res) => {
  if (!ensureInternal(req, res)) return;
  try {
    const result = await grantRewardForOrder(req.body || {});
    res.json(result);
  } catch (error) {
    jsonError(res, 400, error instanceof Error ? error.message : "Failed to process reward event");
  }
});

app.get("/admin/reward-rules", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;
  try {
    const [catalogMap, result] = await Promise.all([
      getCatalogItemMap(),
      pool.query(`SELECT sku_code, enabled, reward_points_per_purchase, created_at, updated_at FROM reward_rules ORDER BY sku_code ASC`),
    ]);
    res.json({
      items: result.rows.map((row) => {
        const catalog = catalogMap.get(row.sku_code) || null;
        return {
          sku_code: row.sku_code,
          enabled: row.enabled,
          reward_points_per_purchase: Number(row.reward_points_per_purchase),
          title: catalog?.title || row.sku_code,
          cash_amount_cents: catalog?.amountCents ?? null,
          updated_at: row.updated_at,
        };
      }),
      actor: admin.email || null,
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to list reward rules");
  }
});

app.put("/admin/reward-rules/:sku_code", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const skuCode = String(req.params.sku_code || "").trim();
  const enabled = Boolean(req.body?.enabled);
  const rewardPoints = parseInteger(req.body?.reward_points_per_purchase);
  if (!skuCode || rewardPoints == null || rewardPoints < 0) {
    return jsonError(res, 400, "sku_code and non-negative reward_points_per_purchase are required");
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO reward_rules (sku_code, enabled, reward_points_per_purchase, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (sku_code)
      DO UPDATE SET enabled = EXCLUDED.enabled,
                    reward_points_per_purchase = EXCLUDED.reward_points_per_purchase,
                    updated_at = NOW()
      RETURNING sku_code, enabled, reward_points_per_purchase, updated_at
      `,
      [skuCode, enabled, rewardPoints],
    );
    res.json({ success: true, rule: result.rows[0], actor: admin.email || null });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to save reward rule");
  }
});

app.get("/admin/redemption-rules", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;
  try {
    const [catalogMap, result] = await Promise.all([
      getCatalogItemMap(),
      pool.query(`SELECT sku_code, enabled, points_cost, group_id, validity_days, updated_at FROM redemption_rules ORDER BY sku_code ASC`),
    ]);
    res.json({
      items: result.rows.map((row) => {
        const catalog = catalogMap.get(row.sku_code) || null;
        return {
          sku_code: row.sku_code,
          enabled: row.enabled,
          points_cost: Number(row.points_cost),
          group_id: Number(row.group_id),
          validity_days: Number(row.validity_days),
          title: catalog?.title || row.sku_code,
          cash_amount_cents: catalog?.amountCents ?? null,
          updated_at: row.updated_at,
        };
      }),
      actor: admin.email || null,
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to list redemption rules");
  }
});

app.put("/admin/redemption-rules/:sku_code", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const skuCode = String(req.params.sku_code || "").trim();
  if (!skuCode) {
    return jsonError(res, 400, "sku_code is required");
  }

  const catalogMap = await getCatalogItemMap();
  const catalog = catalogMap.get(skuCode) || null;
  const enabled = Boolean(req.body?.enabled);
  const pointsCost = parsePositiveInteger(req.body?.points_cost);
  const groupId = parseInteger(req.body?.group_id ?? catalog?.groupId);
  const validityDays = parsePositiveInteger(req.body?.validity_days ?? catalog?.validityDays);

  if (pointsCost == null || groupId == null || validityDays == null) {
    return jsonError(res, 400, "points_cost, group_id, and validity_days are required");
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO redemption_rules (sku_code, enabled, points_cost, group_id, validity_days, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (sku_code)
      DO UPDATE SET enabled = EXCLUDED.enabled,
                    points_cost = EXCLUDED.points_cost,
                    group_id = EXCLUDED.group_id,
                    validity_days = EXCLUDED.validity_days,
                    updated_at = NOW()
      RETURNING sku_code, enabled, points_cost, group_id, validity_days, updated_at
      `,
      [skuCode, enabled, pointsCost, groupId, validityDays],
    );
    res.json({ success: true, rule: result.rows[0], actor: admin.email || null });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to save redemption rule");
  }
});

app.get("/admin/referrals", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const page = Math.max(1, parseInteger(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInteger(req.query.page_size) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT id, referred_user_id, referrer_user_id, source_code, status,
               bound_at, corrected_by, corrected_at, correct_reason, updated_at
        FROM referral_relationships
        ORDER BY id DESC
        LIMIT $1 OFFSET $2
        `,
        [pageSize, offset],
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM referral_relationships`),
    ]);

    res.json({
      page,
      page_size: pageSize,
      total: Number(totalResult.rows[0]?.count || 0),
      items: itemsResult.rows,
      actor: admin.email || null,
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to list referrals");
  }
});

app.get("/admin/points/accounts", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const page = Math.max(1, parseInteger(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInteger(req.query.page_size) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT user_id, balance, total_earned, total_spent, updated_at
        FROM points_accounts
        ORDER BY balance DESC, user_id DESC
        LIMIT $1 OFFSET $2
        `,
        [pageSize, offset],
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM points_accounts`),
    ]);

    res.json({
      page,
      page_size: pageSize,
      total: Number(totalResult.rows[0]?.count || 0),
      items: itemsResult.rows,
      actor: admin.email || null,
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to list points accounts");
  }
});

app.get("/admin/reward-events", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const page = Math.max(1, parseInteger(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInteger(req.query.page_size) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT id, event_key, order_id, buyer_user_id, referrer_user_id, sku_code, status, created_at, updated_at
        FROM reward_events
        ORDER BY id DESC
        LIMIT $1 OFFSET $2
        `,
        [pageSize, offset],
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM reward_events`),
    ]);

    res.json({
      page,
      page_size: pageSize,
      total: Number(totalResult.rows[0]?.count || 0),
      items: itemsResult.rows,
      actor: admin.email || null,
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to list reward events");
  }
});

app.get("/admin/redemption-orders", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const page = Math.max(1, parseInteger(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInteger(req.query.page_size) || 20));
  const offset = (page - 1) * pageSize;

  try {
    const [itemsResult, totalResult] = await Promise.all([
      pool.query(
        `
        SELECT id, redeem_no, user_id, sku_code, points_cost, status, subscription_id, error_message, created_at, updated_at
        FROM redemption_orders
        ORDER BY id DESC
        LIMIT $1 OFFSET $2
        `,
        [pageSize, offset],
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM redemption_orders`),
    ]);

    res.json({
      page,
      page_size: pageSize,
      total: Number(totalResult.rows[0]?.count || 0),
      items: itemsResult.rows,
      actor: admin.email || null,
    });
  } catch (error) {
    jsonError(res, 500, error instanceof Error ? error.message : "Failed to list redemption orders");
  }
});

app.put("/admin/referrals/:referred_user_id", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const referredUserId = parseInteger(req.params.referred_user_id);
  if (referredUserId == null) {
    return jsonError(res, 400, "Invalid referred_user_id");
  }

  const newReferrerUserId = parseInteger(req.body?.referrer_user_id);
  const referralCode = String(req.body?.referral_code || "").trim();
  const reason = String(req.body?.reason || "").trim() || "admin correction";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let referrerUserId = newReferrerUserId;
    let sourceCode = referralCode.toUpperCase();

    if (referrerUserId == null && sourceCode) {
      const profile = await resolveReferrerByCode(client, sourceCode);
      if (!profile) {
        throw new Error("Referral code not found");
      }
      referrerUserId = Number(profile.user_id);
      sourceCode = profile.referral_code;
    }

    if (referrerUserId == null && !sourceCode) {
      throw new Error("referrer_user_id or referral_code is required");
    }

    if (referrerUserId === referredUserId) {
      throw new Error("Self-referral is not allowed");
    }

    if (!sourceCode && referrerUserId != null) {
      const profile = await ensureReferralProfile(referrerUserId, client);
      sourceCode = profile.referral_code;
    }

    const existing = await client.query(
      `SELECT id FROM referral_relationships WHERE referred_user_id = $1 LIMIT 1`,
      [referredUserId],
    );

    let relationship;
    if (existing.rows.length) {
      const updated = await client.query(
        `
        UPDATE referral_relationships
        SET referrer_user_id = $2,
            source_code = $3,
            status = 'corrected',
            corrected_by = $4,
            corrected_at = NOW(),
            correct_reason = $5,
            updated_at = NOW()
        WHERE referred_user_id = $1
        RETURNING id, referred_user_id, referrer_user_id, source_code, status, corrected_at, correct_reason
        `,
        [referredUserId, referrerUserId, sourceCode, Number(admin.id || 0), reason],
      );
      relationship = updated.rows[0];
    } else {
      const inserted = await client.query(
        `
        INSERT INTO referral_relationships (
          referred_user_id, referrer_user_id, source_code, status,
          bound_at, corrected_by, corrected_at, correct_reason, created_at, updated_at
        ) VALUES ($1, $2, $3, 'corrected', NOW(), $4, NOW(), $5, NOW(), NOW())
        RETURNING id, referred_user_id, referrer_user_id, source_code, status, corrected_at, correct_reason
        `,
        [referredUserId, referrerUserId, sourceCode, Number(admin.id || 0), reason],
      );
      relationship = inserted.rows[0];
    }

    await client.query("COMMIT");
    res.json({ success: true, relationship, actor: admin.email || null });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    jsonError(res, 400, error instanceof Error ? error.message : "Failed to correct referral relationship");
  } finally {
    client.release();
  }
});

app.post("/admin/points/adjust", async (req, res) => {
  const admin = await ensureAdmin(req, res);
  if (!admin) return;

  const userId = parseInteger(req.body?.user_id);
  const amount = parseInteger(req.body?.amount);
  const remark = String(req.body?.remark || "").trim();
  if (userId == null || amount == null || amount === 0 || !remark) {
    return jsonError(res, 400, "user_id, non-zero amount, and remark are required");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let result;
    if (amount > 0) {
      result = await creditPoints(client, {
        userId,
        amount,
        type: "manual_adjust",
        referenceType: "admin",
        referenceId: String(admin.id || 0),
        remark,
      });
    } else {
      result = await debitPoints(client, {
        userId,
        amount: Math.abs(amount),
        type: "manual_adjust",
        referenceType: "admin",
        referenceId: String(admin.id || 0),
        remark,
      });
    }
    await client.query("COMMIT");
    res.json({ success: true, balance_after: result.balance, actor: admin.email || null });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    const message = error instanceof Error ? error.message : "Failed to adjust points";
    jsonError(res, message.includes("Insufficient points") ? 400 : 500, message);
  } finally {
    client.release();
  }
});

async function main() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`[referral-rewards-service] listening on :${config.port}`);
  });
}

main().catch((error) => {
  console.error("[referral-rewards-service] fatal:", error);
  process.exit(1);
});
