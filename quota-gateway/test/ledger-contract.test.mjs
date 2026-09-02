import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

import { createApp, isDailyLimitExceededResponse, switchApiKeyToTrafficPack } from "../server.mjs";

async function listen(target) {
  return await new Promise((resolve, reject) => {
    const server = target.listen(0, "127.0.0.1");
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("gateway forwards concurrent requests without creating quota holds or returning local 429", async (t) => {
  let upstreamRequests = 0;
  let quotaQueries = 0;

  const upstreamServer = http.createServer((req, res) => {
    upstreamRequests += 1;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  const quotaDb = {
    async query() {
      quotaQueries += 1;
      throw new Error("API forwarding must not read or write the quota ledger");
    },
  };
  const upstreamDb = {
    async query(sql) {
      if (String(sql).includes("FROM api_keys")) {
        return { rows: [{ id: 7, user_id: 22, group_id: 16 }] };
      }
      throw new Error(`Unexpected upstream SQL: ${sql}`);
    },
  };

  let gatewayServer;
  try {
    await listen(upstreamServer);
    const upstreamAddress = upstreamServer.address();
    gatewayServer = await listen(createApp({
      quotaDb,
      upstreamDb,
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
    }));
  } catch (error) {
    await close(gatewayServer);
    await close(upstreamServer);
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }

  try {
    const gatewayAddress = gatewayServer.address();
    const responses = await Promise.all(Array.from({ length: 12 }, () => fetch(
      `http://127.0.0.1:${gatewayAddress.port}/v1/responses`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-test", max_output_tokens: 100_000 }),
      },
    )));

    assert.deepEqual(responses.map((response) => response.status), Array(12).fill(200));
    assert.equal(upstreamRequests, 12);
    assert.equal(quotaQueries, 0);
  } finally {
    await close(gatewayServer);
    await close(upstreamServer);
  }
});

test("gateway switches to an active traffic-pack bucket only after the exact daily-limit 429 and retries once", async (t) => {
  let upstreamRequests = 0;
  const switches = [];
  const quotaCommands = [];
  const upstreamServer = http.createServer((req, res) => {
    upstreamRequests += 1;
    req.resume();
    req.on("end", () => {
      if (upstreamRequests === 1) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "DAILY_LIMIT_EXCEEDED", message: "daily usage limit exceeded" } }));
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, retried: true }));
      }
    });
  });
  const quotaDb = {
    async query(sql) {
      const statement = String(sql).replace(/\s+/g, " ").trim();
      quotaCommands.push(statement);
      if (statement.startsWith("SELECT * FROM traffic_pack_runtime_states")) {
        return { rows: [{ id: 31, user_id: 22, china_day: "2026-09-02", runtime_group_id: 116 }] };
      }
      return { rows: [] };
    },
  };
  const upstreamDb = {
    async query() { return { rows: [{ id: 7, user_id: 22, group_id: 16 }] }; },
  };

  let gatewayServer;
  try {
    await listen(upstreamServer);
    const upstreamAddress = upstreamServer.address();
    gatewayServer = await listen(createApp({
      quotaDb,
      upstreamDb,
      upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
      switchApiKeyGroup: async (apiKeyId, groupId) => switches.push([apiKeyId, groupId]),
    }));
  } catch (error) {
    await close(gatewayServer);
    await close(upstreamServer);
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }

  try {
    const { port } = gatewayServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: "POST",
      headers: { Authorization: "Bearer sk-test", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-test", input: "hello" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, retried: true });
    assert.equal(upstreamRequests, 2);
    assert.deepEqual(switches, [[7, 116]]);
    assert.equal(quotaCommands.some((command) => command.startsWith("INSERT INTO traffic_pack_key_switches")), true);
    assert.equal(quotaCommands.some((command) => command.includes("status = 'switched'")), true);
  } finally {
    await close(gatewayServer);
    await close(upstreamServer);
  }
});

test("generic upstream 429 is returned unchanged without reading traffic-pack runtime state", async (t) => {
  let quotaQueries = 0;
  let switches = 0;
  const upstreamServer = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "upstream provider is rate limited" } }));
    });
  });
  const quotaDb = { async query() { quotaQueries += 1; return { rows: [] }; } };
  const upstreamDb = { async query() { return { rows: [{ id: 7, user_id: 22, group_id: 16 }] }; } };
  let gatewayServer;
  try {
    await listen(upstreamServer);
    const { port: upstreamPort } = upstreamServer.address();
    gatewayServer = await listen(createApp({
      quotaDb,
      upstreamDb,
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      switchApiKeyGroup: async () => { switches += 1; },
    }));
  } catch (error) {
    await close(gatewayServer);
    await close(upstreamServer);
    if (error?.code === "EPERM") { t.skip("local sockets are not permitted in this environment"); return; }
    throw error;
  }
  try {
    const { port } = gatewayServer.address();
    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: "POST",
      headers: { Authorization: "Bearer sk-test" },
    });
    assert.equal(response.status, 429);
    assert.equal(quotaQueries, 0);
    assert.equal(switches, 0);
  } finally {
    await close(gatewayServer);
    await close(upstreamServer);
  }
});

test("daily-limit classifier rejects unrelated 429 responses", () => {
  assert.equal(isDailyLimitExceededResponse(429, JSON.stringify({ error: { code: "DAILY_LIMIT_EXCEEDED" } })), true);
  assert.equal(isDailyLimitExceededResponse(429, "daily usage limit exceeded"), true);
  assert.equal(isDailyLimitExceededResponse(429, "Too Many Requests"), false);
  assert.equal(isDailyLimitExceededResponse(400, "daily usage limit exceeded"), false);
});

test("an exhausted runtime bucket is never retried or switched back onto itself", async () => {
  let switchCalls = 0;
  const result = await switchApiKeyToTrafficPack({
    quotaDb: {
      async query() {
        return { rows: [{ id: 31, user_id: 22, china_day: "2026-09-02", runtime_group_id: 116 }] };
      },
    },
    owner: { id: 7, user_id: 22, group_id: 116 },
    switchApiKeyGroup: async () => { switchCalls += 1; },
  });

  assert.deepEqual(result, { switched: false, reason: "already_on_runtime" });
  assert.equal(switchCalls, 0);
});

test("gateway still rejects an invalid API key without touching quota state", async (t) => {
  let quotaQueries = 0;
  const quotaDb = {
    async query() {
      quotaQueries += 1;
      return { rows: [] };
    },
  };
  const upstreamDb = {
    async query(sql) {
      if (String(sql).includes("FROM api_keys")) return { rows: [] };
      throw new Error(`Unexpected upstream SQL: ${sql}`);
    },
  };

  let server;
  try {
    server = await listen(createApp({ quotaDb, upstreamDb }));
  } catch (error) {
    await close(server);
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: "POST",
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(response.status, 401);
    assert.equal(quotaQueries, 0);
  } finally {
    await close(server);
  }
});
