import express from "express";
import pg from "pg";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const MINIMUM_REMAINING_HOURS = 24;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const rawMinimumHours = Number(process.env.MINIMUM_REMAINING_HOURS);

const config = {
  port: Number(process.env.PORT) || 3000,
  sub2apiBaseUrl: (process.env.SUB2API_BASE_URL || "http://host.docker.internal:18080").replace(/\/+$/, ""),
  payServiceBaseUrl: (process.env.PAY_SERVICE_BASE_URL || process.env.SUB2API_BASE_URL || "http://host.docker.internal:18080").replace(/\/+$/, ""),
  sub2apiAdminEmail: process.env.SUB2API_ADMIN_EMAIL || "",
  sub2apiAdminPassword: process.env.SUB2API_ADMIN_PASSWORD || "",
  db: {
    host: process.env.DB_HOST || "sub2api-postgres",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "sub2api",
    user: process.env.DB_USER || "sub2api",
    password: process.env.DB_PASSWORD || "",
  },
  minimumRemainingHours: Number.isFinite(rawMinimumHours) && rawMinimumHours > 0 ? rawMinimumHours : MINIMUM_REMAINING_HOURS,
};

const payServiceAdminSession = {
  token: null,
  expiresAt: 0,
};

const app = express();
const pool = new Pool(config.db);

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

function nowIso() {
  return new Date().toISOString();
}

class ServiceError extends Error {
  /** @type {number} */
  status;
  /** @type {string} */
  code;

  constructor(status, message, code = "SERVICE_ERROR") {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

function jsonError(response, status, message, extra = {}) {
  response.status(status).json({
    error: message,
    code: status,
    ...extra,
  });
}

function readBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return "";
  }
  return auth.slice(7).trim();
}

