import { buildOrderFulfillmentRequests, isSubscriptionConflictError } from "./subscription-fulfillment.mjs";

async function submitFulfillments(fulfillments, submitFulfillment) {
  for (const fulfillment of fulfillments) {
    await submitFulfillment(fulfillment);
  }
  return fulfillments[fulfillments.length - 1];
}

function splitFulfillmentsBySkuType(fulfillments) {
  const topUpFulfillments = [];
  const subscriptionFulfillments = [];

  for (const fulfillment of fulfillments) {
    if (fulfillment.skuType === "subscription") {
      subscriptionFulfillments.push(fulfillment);
    } else {
      topUpFulfillments.push(fulfillment);
    }
  }

  return { topUpFulfillments, subscriptionFulfillments };
}

export async function fulfillSubscriptionWithRetry(order, { listSubscriptions, submitFulfillment }) {
  const initialSubscriptions = await listSubscriptions(order.user_id);
  const initialFulfillments = buildOrderFulfillmentRequests(order, initialSubscriptions);
  const { topUpFulfillments, subscriptionFulfillments: initialSubscriptionFulfillments } =
    splitFulfillmentsBySkuType(initialFulfillments);

  await submitFulfillments(topUpFulfillments, submitFulfillment);

  try {
    return await submitFulfillments(initialSubscriptionFulfillments, submitFulfillment);
  } catch (error) {
    if (!isSubscriptionConflictError(error)) {
      throw error;
    }

    const refreshedSubscriptions = await listSubscriptions(order.user_id);
    const refreshedFulfillments = buildOrderFulfillmentRequests(order, refreshedSubscriptions);
    const { subscriptionFulfillments } = splitFulfillmentsBySkuType(refreshedFulfillments);
    return await submitFulfillments(subscriptionFulfillments, submitFulfillment);
  }
}
