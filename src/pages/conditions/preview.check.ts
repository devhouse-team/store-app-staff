// Run: npx tsx src/pages/conditions/preview.check.ts
import assert from "node:assert/strict";
import type { Condition } from "../../types";
import { previewCart } from "./preview";

const base: Omit<Condition, "id" | "name" | "type" | "value" | "scope"> = {
  target: "all", targetId: null, scopeMode: null, scopeCustomerId: null, startsAt: null, endsAt: null, enabled: true,
};
const c = (id: string, p: Partial<Condition>): Condition => ({ ...base, id, name: id, type: "discount", value: null, scope: "global", ...p });
const now = new Date("2026-10-12T09:00:00+05:00");
const milk = { productId: "p-milk", categoryIds: ["c-dairy", "c-food"], qty: 10, unitPrice: 1000, baseQty: 1 };

const conds = [
  c("g10", { value: 10, target: "category", targetId: "c-food" }),
  c("u5", { value: 5, scope: "customer", scopeCustomerId: "u-2" }),
  c("free-retail", { type: "free_delivery_from", value: 15000, scope: "mode", scopeMode: "retail" }),
  c("min-wh", { type: "min_order_amount", value: 50000, scope: "mode", scopeMode: "wholesale" }),
  c("off", { type: "preorder_allowed", scope: "global", enabled: false }),
  c("expired", { type: "custom_delivery_price", value: 100, endsAt: "2026-10-01T00:00:00+05:00" }),
];

// Retail, no customer: global 10% on food (ancestor category), delivery 800, no free (9 000 < 15 000).
let r = previewCart(conds, [milk], { mode: "retail", customerId: null, now });
assert.equal(r.subtotal, 10000);
assert.equal(r.discount, 1000);
assert.equal(r.deliveryFee, 800);
assert.equal(r.preorderAllowed, false); // disabled
assert.equal(r.canOrder, true);

// Customer discount beats global one (priority customer → global).
r = previewCart(conds, [{ ...milk, qty: 20 }], { mode: "retail", customerId: "u-2", now });
assert.equal(r.discount, 1000); // 5% of 20 000, not 10%
assert.equal(r.deliveryFee, 0); // 19 000 ≥ 15 000
assert.deepEqual(r.applied.map((x) => x.id).sort(), ["free-retail", "u5"]);

// Wholesale min order not reached.
r = previewCart(conds, [milk], { mode: "wholesale", customerId: null, now });
assert.equal(r.canOrder, false);
assert.equal(r.amountOk, false);

// Mode-level custom fee overrides global; empty cart can't be ordered.
r = previewCart([...conds, c("fee", { type: "custom_delivery_price", value: 500, scope: "mode", scopeMode: "retail" })], [], { mode: "retail", customerId: null, now });
assert.equal(r.deliveryFee, 500);
assert.equal(r.canOrder, false);

console.log("preview.check: ok");
