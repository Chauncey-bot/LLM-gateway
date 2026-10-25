export function installAdminResetRoute(app, {
  store,
  upstreamBaseUrl,
  dailyFixedGroupIds,
  fetchImpl = fetch,
}) {
  app.post([
    "/api/v1/admin/subscriptions/:id/reset-quota",
    "/v1/admin/subscriptions/:id/reset-quota",
  ], async (req, res) => {
    const id = Number(req.params.id);
    if (!/^\d+$/.test(req.params.id) || !Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ code: 400, message: "Invalid subscription ID" });
    }
    const authorization = req.get("authorization") || "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return res.status(401).json({ code: 401, message: "Missing Authorization token" });
    }
    const windows = ["daily", "weekly", "monthly"];
    const payload = req.body;
    if (!payload || windows.some(name => payload[name] !== undefined && typeof payload[name] !== "boolean") ||
        !windows.some(name => payload[name] === true)) {
      return res.status(400).json({ code: 400, message: "Select at least one boolean quota window" });
    }
    const selected = Object.fromEntries(windows.map(name => [name, payload[name] === true]));
    let operation;
    try {
      // Authorize using the same upstream admin route group and caller token.
      // No mutation or durable job exists before authorization succeeds.
      const authorized = await fetchImpl(`${upstreamBaseUrl}/api/v1/admin/subscriptions/${id}`, {
        headers: { Authorization: authorization }, signal: AbortSignal.timeout(15_000),
      });
      const raw = await authorized.text();
      if (!authorized.ok) return res.status(authorized.status).type(authorized.headers.get("content-type") || "application/json").send(raw);
      const body = JSON.parse(raw);
      if (body.code !== undefined && body.code !== 0) return res.status(authorized.status).json(body);
      const subscription = body.data || body;
      if (Number(subscription.id) !== id) throw new Error("Invalid upstream subscription response");
      if (!dailyFixedGroupIds.includes(Number(subscription.group_id))) {
        // Keep upstream semantics for plans that this service does not manage.
        const upstream = await fetchImpl(`${upstreamBaseUrl}/api/v1/admin/subscriptions/${id}/reset-quota`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: authorization },
          body: JSON.stringify(selected), signal: AbortSignal.timeout(15_000),
        });
        return res.status(upstream.status).type(upstream.headers.get("content-type") || "application/json").send(await upstream.text());
      }
      operation = await store.enqueue(id, selected, { requestReference: authorized.headers.get("x-request-id") });
      await store.run(id);
      let result = await store.get(operation.operation_id);
      // A second replica may be delivering this same receipt. Give its locked
      // delivery time to finish before reporting a pending operation.
      for (let n = 0; result.state === "applied" && n < 60; n++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        result = await store.get(operation.operation_id);
      }
      if (result.state === "cancelled") return res.status(409).json({ code: 409, message: "Subscription changed before reset" });
      if (result.state !== "completed") throw new Error("Reset recovery is pending");
      Object.assign(subscription, result.result);
      res.set("X-Quota-Reset-ID", operation.operation_id);
      return res.status(200).json(body);
    } catch {
      // The job is already durable if enqueue succeeded. A retry worker can
      // finish it after a database/Redis outage or a process restart.
      return res.status(503).json({ code: 503,
        message: operation ? "Quota reset is queued for automatic recovery; do not submit another reset" : "Quota reset could not be queued",
        ...(operation ? { reset_id: operation.operation_id, recovery_pending: true } : {}),
      });
    }
  });
}
