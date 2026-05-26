import { buildOrderFulfillmentRequest, isSubscriptionConflictError } from "./subscription-fulfillment.mjs";

export async function fulfillSubscriptionWithRetry(order, { listSubscriptions, submitFulfillment }) {
  const initialSubscriptions = await listSubscriptions(order.user_id);
  let fulfillment = buildOrderFulfillmentRequest(order, initialSubscriptions);

  try {
    await submitFulfillment(fulfillment);
    return fulfillment;
  } catch (error) {
    if (!isSubscriptionConflictError(error)) {
      throw error;
    }

    const refreshedSubscriptions = await listSubscriptions(order.user_id);
    fulfillment = buildOrderFulfillmentRequest(order, refreshedSubscriptions);
    await submitFulfillment(fulfillment);
    return fulfillment;
  }
}