async function payServiceJson(pathname, options = {}) {
  const response = await fetch(`${config.payServiceBaseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text || "" };
  }

  if (!response.ok) {
    const detail =
      (body && typeof body === "object" && (body.message || body.error)) ||
      text ||
      `HTTP ${response.status}`;
    throw new ServiceError(response.status, `pay service request failed (${response.status}): ${detail}`, "UPSTREAM_ERROR");
  }

  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "code")) {
    if (typeof body.code === "number" && body.code !== 0) {
      throw new ServiceError(response.status, body.message || "pay service business error", `UPSTREAM_CODE_${body.code}`);
    }
    if (typeof body.code !== "number" && body.code !== 0) {
      return body;
    }
  }

  if (body && Object.prototype.hasOwnProperty.call(body, "data")) {
    return body.data;
  }
  return body;
}

async function getPayServiceAdminToken() {
  const now = Date.now();
  if (payServiceAdminSession.token && now < payServiceAdminSession.expiresAt - 60_000) {
    return payServiceAdminSession.token;
  }
  if (!config.sub2apiAdminEmail || !config.sub2apiAdminPassword) {
    throw new ServiceError(500, "Missing sub2api admin credentials", "MISSING_ADMIN_CREDENTIALS");
  }
  const data = await payServiceJson("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: config.sub2apiAdminEmail,
      password: config.sub2apiAdminPassword,
    },
  });
  payServiceAdminSession.token = data.access_token;
  payServiceAdminSession.expiresAt = now + Number(data.expires_in || 3600) * 1000;
  return payServiceAdminSession.token;
}

async function payServiceAdminJson(pathname, options = {}) {
  const token = await getPayServiceAdminToken();
  return payServiceJson(pathname, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function resetActiveTrafficPacksForUser(userId) {
  return payServiceAdminJson(`/pay-api/admin/users/${Number(userId)}/reset-traffic-packs`, {
    method: "POST",
  });
}

function normalizeResetWindowRequest(body) {
  const payload = body && typeof body === "object" ? body : {};
  const daily = Boolean(payload.daily);
  const weekly = Boolean(payload.weekly);
  const monthly = Boolean(payload.monthly);
  if (!daily && !weekly && !monthly) {
    throw new ServiceError(400, "At least one of daily/weekly/monthly must be true");
  }
  return { daily, weekly, monthly };
}

function hasMinimumRemainingHours(expiresAtIso, now = new Date(), minimumHours = config.minimumRemainingHours) {
  const minimumRemainingMs = minimumHours * ONE_HOUR_MS;
  if (!expiresAtIso || typeof expiresAtIso !== "string") {
    return false;
  }
  const expiresAtMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }
  const remainingMs = expiresAtMs - now.getTime();
  return remainingMs >= minimumRemainingMs;
}

function normalizeRemainingMs(expiresAtIso, now = new Date()) {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }
  return expiresAtMs - now.getTime();
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
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text || "" };
  }

  if (!response.ok) {
    const detail =
      (body && typeof body === "object" && (body.message || body.error)) ||
      text ||
      `HTTP ${response.status}`;
    throw new ServiceError(response.status, `sub2api request failed (${response.status}): ${detail}`, "UPSTREAM_ERROR");
  }

  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "code")) {
    if (typeof body.code === "number" && body.code !== 0) {
      throw new ServiceError(response.status, body.message || "sub2api business error", `UPSTREAM_CODE_${body.code}`);
    }
    if (typeof body.code !== "number" && body.code !== 0) {
      return body;
    }
  }

  if (body && Object.prototype.hasOwnProperty.call(body, "data")) {
    return body.data;
  }
  return body;
}

async function getCurrentUser(bearerToken) {
  if (!bearerToken) {
    throw new ServiceError(401, "Missing Authorization token");
  }
  return sub2apiJson("/api/v1/auth/me", {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });
}

async function resetQuotaAndShortenSubscription(subscriptionId, userId, resetRequest) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT id, user_id, status, expires_at
       FROM user_subscriptions
       WHERE id = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [subscriptionId]
    );
    const subscription = locked.rows[0];
    if (!subscription) {
      throw new ServiceError(404, "Subscription not found");
    }
    if (Number(subscription.user_id) !== Number(userId)) {
      throw new ServiceError(403, "Subscription does not belong to current user");
    }
    if (subscription.status !== "active") {
      throw new ServiceError(409, "Only active subscriptions can be reset");
    }
    if (!hasMinimumRemainingHours(subscription.expires_at?.toISOString?.() || String(subscription.expires_at))) {
      throw new ServiceError(409, `Subscription must remain active for at least ${config.minimumRemainingHours} hours`);
    }

    const updated = await client.query(
      `UPDATE user_subscriptions
       SET daily_usage_usd = CASE WHEN $2 THEN 0 ELSE daily_usage_usd END,
           weekly_usage_usd = CASE WHEN $3 THEN 0 ELSE weekly_usage_usd END,
           monthly_usage_usd = CASE WHEN $4 THEN 0 ELSE monthly_usage_usd END,
           daily_window_start = CASE WHEN $2 THEN NOW() ELSE daily_window_start END,
           weekly_window_start = CASE WHEN $3 THEN NOW() ELSE weekly_window_start END,
           monthly_window_start = CASE WHEN $4 THEN NOW() ELSE monthly_window_start END,
           expires_at = expires_at - INTERVAL '24 hours',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, user_id, status, expires_at, daily_usage_usd, weekly_usage_usd, monthly_usage_usd`,
      [subscriptionId, resetRequest.daily, resetRequest.weekly, resetRequest.monthly]
    );
    if (resetRequest.daily) {
      await resetActiveTrafficPacksForUser(Number(subscription.user_id));
    }
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function parseIntId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ServiceError(400, "Invalid subscription ID");
  }
  return id;
}

app.get(["/api/v1/health", "/v1/health", "/health"], (_req, res) => {
  res.json({
    service: "subscription-reset-service",
    ok: true,
    timestamp: nowIso(),
    mode: "standalone",
  });
});

app.post(["/api/v1/subscriptions/:id/reset-quota", "/v1/subscriptions/:id/reset-quota"], async (req, res) => {
  try {
    const subscriptionId = parseIntId(req.params.id);
    const resetRequest = normalizeResetWindowRequest(req.body);
    const bearerToken = readBearerToken(req);

    const user = await getCurrentUser(bearerToken);
    const updated = await resetQuotaAndShortenSubscription(subscriptionId, user.id, resetRequest);
    res.json(updated);
  } catch (error) {
    if (error instanceof ServiceError) {
      return jsonError(res, error.status, error.message);
    }
    if (error?.name === "SyntaxError") {
      return jsonError(res, 400, "Invalid request body");
    }
    return jsonError(res, 500, error?.message || "Internal server error");
  }
});

function startServer() {
  const server = app.listen(config.port, () => {
    console.log(`[subscription-reset-service] listening on http://0.0.0.0:${config.port}`);
  });
  return server;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  startServer();
}

export {
  app,
  hasMinimumRemainingHours,
  normalizeRemainingMs,
  MINIMUM_REMAINING_HOURS,
  normalizeResetWindowRequest,
  parseIntId,
  ServiceError,
  startServer,
};
