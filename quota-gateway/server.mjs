import http from "node:http";

import express from "express";
import pg from "pg";
import WebSocket, { WebSocketServer } from "ws";

import { chinaDay } from "./quota-engine.mjs";
import { checkCumulativeQuota } from "./cumulative-quota.mjs";
import { installSubscriptionPresentation } from "./subscription-presentation.mjs";

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
  sub2apiAdminEmail: process.env.SUB2API_ADMIN_EMAIL || "",
  sub2apiAdminPassword: process.env.SUB2API_ADMIN_PASSWORD || "",
  expiredHoldCleanupIntervalMs: Number(process.env.QUOTA_GATEWAY_EXPIRED_HOLD_CLEANUP_INTERVAL_MS || 60_000),
  expiredHoldCleanupBatchSize: Number(process.env.QUOTA_GATEWAY_EXPIRED_HOLD_CLEANUP_BATCH_SIZE || 500),
};

const CLEANUP_INTERVAL_MS = Number.isFinite(config.expiredHoldCleanupIntervalMs) && config.expiredHoldCleanupIntervalMs > 0
  ? config.expiredHoldCleanupIntervalMs
  : 0;
const CLEANUP_BATCH_SIZE = Number.isFinite(config.expiredHoldCleanupBatchSize) && config.expiredHoldCleanupBatchSize > 0
  ? Math.floor(config.expiredHoldCleanupBatchSize)
  : 500;

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
  await db.query(`
    CREATE TABLE IF NOT EXISTS traffic_pack_runtime_states (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      china_day DATE NOT NULL,
      generation INTEGER NOT NULL,
      template_group_id BIGINT NOT NULL,
      runtime_group_id BIGINT,
      runtime_subscription_id BIGINT,
      bonus_limit_usd NUMERIC(20,8) NOT NULL,
      status TEXT NOT NULL DEFAULT 'provisioning',
      expires_at TIMESTAMPTZ NOT NULL,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, china_day, generation)
    );
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS traffic_pack_key_switches (
      runtime_state_id BIGINT NOT NULL REFERENCES traffic_pack_runtime_states(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL,
      china_day DATE NOT NULL,
      api_key_id BIGINT NOT NULL,
      original_group_id BIGINT NOT NULL,
      runtime_group_id BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'switching',
      switched_at TIMESTAMPTZ,
      restored_at TIMESTAMPTZ,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (runtime_state_id, api_key_id)
    );
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_traffic_pack_runtime_active ON traffic_pack_runtime_states (user_id, china_day, generation DESC) WHERE status IN ('provisioning', 'active', 'closing');`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_traffic_pack_key_switch_user ON traffic_pack_key_switches (user_id, china_day, status);`);
}

function isInternalRequest(req) {
  return Boolean(config.internalKey) && req.get("X-Internal-Key") === config.internalKey;
}

function parseApiKey(req) {
  const authorization = typeof req.get === "function"
    ? req.get("authorization") || ""
    : req.headers?.authorization || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7).trim();
  const xApiKey = typeof req.get === "function" ? req.get("x-api-key") : req.headers?.["x-api-key"];
  return (xApiKey || "").trim();
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

export async function releaseExpiredQuotaHolds(quotaDb, { batchSize = CLEANUP_BATCH_SIZE } = {}) {
  const client = await quotaDb.connect();
  const safeBatchSize = Math.max(1, Math.min(5_000, Number(batchSize) || CLEANUP_BATCH_SIZE));
  try {
    await client.query("BEGIN");
    const toRelease = await client.query(
      `
      WITH to_release AS (
        SELECT request_id, user_id, reserved_usd
        FROM traffic_pack_quota_holds
        WHERE status = 'pending'
          AND expires_at <= NOW()
        ORDER BY expires_at ASC
        LIMIT $1
      ),
      released AS (
        UPDATE traffic_pack_quota_holds h
        SET status = 'released', settled_at = NOW()
        FROM to_release r
        WHERE h.request_id = r.request_id
        RETURNING r.user_id, r.reserved_usd
      )
      SELECT user_id, SUM(reserved_usd) AS released_reserved_sum, COUNT(*) AS released_cnt
      FROM released
      GROUP BY user_id
      `,
      [safeBatchSize],
    );

    const rows = toRelease.rows || [];
    let releasedRequests = 0;
    for (const row of rows) {
      const releasedReserved = Number(row.released_reserved_sum || 0);
      if (releasedReserved > 0) {
        await client.query(
          `UPDATE traffic_pack_quota_states
              SET reserved_usage_usd = GREATEST(0, reserved_usage_usd - $2)
            WHERE user_id = $1`,
          [row.user_id, releasedReserved],
        );
      }
      releasedRequests += Number(row.released_cnt || 0);
    }

    await client.query("COMMIT");
    return {
      scannedUsers: rows.length,
      releasedRequests,
      releasedReservedSum: rows.reduce((acc, row) => acc + Number(row.released_reserved_sum || 0), 0),
      batchSize: safeBatchSize,
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function startExpiredHoldCleanup(quotaDb) {
  if (!CLEANUP_INTERVAL_MS) {
    return;
  }
  let running = false;
  const runCleanup = async () => {
    if (running) return;
    running = true;
    try {
      const result = await releaseExpiredQuotaHolds(quotaDb);
      if (result.releasedRequests > 0) {
        console.log(
          `[quota-gateway] cleanup released ${result.releasedRequests} expired holds across ${result.scannedUsers} user(s), ` +
          `reserved=${result.releasedReservedSum.toFixed(8)}`,
        );
      }
    } catch (error) {
      console.error(`[quota-gateway] expired hold cleanup failed: ${error?.message || error}`);
    } finally {
      running = false;
    }
  };
  runCleanup();
  const timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

async function findApiKeyOwner(upstreamDb, rawKey) {
  const { rows } = await upstreamDb.query(
    `SELECT id, user_id, group_id
       FROM api_keys
      WHERE key = $1 AND status = 'active' AND deleted_at IS NULL
      LIMIT 1`,
    [rawKey],
  );
  return rows[0] || null;
}

export function isDailyLimitExceededResponse(statusCode, body) {
  if (Number(statusCode) !== 429) return false;
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  const code = String(parsed?.error?.code || parsed?.code || parsed?.reason || "").toUpperCase();
  const message = String(parsed?.error?.message || parsed?.message || text).toLowerCase();
  return code === "DAILY_LIMIT_EXCEEDED" || message.includes("daily usage limit exceeded");
}

function createAdminApiKeySwitcher({ upstreamBaseUrl, email, password }) {
  let token = null;
  let expiresAt = 0;
  async function getToken() {
    if (token && Date.now() < expiresAt - 60_000) return token;
    if (!email || !password) throw new Error("Missing Sub2API admin credentials for traffic-pack switching");
    const response = await fetch(`${upstreamBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await response.json();
    if (!response.ok || (typeof json?.code === "number" && json.code !== 0)) {
      throw new Error(`Sub2API admin login failed (${response.status})`);
    }
    const data = Object.prototype.hasOwnProperty.call(json, "data") ? json.data : json;
    token = data?.access_token;
    expiresAt = Date.now() + Number(data?.expires_in || 3600) * 1000;
    if (!token) throw new Error("Sub2API admin login returned no access token");
    return token;
  }
  return async (apiKeyId, groupId) => {
    const accessToken = await getToken();
    const response = await fetch(`${upstreamBaseUrl}/api/v1/admin/api-keys/${Number(apiKeyId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ group_id: Number(groupId) }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Sub2API API-key group update failed (${response.status}): ${text.slice(0, 200)}`);
  };
}

