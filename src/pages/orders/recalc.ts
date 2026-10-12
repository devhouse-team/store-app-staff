import type { Order, OrderItem } from "../../types";

/** Recompute line totals and order totals after staff edits (A2). Discount and delivery fee are kept. */
export const recalc = (order: Order, items: OrderItem[]): Partial<Order> => {
  const next = items.map((i) => ({ ...i, lineTotal: Math.round((i.actualQty ?? i.qty) * i.unitPrice) }));
  const subtotal = next.reduce((s, i) => s + i.lineTotal, 0);
  const total = subtotal - order.discount + order.deliveryFee;
  const weighingChanged = next.some((i) => i.actualQty !== (order.items.find((o) => o.id === i.id)?.actualQty ?? null));
  return {
    items: next,
    subtotal,
    total,
    approximate: next.some((i) => i.approximate && i.actualQty == null),
    totalBeforeWeighing:
      order.totalBeforeWeighing ?? (weighingChanged && total !== order.total ? order.total : null),
  };
};
