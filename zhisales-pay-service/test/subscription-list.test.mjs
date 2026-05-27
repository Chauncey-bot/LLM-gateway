import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSubscriptionListResponse } from "../subscription-list.mjs";

test("normalizes a direct subscription array response", () => {
  const items = [{ id: 1 }, { id: 2 }];

  assert.deepEqual(normalizeSubscriptionListResponse(items), items);
});

test("normalizes an items wrapper response", () => {
  const items = [{ id: 3 }, { id: 4 }];

  assert.deepEqual(normalizeSubscriptionListResponse({ items }), items);
});

test("falls back to an empty array for unexpected shapes", () => {
  assert.deepEqual(normalizeSubscriptionListResponse({ data: [] }), []);
  assert.deepEqual(normalizeSubscriptionListResponse(null), []);
});
