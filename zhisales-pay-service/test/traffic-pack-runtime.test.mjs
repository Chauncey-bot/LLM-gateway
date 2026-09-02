import assert from "node:assert/strict";
import test from "node:test";

import { provisionTrafficPackRuntime, restoreTrafficPackRuntime } from "../traffic-pack-runtime.mjs";

class RuntimeClient {
  constructor() {
    this.runtimes = [];
    this.switches = [];
  }

  async query(sql, params = []) {
    const statement = String(sql).replace(/\s+/g, " ").trim();
    if (statement.startsWith("SELECT * FROM traffic_pack_runtime_states") && statement.includes("status IN ('provisioning', 'active')")) {
      const rows = this.runtimes.filter((item) => item.user_id === Number(params[0]) && item.china_day === params[1]
        && ["provisioning", "active"].includes(item.status));
      return { rows: rows.slice(-1) };
    }
    if (statement.startsWith("INSERT INTO traffic_pack_runtime_states")) {
      const generation = this.runtimes.filter((item) => item.user_id === Number(params[0]) && item.china_day === params[1]).length + 1;
      const runtime = {
        id: this.runtimes.length + 1,
        user_id: Number(params[0]),
        china_day: params[1],
        generation,
        template_group_id: Number(params[2]),
        bonus_limit_usd: Number(params[3]),
        expires_at: params[4],
        status: "provisioning",
      };
      this.runtimes.push(runtime);
      return { rows: [runtime] };
    }
    if (statement.startsWith("UPDATE traffic_pack_runtime_states SET runtime_group_id")) {
      const runtime = this.runtimes.find((item) => item.id === Number(params[0]));
      runtime.runtime_group_id = Number(params[1]);
      return { rows: [] };
    }
    if (statement.startsWith("UPDATE traffic_pack_runtime_states") && statement.includes("runtime_subscription_id")) {
      const runtime = this.runtimes.find((item) => item.id === Number(params[0]));
      Object.assign(runtime, {
        template_group_id: Number(params[1]),
        runtime_group_id: Number(params[2]),
        runtime_subscription_id: Number(params[3]),
        bonus_limit_usd: Number(params[4]),
        expires_at: params[5],
        status: "active",
      });
      return { rows: [runtime] };
    }
    if (statement.startsWith("SELECT * FROM traffic_pack_runtime_states") && statement.includes("status IN ('provisioning', 'active', 'closing', 'error')")) {
      return { rows: this.runtimes.filter((item) => item.user_id === Number(params[0]) && item.china_day <= params[1]
        && ["provisioning", "active", "closing", "error"].includes(item.status)).reverse() };
    }
    if (statement.includes("SET status = 'closing'")) {
      this.runtimes.find((item) => item.id === Number(params[0])).status = "closing";
      return { rows: [] };
    }
    if (statement.startsWith("SELECT * FROM traffic_pack_key_switches")) {
      return { rows: this.switches.filter((item) => item.runtime_state_id === Number(params[0]) && item.status !== "restored") };
    }
    if (statement.startsWith("UPDATE traffic_pack_key_switches")) {
      this.switches.find((item) => item.runtime_state_id === Number(params[0]) && item.api_key_id === Number(params[1])).status = "restored";
      return { rows: [] };
    }
    if (statement.includes("SET status = 'closed'")) {
      this.runtimes.find((item) => item.id === Number(params[0])).status = "closed";
      return { rows: [] };
    }
    if (statement.includes("SET status = 'error'")) {
      this.runtimes.find((item) => item.id === Number(params[0])).status = "error";
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${statement}`);
  }
}

test("multiple purchases grow one native bonus bucket without replacing its subscription", async () => {
  const client = new RuntimeClient();
  const calls = [];
  const adminRequest = async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith("/duplicate")) return { id: 116 };
    if (path === "/api/v1/admin/subscriptions/assign") return { id: 188 };
    return { ok: true };
  };
  const common = {
    userId: 22,
    templateGroupId: 16,
    expiresAt: new Date("2026-09-02T15:59:59.999Z"),
    adminRequest,
    now: new Date("2026-09-02T10:00:00+08:00"),
  };

  const first = await provisionTrafficPackRuntime(client, { ...common, bonusLimitUsd: 100 });
  const second = await provisionTrafficPackRuntime(client, { ...common, bonusLimitUsd: 200 });

  assert.equal(first.id, second.id);
  assert.equal(second.bonus_limit_usd, 200);
  assert.equal(calls.filter((item) => item.path.endsWith("/duplicate")).length, 1);
  assert.equal(calls.filter((item) => item.path === "/api/v1/admin/subscriptions/assign").length, 1);
  const groupUpdates = calls.filter((item) => item.path === "/api/v1/admin/groups/116");
  assert.deepEqual(groupUpdates.map((item) => item.options.body.daily_limit_usd), [100, 200]);
});

test("manual reset restores switched keys and a later purchase creates a fresh generation", async () => {
  const client = new RuntimeClient();
  let groupSequence = 116;
  let subscriptionSequence = 188;
  const calls = [];
  const adminRequest = async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith("/duplicate")) return { id: groupSequence++ };
    if (path === "/api/v1/admin/subscriptions/assign") return { id: subscriptionSequence++ };
    return { ok: true };
  };
  const common = {
    userId: 22,
    templateGroupId: 16,
    bonusLimitUsd: 100,
    expiresAt: new Date("2026-09-02T15:59:59.999Z"),
    adminRequest,
    now: new Date("2026-09-02T10:00:00+08:00"),
  };
  const first = await provisionTrafficPackRuntime(client, common);
  client.switches.push({
    runtime_state_id: first.id,
    api_key_id: 7,
    original_group_id: 16,
    runtime_group_id: first.runtime_group_id,
    status: "switched",
  });

  const restored = await restoreTrafficPackRuntime(client, {
    userId: 22,
    reason: "manual_reset",
    adminRequest,
    now: common.now,
  });
  const second = await provisionTrafficPackRuntime(client, common);

  assert.deepEqual(restored, { runtimes: 1, restoredKeys: 1 });
  assert.equal(client.switches[0].status, "restored");
  assert.equal(first.status, "closed");
  assert.equal(second.generation, 2);
  assert.notEqual(second.runtime_group_id, first.runtime_group_id);
  assert.equal(calls.some((item) => item.path === "/api/v1/admin/api-keys/7" && item.options.body.group_id === 16), true);
  assert.equal(calls.some((item) => item.path === "/api/v1/admin/subscriptions/188/revoke"), true);
});
