import crypto from "node:crypto";
import http from "node:http";

import express from "express";
import pg from "pg";

import { chinaDay, decideReservation, estimateReservationUsd, normalizeQuotaState } from "./quota-engine.mjs";

const { Pool } = pg;

const config = {
  port: Number(process.env.PORT || 18193),
  upstreamBaseUrl: (process.env.SUB2API_UPSTREAM_BASE_URL || "http://sub2api:8080").replace(/\/+$/, ""),
  quotaDb: {
    host: process.env.QUOTA_DB_HOST || process.env.DB_HOST || "sub2api-postgres",
    port: Number(process.env.QUOTA_DB_PORT || process.env.DB_PORT || 5432),
    database: process.env.QUOTA_DB_NAME || "zhisales_pay",
    user: process.env.QUOTA_DB_USER || process.env.DB_USER || "sub2api",
    password: process.env.QUOTA_DB_PASSWORD || process.env.DB_PASSWORD || "",
  },
  upstreamDb: {
    host: process.env.SUB2API_DB_HOST || process.env.DB_HOST || "sub2api-postgres",
    port: Number(process.env.SUB2API_DB_PORT || process.env.DB_PORT || 5432),
    database: process.env.SUB2API_DB_NAME || "sub2api",
    user: process.env.SUB2API_DB_USER || process.env.DB_USER || "sub2api",
    password: process.env.SUB2API_DB_PASSWORD || process.env.DB_PASSWORD || "",
  },
  internalKey: process.env.QUOTA_GATEWAY_INTERNAL_KEY || "",
  defaultHoldUsd: Number(process.env.QUOTA_GATEWAY_DEFAULT_HOLD_USD || 5),
  maxHoldUsd: Number(process.env.QUOTA_GATEWAY_MAX_HOLD_USD || 10),
  maxUsdPer1kTokens: Number(process.env.QUOTA_GATEWAY_MAX_USD_PER_1K_TOKENS || 0.1),
  usagePollDelayMs: Number(process.env.QUOTA_GATEWAY_USAGE_POLL_DELAY_MS || 1_000),
  usagePollAttempts: Number(process.env.QUOTA_GATEWAY_USAGE_POLL_ATTEMPTS || 10),
};

