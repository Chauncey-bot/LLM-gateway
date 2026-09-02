export async function createPersistedTradingOrder({
  draftOrder,
  sku,
  insertDraft,
  createTradingOrder,
  storeTradingSuccess,
  storeTradingFailure,
}) {
  await insertDraft(draftOrder);

  try {
    const trading = await createTradingOrder(draftOrder, sku);
    const order = await storeTradingSuccess(draftOrder, trading);
    return { order, trading };
  } catch (error) {
    await storeTradingFailure(draftOrder, error);
    throw error;
  }
}
