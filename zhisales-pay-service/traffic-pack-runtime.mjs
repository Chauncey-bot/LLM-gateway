const CHINA_TIME_ZONE = "Asia/Shanghai";

export function chinaDay(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value)).reduce((result, part) => {
    if (["year", "month", "day"].includes(part.type)) result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function ensureTrafficPackRuntimeSchema(db) {
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
    CREATE INDEX IF NOT EXISTS idx_traffic_pack_runtime_active
    ON traffic_pack_runtime_states (user_id, china_day, generation DESC)
    WHERE status IN ('provisioning', 'active', 'closing');
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
  await db.query(`CREATE INDEX IF NOT EXISTS idx_traffic_pack_key_switch_user ON traffic_pack_key_switches (user_id, china_day, status);`);
}

function responseId(value) {
  return Number(value?.id || value?.group_id || value?.subscription_id || value?.subscription?.id || value?.group?.id) || null;
}

function responseItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

async function findExistingRuntimeSubscription(adminRequest, userId, groupId) {
  const response = await adminRequest(`/api/v1/admin/users/${Number(userId)}/subscriptions?page=1&page_size=100`);
  return responseItems(response).find((item) => (
    Number(item?.group_id || item?.group?.id) === Number(groupId)
    && item?.status === "active"
  )) || null;
}

async function findRuntime(client, userId, day) {
  const { rows } = await client.query(
    `SELECT * FROM traffic_pack_runtime_states
      WHERE user_id = $1 AND china_day = $2
        AND status IN ('provisioning', 'active')
      ORDER BY generation DESC LIMIT 1 FOR UPDATE`,
    [Number(userId), day],
  );
  return rows[0] || null;
}

export async function provisionTrafficPackRuntime(client, {
  userId,
  templateGroupId,
  bonusLimitUsd,
  expiresAt,
  adminRequest,
  now = new Date(),
}) {
  const day = chinaDay(now);
  let runtime = await findRuntime(client, userId, day);
  if (!runtime) {
    const { rows } = await client.query(
      `INSERT INTO traffic_pack_runtime_states (
         user_id, china_day, generation, template_group_id, bonus_limit_usd, expires_at
       ) VALUES (
         $1, $2,
         COALESCE((SELECT MAX(generation) + 1 FROM traffic_pack_runtime_states WHERE user_id = $1 AND china_day = $2), 1),
         $3, $4, $5
       ) RETURNING *`,
      [Number(userId), day, Number(templateGroupId), Number(bonusLimitUsd), expiresAt],
    );
    runtime = rows[0];
  }

  let groupId = Number(runtime.runtime_group_id) || null;
  if (!groupId) {
    const duplicated = await adminRequest(`/api/v1/admin/groups/${Number(templateGroupId)}/duplicate`, {
      method: "POST",
      headers: { "Idempotency-Key": `traffic-pack-runtime:${Number(userId)}:${day}:${runtime.generation}` },
    });
    groupId = responseId(duplicated);
    if (!groupId) throw new Error("Sub2API group duplication returned no group id");
    await client.query(
      `UPDATE traffic_pack_runtime_states SET runtime_group_id = $2, updated_at = NOW() WHERE id = $1`,
      [runtime.id, groupId],
    );
  }

  await adminRequest(`/api/v1/admin/groups/${groupId}`, {
    method: "PUT",
    body: {
      name: `traffic-pack-user-${Number(userId)}-${day}-g${runtime.generation}`,
      description: `Traffic pack runtime bucket for user ${Number(userId)} on ${day}`,
      status: "active",
      subscription_type: "subscription",
      is_exclusive: true,
      daily_limit_usd: Number(bonusLimitUsd),
      weekly_limit_usd: 0,
      monthly_limit_usd: 0,
    },
  });

  let subscriptionId = Number(runtime.runtime_subscription_id) || null;
  if (!subscriptionId) {
    let existing = await findExistingRuntimeSubscription(adminRequest, userId, groupId);
    if (!existing) {
      try {
        existing = await adminRequest("/api/v1/admin/subscriptions/assign", {
          method: "POST",
          body: {
            user_id: Number(userId),
            group_id: groupId,
            validity_days: 1,
            notes: `traffic-pack-runtime:${day}:g${runtime.generation}`,
          },
        });
      } catch (error) {
        if (!String(error?.message || error).includes("(409)")) throw error;
        existing = await findExistingRuntimeSubscription(adminRequest, userId, groupId);
      }
    }
    subscriptionId = responseId(existing);
    if (!subscriptionId) throw new Error("Sub2API subscription assignment returned no subscription id");
  }

  const { rows } = await client.query(
    `UPDATE traffic_pack_runtime_states
        SET template_group_id = $2, runtime_group_id = $3, runtime_subscription_id = $4,
            bonus_limit_usd = $5, expires_at = $6, status = 'active', error_message = NULL, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [runtime.id, Number(templateGroupId), groupId, subscriptionId, Number(bonusLimitUsd), expiresAt],
  );
  return rows[0];
}

export async function restoreTrafficPackRuntime(client, {
  userId,
  reason,
  adminRequest,
  now = new Date(),
  onlyExpired = false,
}) {
  const day = chinaDay(now);
  const { rows } = await client.query(
    `SELECT * FROM traffic_pack_runtime_states
      WHERE user_id = $1 AND china_day <= $2 AND status IN ('provisioning', 'active', 'closing', 'error')
        AND ($3::boolean = false OR expires_at <= NOW())
      ORDER BY china_day DESC, generation DESC FOR UPDATE`,
    [Number(userId), day, Boolean(onlyExpired)],
  );
  let restoredKeys = 0;
  for (const runtime of rows) {
    await client.query(
      `UPDATE traffic_pack_runtime_states SET status = 'closing', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [runtime.id],
    );
    const switches = await client.query(
      `SELECT * FROM traffic_pack_key_switches WHERE runtime_state_id = $1 AND status <> 'restored' ORDER BY api_key_id FOR UPDATE`,
      [runtime.id],
    );
    try {
      for (const item of switches.rows) {
        await adminRequest(`/api/v1/admin/api-keys/${Number(item.api_key_id)}`, {
          method: "PUT",
          body: { group_id: Number(item.original_group_id) },
        });
        await client.query(
          `UPDATE traffic_pack_key_switches
              SET status = 'restored', restored_at = NOW(), error_message = NULL, updated_at = NOW()
            WHERE runtime_state_id = $1 AND api_key_id = $2`,
          [runtime.id, item.api_key_id],
        );
        restoredKeys += 1;
      }
      if (runtime.runtime_subscription_id) {
        await adminRequest(`/api/v1/admin/subscriptions/${Number(runtime.runtime_subscription_id)}/revoke`, { method: "POST" });
      }
      if (runtime.runtime_group_id) {
        await adminRequest(`/api/v1/admin/groups/${Number(runtime.runtime_group_id)}`, {
          method: "PUT",
          body: { status: "inactive" },
        });
      }
      await client.query(
        `UPDATE traffic_pack_runtime_states
            SET status = 'closed', error_message = NULL, updated_at = NOW()
          WHERE id = $1`,
        [runtime.id],
      );
    } catch (error) {
      await client.query(
        `UPDATE traffic_pack_runtime_states SET status = 'error', error_message = $2, updated_at = NOW() WHERE id = $1`,
        [runtime.id, `${reason}: ${error instanceof Error ? error.message : error}`],
      );
      throw error;
    }
  }
  return { runtimes: rows.length, restoredKeys };
}
