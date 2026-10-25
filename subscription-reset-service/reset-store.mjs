import { randomUUID } from "node:crypto";

export async function lockSubscription(client, id) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('zhisales-subscription-reset:' || $1::text, 0))", [id]);
}

// A reset and its accounting boundary commit together. Only cache invalidation
// runs after commit; its durable receipt makes retries safe across restarts.
export class ResetStore {
  constructor({ db, invalidate, dailyFixedGroupIds, timeZone = "Asia/Shanghai", retryMs = 5000 }) {
    Object.assign(this, { db, invalidate, dailyFixedGroupIds, timeZone, retryMs });
    this.lastError = "";
    this.timer = null;
    this.running = false;
  }

  async ensure() {
    await this.db.query(`CREATE TABLE IF NOT EXISTS zhisales_subscription_resets (
      sequence BIGSERIAL PRIMARY KEY,
      operation_id UUID NOT NULL UNIQUE,
      subscription_id BIGINT NOT NULL, user_id BIGINT NOT NULL, group_id BIGINT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('admin','daily','user')),
      daily BOOLEAN NOT NULL, weekly BOOLEAN NOT NULL, monthly BOOLEAN NOT NULL,
      request_reference TEXT,
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','applied','completed','cancelled')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      reset_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
      result JSONB, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    CREATE INDEX IF NOT EXISTS zhisales_subscription_resets_pending
      ON zhisales_subscription_resets(subscription_id,sequence) WHERE state='pending';
    CREATE INDEX IF NOT EXISTS zhisales_subscription_resets_retry
      ON zhisales_subscription_resets(next_attempt_at) WHERE state IN ('pending','applied');`);
  }

