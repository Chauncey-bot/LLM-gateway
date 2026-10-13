import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

import WebSocket, { WebSocketServer } from "ws";

import { attachWebSocketServer, createApp } from "../server.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("listening", () => resolve(server.address()));
    server.once("error", reject);
    try {
      server.listen(0, "127.0.0.1");
    } catch (error) {
      reject(error);
    }
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server?.listening) return resolve();
    server.close(() => resolve());
  });
}

function closeWebSocketServer(server) {
  for (const client of server.clients) client.terminate();
  try { server.close(); } catch { /* already closed */ }
  return Promise.resolve();
}

function open(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
    setTimeout(() => reject(new Error("WebSocket client open timed out")), 5000).unref();
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.once("message", (data, isBinary) => resolve({ data, isBinary }));
    ws.once("error", reject);
    setTimeout(() => reject(new Error("WebSocket message timed out")), 5000).unref();
  });
}

test("gateway accepts WebSocket upgrade and forwards both directions", async (t) => {
  const upstreamHttp = http.createServer();
  const upstreamWs = new WebSocketServer({ server: upstreamHttp });
  let upstreamAuthorization;
  upstreamWs.on("connection", (ws, req) => {
    upstreamAuthorization = req.headers.authorization;
    ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary }));
    ws.send(JSON.stringify({ from: "upstream" }));
  });
  let upstreamAddress;
  try {
    upstreamAddress = await listen(upstreamHttp);
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }

  const upstreamDb = {
    async query(sql) {
      if (String(sql).includes("FROM api_keys")) {
        return { rows: [{ id: 7, user_id: 22, group_id: 16 }] };
      }
      throw new Error(`Unexpected upstream SQL: ${sql}`);
    },
  };
  const quotaDb = { async query() { throw new Error("daily plan must not query quota ledger"); } };
  const gateway = http.createServer(createApp({
    quotaDb,
    upstreamDb,
    upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
  }));
  const gatewayWs = attachWebSocketServer(gateway, {
    quotaDb,
    upstreamDb,
    upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
    switchApiKeyGroup: async () => {},
  });
  let gatewayAddress;
  try {
    gatewayAddress = await listen(gateway);
  } catch (error) {
    await close(upstreamHttp);
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }

  let client;
  try {
    client = await open(`ws://127.0.0.1:${gatewayAddress.port}/v1/responses`, {
      headers: { Authorization: "Bearer sk-test" },
    });
    const initial = await nextMessage(client);
    assert.deepEqual(JSON.parse(initial.data.toString()), { from: "upstream" });
    assert.equal(upstreamAuthorization, "Bearer sk-test");

    const echoed = nextMessage(client);
    client.send("hello");
    assert.equal((await echoed).data.toString(), "hello");
  } finally {
    client?.terminate();
    await closeWebSocketServer(gatewayWs.websocketServer);
    await closeWebSocketServer(upstreamWs);
    await close(gateway);
    await close(upstreamHttp);
  }
});

test("gateway rejects WebSocket upgrade before upstream for an invalid API key", async (t) => {
  const upstreamHttp = http.createServer();
  const upstreamWs = new WebSocketServer({ server: upstreamHttp });
  let upstreamConnections = 0;
  upstreamWs.on("connection", () => { upstreamConnections += 1; });
  let upstreamAddress;
  try {
    upstreamAddress = await listen(upstreamHttp);
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }
  const upstreamDb = { async query() { return { rows: [] }; } };
  const quotaDb = { async query() { throw new Error("quota check must not run"); } };
  const gateway = http.createServer(createApp({
    quotaDb,
    upstreamDb,
    upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
  }));
  const gatewayWs = attachWebSocketServer(gateway, {
    quotaDb,
    upstreamDb,
    upstreamBaseUrl: `http://127.0.0.1:${upstreamAddress.port}`,
  });
  let gatewayAddress;
  try {
    gatewayAddress = await listen(gateway);
  } catch (error) {
    await close(upstreamHttp);
    if (error?.code === "EPERM") {
      t.skip("local sockets are not permitted in this environment");
      return;
    }
    throw error;
  }

  try {
    await assert.rejects(
      open(`ws://127.0.0.1:${gatewayAddress.port}/v1/responses`),
      /Unexpected server response: 401/,
    );
    assert.equal(upstreamConnections, 0);
  } finally {
    await closeWebSocketServer(gatewayWs.websocketServer);
    await closeWebSocketServer(upstreamWs);
    await close(gateway);
    await close(upstreamHttp);
  }
});