export async function ensureQuotaSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS traffic_pack_quota_states (
      user_id BIGINT PRIMARY KEY,
      daily_window_start DATE NOT NULL,
      base_daily_quota_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      renewal_daily_quota_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      effective_daily_quota_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      daily_usage_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      reserved_usage_usd NUMERIC(20,8) NOT NULL DEFAULT 0,
      traffic_pack_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await db.query(`ALTER TABLE traffic_pack_quota_states ADD COLUMN IF NOT EXISTS renewal_daily_quota_usd NUMERIC(20,8) NOT NULL DEFAULT 0;`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS traffic_pack_quota_holds (
      request_id UUID PRIMARY KEY,
      user_id BIGINT NOT NULL,
      api_key_id BIGINT NOT NULL,
      daily_window_start DATE,
      reserved_usd NUMERIC(20,8) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actual_usage_usd NUMERIC(20,8),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);
  await db.query(`ALTER TABLE traffic_pack_quota_holds ADD COLUMN IF NOT EXISTS daily_window_start DATE;`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_traffic_pack_quota_holds_pending ON traffic_pack_quota_holds (status, expires_at);`);
}

function isInternalRequest(req) {
  return Boolean(config.internalKey) && req.get("X-Internal-Key") === config.internalKey;
}

function parseApiKey(req) {
  const authorization = req.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  return (req.get("x-api-key") || "").trim();
}

function jsonError(res, status, message) {
  res.status(status).json({ error: { message, type: "quota_error" } });
}

function dbRowToState(row) {
  if (!row) return null;
  const dailyWindowStart = row.daily_window_start instanceof Date
    ? row.daily_window_start.toISOString().slice(0, 10)
    : String(row.daily_window_start).slice(0, 10);
  return {
    userId: Number(row.user_id),
    dailyWindowStart,
    baseDailyQuota: Number(row.base_daily_quota_usd),
    renewalDailyQuota: Number(row.renewal_daily_quota_usd),
    effectiveDailyQuota: Number(row.effective_daily_quota_usd),
    dailyUsageUsd: Number(row.daily_usage_usd),
    reservedUsageUsd: Number(row.reserved_usage_usd),
    trafficPackExpiresAt: row.traffic_pack_expires_at ? new Date(row.traffic_pack_expires_at).toISOString() : null,
  };
}

async function normalizeStateInTransaction(client, row, now = new Date()) {
  const state = normalizeQuotaState(dbRowToState(row), now);
  if (!state?.changed) return state;
  const result = await client.query(
    `UPDATE traffic_pack_quota_states
        SET daily_window_start = $2,
            base_daily_quota_usd = $3,
            effective_daily_quota_usd = $4,
            daily_usage_usd = $5,
            reserved_usage_usd = $6,
            traffic_pack_expires_at = $7,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
    [state.userId, state.dailyWindowStart, state.baseDailyQuota, state.effectiveDailyQuota, state.dailyUsageUsd, state.reservedUsageUsd, state.trafficPackExpiresAt],
  );
  await client.query(
    `UPDATE traffic_pack_quota_holds
        SET status = 'released', settled_at = NOW()
      WHERE user_id = $1
        AND status = 'pending'
        AND daily_window_start IS NOT NULL
        AND daily_window_start < $2`,
    [state.userId, state.dailyWindowStart],
  );
  return dbRowToState(result.rows[0]);
}

export async function reserveQuota(quotaDb, { userId, apiKeyId, amountUsd, requestId = crypto.randomUUID(), now = new Date() }) {
  const client = await quotaDb.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM traffic_pack_quota_states WHERE user_id = $1 FOR UPDATE", [userId]);
    if (!rows.length) {
      await client.query("COMMIT");
      return { managed: false, requestId };
    }
    const state = await normalizeStateInTransaction(client, rows[0], now);
    const decision = decideReservation(state, amountUsd, now);
    if (!decision.allowed) {
      await client.query("ROLLBACK");
      return { managed: true, allowed: false, requestId, remainingUsd: decision.remainingUsd };
    }
    await client.query(
      `UPDATE traffic_pack_quota_states
          SET reserved_usage_usd = reserved_usage_usd + $2, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, amountUsd],
    );
    await client.query(
      `INSERT INTO traffic_pack_quota_holds (request_id, user_id, api_key_id, daily_window_start, reserved_usd, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 minutes')`,
      [requestId, userId, apiKeyId, state.dailyWindowStart, amountUsd],
    );
    await client.query("COMMIT");
    return { managed: true, allowed: true, requestId };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function releaseQuotaHold(quotaDb, requestId) {
  const client = await quotaDb.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM traffic_pack_quota_holds WHERE request_id = $1 FOR UPDATE",
      [requestId],
    );
    const hold = rows[0];
    if (!hold || hold.status !== "pending") {
      await client.query("COMMIT");
      return false;
    }
    await client.query(
      "UPDATE traffic_pack_quota_states SET reserved_usage_usd = GREATEST(0, reserved_usage_usd - $2), updated_at = NOW() WHERE user_id = $1",
      [hold.user_id, hold.reserved_usd],
    );
    await client.query("UPDATE traffic_pack_quota_holds SET status = 'released', settled_at = NOW() WHERE request_id = $1", [requestId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function settleQuotaHold(quotaDb, requestId, actualUsageUsd) {
  const client = await quotaDb.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM traffic_pack_quota_holds WHERE request_id = $1 FOR UPDATE", [requestId]);
    const hold = rows[0];
    if (!hold || hold.status !== "pending") {
      await client.query("COMMIT");
      return false;
    }
    await client.query(
      `UPDATE traffic_pack_quota_states
          SET reserved_usage_usd = GREATEST(0, reserved_usage_usd - $2),
              daily_usage_usd = daily_usage_usd + $3,
              updated_at = NOW()
        WHERE user_id = $1`,
      [hold.user_id, hold.reserved_usd, Math.max(0, Number(actualUsageUsd) || 0)],
    );
    await client.query(
      "UPDATE traffic_pack_quota_holds SET status = 'settled', actual_usage_usd = $2, settled_at = NOW() WHERE request_id = $1",
      [requestId, Math.max(0, Number(actualUsageUsd) || 0)],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function findApiKeyOwner(upstreamDb, rawKey) {
  const { rows } = await upstreamDb.query(
    `SELECT id, user_id
       FROM api_keys
      WHERE key = $1 AND status = 'active' AND deleted_at IS NULL
      LIMIT 1`,
    [rawKey],
  );
  return rows[0] || null;
}

async function settleFromUpstreamUsage({ quotaDb, upstreamDb, requestId, apiKeyId }) {
  for (let attempt = 0; attempt < config.usagePollAttempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, config.usagePollDelayMs));
    const { rows } = await upstreamDb.query(
      `SELECT total_cost FROM usage_logs WHERE request_id = $1 AND api_key_id = $2 ORDER BY id DESC LIMIT 1`,
      [requestId, apiKeyId],
    );
    if (rows.length) {
      await settleQuotaHold(quotaDb, requestId, rows[0].total_cost);
      return;
    }
  }
  await releaseQuotaHold(quotaDb, requestId);
}

function createProxyHandler({ quotaDb, upstreamDb }) {
  return async (req, res) => {
    const apiKey = parseApiKey(req);
    if (!apiKey) return jsonError(res, 401, "Missing API key");
    const owner = await findApiKeyOwner(upstreamDb, apiKey);
    if (!owner) return jsonError(res, 401, "Invalid API key");

    const requestId = crypto.randomUUID();
    let body = null;
    const contentType = req.get("content-type") || "";
    if (contentType.includes("application/json") && req.body && typeof req.body === "object") body = req.body;
    const estimatedUsd = estimateReservationUsd({
      contentLength: req.get("content-length"), body, defaultHoldUsd: config.defaultHoldUsd, maxHoldUsd: config.maxHoldUsd, maxUsdPer1kTokens: config.maxUsdPer1kTokens,
    });
    const hold = await reserveQuota(quotaDb, {
      userId: Number(owner.user_id), apiKeyId: Number(owner.id), amountUsd: estimatedUsd, requestId,
    });
    if (hold.managed && !hold.allowed) {
      return jsonError(res, 429, "Daily quota exhausted");
    }

    const upstream = new URL(`${config.upstreamBaseUrl}${req.originalUrl}`);
    const headers = {
      ...req.headers,
      host: upstream.host,
      "x-request-id": requestId,
      "x-client-request-id": requestId,
    };
    delete headers.connection;
    const proxyReq = http.request(upstream, { method: req.method, headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
      proxyRes.on("end", () => {
        if (!hold.managed) return;
        if ((proxyRes.statusCode || 500) >= 400) {
          void releaseQuotaHold(quotaDb, requestId);
        } else {
          void settleFromUpstreamUsage({ quotaDb, upstreamDb, requestId, apiKeyId: Number(owner.id) });
        }
      });
    });
    proxyReq.on("error", async () => {
      if (hold.managed) await releaseQuotaHold(quotaDb, requestId);
      if (!res.headersSent) jsonError(res, 502, "Upstream gateway unavailable");
    });
    req.pipe(proxyReq);
  };
}

export function createApp({ quotaDb = new Pool(config.quotaDb), upstreamDb = new Pool(config.upstreamDb) } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/internal", express.json({ limit: "128kb" }));
  app.get("/internal/users/:userId/quota", async (req, res) => {
    if (!isInternalRequest(req)) return res.sendStatus(403);
    const { rows } = await quotaDb.query("SELECT * FROM traffic_pack_quota_states WHERE user_id = $1", [Number(req.params.userId)]);
    res.json(dbRowToState(rows[0]) || null);
  });
  app.all("*", createProxyHandler({ quotaDb, upstreamDb }));
  return app;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const quotaDb = new Pool(config.quotaDb);
  const upstreamDb = new Pool(config.upstreamDb);
  await ensureQuotaSchema(quotaDb);
  createApp({ quotaDb, upstreamDb }).listen(config.port, () => {
    console.log(`[quota-gateway] listening on :${config.port}, upstream=${config.upstreamBaseUrl}, day=${chinaDay()}`);
  });
}