  async enqueue(subscriptionId, selected, { kind = "admin", requestReference = null } = {}) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await lockSubscription(client, subscriptionId);
      const { rows } = await client.query("SELECT id,user_id,group_id FROM user_subscriptions WHERE id=$1 AND deleted_at IS NULL", [subscriptionId]);
      const sub = rows[0];
      if (!sub || !this.dailyFixedGroupIds.includes(Number(sub.group_id))) {
        throw new Error("Subscription is not a managed daily plan");
      }
      const op = await client.query(`INSERT INTO zhisales_subscription_resets
        (operation_id,subscription_id,user_id,group_id,kind,daily,weekly,monthly,request_reference)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [randomUUID(), sub.id, sub.user_id, sub.group_id, kind, selected.daily, selected.weekly, selected.monthly, requestReference]);
      await client.query("COMMIT");
      return op.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async receipt(client, subscription, selected, resetAt) {
    // User reset already owns a transaction (including the validity deduction).
    // Record only the post-commit cache work, never replay that transaction.
    const { rows } = await client.query(`INSERT INTO zhisales_subscription_resets
      (operation_id,subscription_id,user_id,group_id,kind,daily,weekly,monthly,state,reset_at,result)
      VALUES($1,$2,$3,$4,'user',$5,$6,$7,'applied',$8,$9::jsonb) RETURNING *`,
    [randomUUID(), subscription.id, subscription.user_id, subscription.group_id,
      selected.daily, selected.weekly, selected.monthly, resetAt, JSON.stringify(subscription)]);
    return rows[0];
  }

  async defer(operationId, error) {
    this.lastError = "Reset recovery is pending";
    // If PostgreSQL itself is down this write may fail, but the previously
    // committed pending/applied operation still survives for the next worker.
    await this.db.query(`UPDATE zhisales_subscription_resets
      SET attempts=attempts+1,last_error=$2,next_attempt_at=clock_timestamp()+$3*interval '1 millisecond'
      WHERE operation_id=$1 AND state IN ('pending','applied')`,
    [operationId, String(error.message).slice(0, 500), this.retryMs]).catch(() => {});
  }

  async applyNext(subscriptionId) {
    const client = await this.db.connect();
    let operation;
    let failure;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await lockSubscription(client, subscriptionId);
      const queued = await client.query(`SELECT * FROM zhisales_subscription_resets
        WHERE subscription_id=$1 AND state='pending' ORDER BY sequence LIMIT 1 FOR UPDATE`, [subscriptionId]);
      operation = queued.rows[0];
      if (!operation) { await client.query("COMMIT"); return null; }
      const locked = await client.query("SELECT * FROM user_subscriptions WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", [subscriptionId]);
      const sub = locked.rows[0];
      if (!sub || Number(sub.user_id) !== Number(operation.user_id) || Number(sub.group_id) !== Number(operation.group_id) ||
          !this.dailyFixedGroupIds.includes(Number(sub.group_id))) {
        await client.query("UPDATE zhisales_subscription_resets SET state='cancelled',last_error='Subscription changed' WHERE operation_id=$1", [operation.operation_id]);
        await client.query("COMMIT");
        return operation;
      }
      // Capture time only after all subscription locks. PostgreSQL text keeps
      // microseconds intact; a waiting request cannot install an older clock.
      const clock = (await client.query(`WITH clock AS MATERIALIZED (SELECT clock_timestamp() AS at)
        SELECT at::text AS reset_at,
        (date_trunc('day',at AT TIME ZONE $1) AT TIME ZONE $1)::text AS midnight FROM clock`, [this.timeZone])).rows[0];
      if (operation.kind === "daily" && (sub.status !== "active" ||
          new Date(sub.expires_at) <= new Date(clock.reset_at) || new Date(sub.starts_at) > new Date(clock.reset_at) ||
          (sub.daily_window_start && new Date(sub.daily_window_start) >= new Date(clock.midnight)))) {
        // Recheck after taking the same lock as manual reset. A midnight scan
        // selected earlier must not overwrite a newer manual window.
        await client.query("UPDATE zhisales_subscription_resets SET state='cancelled',last_error=NULL WHERE operation_id=$1", [operation.operation_id]);
        await client.query("COMMIT");
        return operation;
      }
      const resetAt = operation.kind === "daily" ? clock.midnight : clock.reset_at;
      const result = await client.query(`UPDATE user_subscriptions SET
        daily_usage_usd=CASE WHEN $2 THEN 0 ELSE daily_usage_usd END,
        weekly_usage_usd=CASE WHEN $3 THEN 0 ELSE weekly_usage_usd END,
        monthly_usage_usd=CASE WHEN $4 THEN 0 ELSE monthly_usage_usd END,
        daily_window_start=CASE WHEN $2 THEN $5::timestamptz ELSE daily_window_start END,
        weekly_window_start=CASE WHEN $3 THEN $5::timestamptz ELSE weekly_window_start END,
        monthly_window_start=CASE WHEN $4 THEN $5::timestamptz ELSE monthly_window_start END,
        updated_at=clock_timestamp()
        WHERE id=$1 RETURNING to_jsonb(user_subscriptions) AS subscription`,
      [subscriptionId, operation.daily, operation.weekly, operation.monthly, resetAt]);
      await client.query(`UPDATE zhisales_subscription_resets SET state='applied',reset_at=$2,result=$3::jsonb,
        last_error=NULL,next_attempt_at=clock_timestamp() WHERE operation_id=$1`,
      [operation.operation_id, resetAt, JSON.stringify(result.rows[0].subscription)]);
      await client.query("COMMIT");
      return operation;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      failure = error;
      throw error;
    } finally {
      client.release();
      if (failure && operation) await this.defer(operation.operation_id, failure);
    }
  }

  async deliver(operationId) {
    const client = await this.db.connect();
    let operation;
    let failure;
    try {
      await client.query("BEGIN");
      const result = await client.query(`SELECT * FROM zhisales_subscription_resets
        WHERE operation_id=$1 AND state='applied' FOR UPDATE SKIP LOCKED`, [operationId]);
      operation = result.rows[0];
      if (operation) {
        await this.invalidate(Number(operation.user_id), Number(operation.group_id));
        await client.query(`UPDATE zhisales_subscription_resets SET state='completed',completed_at=clock_timestamp(),last_error=NULL
          WHERE operation_id=$1`, [operationId]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      failure = error;
      throw error;
    } finally {
      client.release();
      if (failure && operation) await this.defer(operationId, failure);
    }
  }

  async get(operationId) {
    return (await this.db.query("SELECT * FROM zhisales_subscription_resets WHERE operation_id=$1", [operationId])).rows[0];
  }

  async run(subscriptionId) {
    for (let n = 0; n < 100; n++) if (!await this.applyNext(subscriptionId)) break;
    const applied = await this.db.query("SELECT operation_id FROM zhisales_subscription_resets WHERE subscription_id=$1 AND state='applied' ORDER BY sequence", [subscriptionId]);
    for (const op of applied.rows) await this.deliver(op.operation_id);
  }

  async reconcile() {
    if (this.running) return;
    this.running = true;
    let failed = false;
    try {
      const pending = await this.db.query(`SELECT DISTINCT subscription_id FROM zhisales_subscription_resets
        WHERE state='pending' AND next_attempt_at<=clock_timestamp() LIMIT 100`);
      for (const op of pending.rows) {
        try { await this.run(op.subscription_id); } catch { failed = true; }
      }
      const applied = await this.db.query(`SELECT operation_id FROM zhisales_subscription_resets
        WHERE state='applied' AND next_attempt_at<=clock_timestamp() ORDER BY sequence LIMIT 100`);
      for (const op of applied.rows) {
        try { await this.deliver(op.operation_id); } catch { failed = true; }
      }
      this.lastError = failed ? "Reset recovery is pending" : "";
    } catch { this.lastError = "Reset recovery is pending"; }
    finally { this.running = false; }
  }

  start() {
    if (this.timer) return;
    void this.reconcile();
    this.timer = setInterval(() => void this.reconcile(), this.retryMs);
    this.timer.unref();
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  async health() {
    const { rows } = await this.db.query(`SELECT state,COUNT(*)::int AS count FROM zhisales_subscription_resets
      WHERE state IN ('pending','applied') GROUP BY state`);
    return { pending: rows.reduce((n, r) => n + r.count, 0), last_error: this.lastError };
  }
}
