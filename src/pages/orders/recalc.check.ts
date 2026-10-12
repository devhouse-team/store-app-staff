// Run: node --experimental-strip-types src/pages/orders/recalc.check.ts
import assert from "node:assert/strict";
import { recalc } from "./recalc.ts";
import type { Order, OrderItem } from "../../types";

const it = (p: Partial<OrderItem>): OrderItem => ({
  id: "1", productId: "p", packId: "k", name: "x", packLabel: "кг", unit: "кг", qty: 1, actualQty: null,
  unitPrice: 1000, lineTotal: 1000, approximate: true, preorder: false, ...p,
});
const order = { items: [it({}), it({ id: "2", approximate: false, unitPrice: 500, lineTotal: 500 })], discount: 100, deliveryFee: 800, total: 2200, totalBeforeWeighing: null } as unknown as Order;

const r = recalc(order, [it({ actualQty: 1.25 }), order.items[1]]);
assert.equal(r.subtotal, 1750);
assert.equal(r.total, 2450);
assert.equal(r.approximate, false);
assert.equal(r.totalBeforeWeighing, 2200);
// qty change only: no weighing snapshot, still approximate
const q = recalc(order, [it({ qty: 2 }), order.items[1]]);
assert.equal(q.total, 3200);
assert.equal(q.totalBeforeWeighing, null);
assert.equal(q.approximate, true);
console.log("recalc ok");
