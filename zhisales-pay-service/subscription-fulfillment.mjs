export function pickMatchingSubscription(subscriptions, groupId) {
  const candidates = subscriptions.filter((item) => Number(item.group_id) === Number(groupId));
  if (candidates.length === 0) {
    return null;
  }

  const statusWeight = {
    active: 3,
    expired: 2,
    revoked: 1,
  };

  return candidates
    .slice()
    .sort((a, b) => {
      const statusDelta = (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0);
      if (statusDelta !== 0) return statusDelta;

      const expiresA = a.expires_at ? Date.parse(a.expires_at) : Number.NEGATIVE_INFINITY;
      const expiresB = b.expires_at ? Date.parse(b.expires_at) : Number.NEGATIVE_INFINITY;
      if (expiresA !== expiresB) return expiresB - expiresA;

      const updatedA = a.updated_at ? Date.parse(a.updated_at) : Number.NEGATIVE_INFINITY;
      const updatedB = b.updated_at ? Date.parse(b.updated_at) : Number.NEGATIVE_INFINITY;
      if (updatedA !== updatedB) return updatedB - updatedA;

      return Number(b.id || 0) - Number(a.id || 0);
    })[0];
}

function resolveTopUpBalanceAmount(order) {
  if (order.sku_type !== "subscription") {
    return null;
  }

  const balanceAmount = Number(order.balance_amount);
  if (!Number.isFinite(balanceAmount) || balanceAmount <= 0) {
    return null;
  }

  return balanceAmount;
}

export function buildOrderFulfillmentRequests(order, subscriptions = []) {
  const fulfillments = [];
  const topUpBalanceAmount = resolveTopUpBalanceAmount(order);

  if (topUpBalanceAmount !== null) {
    fulfillments.push({
      skuType: "balance",
      operation: "add",
      path: `/api/v1/admin/users/${order.user_id}/balance`,
      body: {
        balance: topUpBalanceAmount,
        operation: "add",
        notes: `payment:${order.merchant_order_id}`,
      },
    });
  }

  if (order.sku_type === "subscription") {
    fulfillments.push({
      skuType: "subscription",
      ...buildSubscriptionFulfillmentRequest(order, subscriptions),
    });
    return fulfillments;
  }

  if (order.sku_type === "balance") {
    fulfillments.push({
      skuType: "balance",
      operation: "add",
      path: `/api/v1/admin/users/${order.user_id}/balance`,
      body: {
        balance: Number(order.balance_amount),
        operation: "add",
        notes: `payment:${order.merchant_order_id}`,
      },
    });
  }

  if (fulfillments.length === 0) {
    throw new Error(`Unsupported sku_type: ${order.sku_type}`);
  }

  return fulfillments;
}

export function isSubscriptionConflictError(error) {
  const message = typeof error === "string" ? error : error instanceof Error ? error.message : String(error || "");
  return message.includes("(409)") || /conflicts with existing assignment semantics/i.test(message);
}

export function buildSubscriptionFulfillmentRequest(order, subscriptions) {
  const existing = pickMatchingSubscription(subscriptions, order.group_id);
  if (existing) {
    return {
      operation: "extend",
      path: `/api/v1/admin/subscriptions/${existing.id}/extend`,
      body: { days: Number(order.validity_days) },
    };
  }

  return {
    operation: "assign",
    path: "/api/v1/admin/subscriptions/assign",
    body: {
      user_id: Number(order.user_id),
      group_id: Number(order.group_id),
      validity_days: Number(order.validity_days),
      notes: `payment:${order.merchant_order_id}`,
    },
  };
}

export function buildOrderFulfillmentRequest(order, subscriptions = []) {
  const fulfillments = buildOrderFulfillmentRequests(order, subscriptions);
  return fulfillments[0];
}