export async function switchApiKeyToTrafficPack({ quotaDb, owner, switchApiKeyGroup }) {
  const { rows } = await quotaDb.query(
    `SELECT * FROM traffic_pack_runtime_states
      WHERE user_id = $1
        AND china_day = (NOW() AT TIME ZONE 'Asia/Shanghai')::date
        AND status = 'active' AND expires_at > NOW()
      ORDER BY generation DESC LIMIT 1`,
    [Number(owner.user_id)],
  );
  const runtime = rows[0];
  if (!runtime?.runtime_group_id) return { switched: false, reason: "no_active_runtime" };
  if (Number(owner.group_id) === Number(runtime.runtime_group_id)) {
    return { switched: false, reason: "already_on_runtime" };
  }
  if (!Number(owner.group_id)) return { switched: false, reason: "missing_original_group" };

  await quotaDb.query(
    `INSERT INTO traffic_pack_key_switches (
       runtime_state_id, user_id, china_day, api_key_id, original_group_id, runtime_group_id, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'switching')
     ON CONFLICT (runtime_state_id, api_key_id) DO UPDATE
       SET runtime_group_id = EXCLUDED.runtime_group_id, status = 'switching', error_message = NULL, updated_at = NOW()`,
    [runtime.id, owner.user_id, runtime.china_day, owner.id, owner.group_id, runtime.runtime_group_id],
  );
  try {
    await switchApiKeyGroup(owner.id, runtime.runtime_group_id);
    await quotaDb.query(
      `UPDATE traffic_pack_key_switches
          SET status = 'switched', switched_at = NOW(), error_message = NULL, updated_at = NOW()
        WHERE runtime_state_id = $1 AND api_key_id = $2`,
      [runtime.id, owner.id],
    );
    return { switched: true, runtimeGroupId: Number(runtime.runtime_group_id) };
  } catch (error) {
    await quotaDb.query(
      `UPDATE traffic_pack_key_switches SET status = 'failed', error_message = $3, updated_at = NOW()
        WHERE runtime_state_id = $1 AND api_key_id = $2`,
      [runtime.id, owner.id, error instanceof Error ? error.message : String(error)],
    );
    throw error;
  }
}

async function readRequestBody(req, maxBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body exceeds gateway replay limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendUpstream({ req, res, upstreamBaseUrl, body, captureDailyLimit }) {
  return new Promise((resolve, reject) => {
    const upstream = new URL(`${upstreamBaseUrl}${req.originalUrl}`);
    const headers = { ...req.headers, host: upstream.host };
    delete headers.connection;
    const proxyReq = http.request(upstream, { method: req.method, headers }, (proxyRes) => {
      if (captureDailyLimit && proxyRes.statusCode === 429) {
        const chunks = [];
        let size = 0;
        proxyRes.on("data", (chunk) => {
          size += chunk.length;
          if (size <= 1024 * 1024) chunks.push(chunk);
        });
        proxyRes.on("end", () => resolve({
          captured: true,
          statusCode: proxyRes.statusCode,
          headers: proxyRes.headers,
          body: Buffer.concat(chunks),
        }));
        return;
      }
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
      resolve({ captured: false });
    });
    proxyReq.on("error", reject);
    if (body.length) proxyReq.write(body);
    proxyReq.end();
  });
}

function createProxyHandler({ quotaDb, upstreamDb, upstreamBaseUrl = config.upstreamBaseUrl, switchApiKeyGroup }) {
  return async (req, res) => {
    const apiKey = parseApiKey(req);
    if (!apiKey) return jsonError(res, 401, "Missing API key");
    const owner = await findApiKeyOwner(upstreamDb, apiKey);
    if (!owner) return jsonError(res, 401, "Invalid API key");

    try {
      const cumulative = await checkCumulativeQuota(upstreamDb, owner, undefined, new Date(), quotaDb);
      if (cumulative && !cumulative.allowed) {
        return res.status(cumulative.status).json({ error: { code: cumulative.code, message: cumulative.message } });
      }
      const body = await readRequestBody(req);
      const first = await sendUpstream({ req, res, upstreamBaseUrl, body, captureDailyLimit: true });
      if (!first.captured) return;
      if (cumulative || !isDailyLimitExceededResponse(first.statusCode, first.body)) {
        res.writeHead(first.statusCode, first.headers);
        res.end(first.body);
        return;
      }
      const switched = await switchApiKeyToTrafficPack({ quotaDb, owner, switchApiKeyGroup });
      if (!switched.switched) {
        res.writeHead(first.statusCode, first.headers);
        res.end(first.body);
        return;
      }
      await sendUpstream({ req, res, upstreamBaseUrl, body, captureDailyLimit: false });
    } catch (error) {
      console.error(`[quota-gateway] request failed: ${error?.message || error}`);
      if (!res.headersSent) jsonError(res, 502, "Upstream gateway unavailable");
    }
  };
}

const WS_CLIENT_HEADERS = new Set([
  "connection", "host", "upgrade", "sec-websocket-key", "sec-websocket-version",
  "sec-websocket-accept", "sec-websocket-extensions", "sec-websocket-protocol",
]);

function websocketUpstreamUrl(upstreamBaseUrl, requestUrl) {
  const url = new URL(`${upstreamBaseUrl}${requestUrl}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function websocketHeaders(req) {
  return Object.fromEntries(Object.entries(req.headers || {})
    .filter(([name]) => !WS_CLIENT_HEADERS.has(name.toLowerCase()))
    .map(([name, value]) => [name, Array.isArray(value) ? value.join(", ") : value]));
}

function rejectUpgrade(socket, status, message) {
  if (socket.destroyed) return;
  const body = JSON.stringify({ error: { message, type: "quota_error" } });
  socket.write(
    `HTTP/1.1 ${status} ${http.STATUS_CODES[status] || "Error"}\r\n` +
    "Content-Type: application/json\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    "Connection: close\r\n\r\n" + body,
  );
  socket.destroy();
}

async function readUnexpectedResponse(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    size += chunk.length;
    if (size <= 1024 * 1024) chunks.push(chunk);
    if (size >= 1024 * 1024) break;
  }
  return { statusCode: response.statusCode || 502, body: Buffer.concat(chunks) };
}

function connectWebSocket(upstreamUrl, headers, protocols = [], timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const options = { headers };
    const upstream = protocols.length
      ? new WebSocket(upstreamUrl, protocols, options)
      : new WebSocket(upstreamUrl, options);
    const earlyMessages = [];
    upstream.__quotaEarlyMessages = earlyMessages;
    upstream.on("message", (data, isBinary) => earlyMessages.push({ data, isBinary }));
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      upstream.terminate();
      reject(new Error("WebSocket upstream handshake timed out"));
    }, timeoutMs);
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    upstream.once("open", () => finish(resolve, upstream));
    upstream.once("error", (error) => finish(reject, error));
    upstream.once("unexpected-response", async (_request, response) => {
      const result = await readUnexpectedResponse(response);
      upstream.terminate();
      finish(reject, Object.assign(new Error(`WebSocket upstream rejected with ${result.statusCode}`), {
        statusCode: result.statusCode,
        responseBody: result.body,
      }));
    });
  });
}

function bridgeWebSockets(client, upstream) {
  const pending = [];
  let upstreamReady = upstream.readyState === WebSocket.OPEN;
  let pendingBytes = 0;
  const maxPendingBytes = 16 * 1024 * 1024;
  const earlyMessages = upstream.__quotaEarlyMessages || [];
  delete upstream.__quotaEarlyMessages;
  const closeSocket = (ws, code, reason) => {
    const safeCode = Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : 1000;
    const safeReason = Buffer.isBuffer(reason) ? reason.toString() : String(reason || "");
    try { ws.close(safeCode, safeReason); } catch { ws.terminate(); }
  };
  const closeBoth = (code = 1000, reason = "") => {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) closeSocket(client, code, reason);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) closeSocket(upstream, code, reason);
  };
  client.on("message", (data, isBinary) => {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (!upstreamReady) {
      pendingBytes += payload.length;
      if (pendingBytes > maxPendingBytes) return closeBoth(1009, "WebSocket proxy queue exceeded");
      pending.push({ payload, isBinary });
      return;
    }
    if (upstream.readyState === WebSocket.OPEN) upstream.send(payload, { binary: isBinary });
  });
  upstream.once("open", () => {
    upstreamReady = true;
    for (const item of pending) upstream.send(item.payload, { binary: item.isBinary });
    pending.length = 0;
  });
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  for (const { data, isBinary } of earlyMessages) {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  }
  client.on("close", (code, reason) => {
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) closeSocket(upstream, code, reason);
  });
  upstream.on("close", (code, reason) => {
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) closeSocket(client, code, reason);
  });
  client.on("error", () => closeBoth(1011, "Client WebSocket error"));
  upstream.on("error", () => closeBoth(1011, "Upstream WebSocket error"));
}

export function attachWebSocketServer(server, {
  quotaDb,
  upstreamDb,
  upstreamBaseUrl = config.upstreamBaseUrl,
  switchApiKeyGroup = createAdminApiKeySwitcher({
    upstreamBaseUrl,
    email: config.sub2apiAdminEmail,
    password: config.sub2apiAdminPassword,
  }),
  websocketServer = new WebSocketServer({ noServer: true }),
} = {}) {
  const handleUpgrade = async (req, socket, head) => {
    const apiKey = parseApiKey(req);
    if (!apiKey) return rejectUpgrade(socket, 401, "Missing API key");
    try {
      const owner = await findApiKeyOwner(upstreamDb, apiKey);
      if (!owner) return rejectUpgrade(socket, 401, "Invalid API key");
      const cumulative = await checkCumulativeQuota(upstreamDb, owner, undefined, new Date(), quotaDb);
      if (cumulative && !cumulative.allowed) {
        return rejectUpgrade(socket, cumulative.status, cumulative.message);
      }

      const upstreamUrl = websocketUpstreamUrl(upstreamBaseUrl, req.url || "/");
      const protocols = String(req.headers?.["sec-websocket-protocol"] || "")
        .split(",").map((protocol) => protocol.trim()).filter(Boolean);
      let upstream;
      try {
        upstream = await connectWebSocket(upstreamUrl, websocketHeaders(req), protocols);
      } catch (error) {
        if (error?.statusCode === 429 && isDailyLimitExceededResponse(error.statusCode, error.responseBody)) {
          const switched = await switchApiKeyToTrafficPack({ quotaDb, owner, switchApiKeyGroup });
          if (switched.switched) upstream = await connectWebSocket(upstreamUrl, websocketHeaders(req), protocols);
          else return rejectUpgrade(socket, 429, "Daily quota exceeded");
        } else {
          return rejectUpgrade(socket, error?.statusCode >= 400 ? error.statusCode : 502, error?.message || "Upstream WebSocket unavailable");
        }
      }

      websocketServer.handleUpgrade(req, socket, head, (client) => bridgeWebSockets(client, upstream));
    } catch (error) {
      console.error(`[quota-gateway] WebSocket upgrade failed: ${error?.message || error}`);
      rejectUpgrade(socket, 502, "Upstream WebSocket unavailable");
    }
  };
  server.on("upgrade", handleUpgrade);
  return { websocketServer, handleUpgrade };
}

export function createApp({
  quotaDb = new Pool(config.quotaDb),
  upstreamDb = new Pool(config.upstreamDb),
  upstreamBaseUrl = config.upstreamBaseUrl,
  startReaper = false,
  switchApiKeyGroup = createAdminApiKeySwitcher({
    upstreamBaseUrl,
    email: config.sub2apiAdminEmail,
    password: config.sub2apiAdminPassword,
  }),
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  installSubscriptionPresentation(app, {upstreamDb, quotaDb, upstreamBaseUrl});
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/internal", express.json({ limit: "128kb" }));
  app.get("/internal/users/:userId/quota", async (req, res) => {
    if (!isInternalRequest(req)) return res.sendStatus(403);
    const { rows } = await quotaDb.query("SELECT * FROM traffic_pack_quota_states WHERE user_id = $1", [Number(req.params.userId)]);
    res.json(dbRowToState(rows[0]) || null);
  });
  app.all("*", createProxyHandler({ quotaDb, upstreamDb, upstreamBaseUrl, switchApiKeyGroup }));
  if (startReaper) {
    startExpiredHoldCleanup(quotaDb);
  }
  return app;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const quotaDb = new Pool(config.quotaDb);
  const upstreamDb = new Pool(config.upstreamDb);
  await ensureQuotaSchema(quotaDb);
  const server = http.createServer(createApp({ quotaDb, upstreamDb, startReaper: true }));
  attachWebSocketServer(server, { quotaDb, upstreamDb, switchApiKeyGroup: undefined });
  server.listen(config.port, () => {
    console.log(`[quota-gateway] listening on :${config.port}, upstream=${config.upstreamBaseUrl}, day=${chinaDay()}`);
  });
}
