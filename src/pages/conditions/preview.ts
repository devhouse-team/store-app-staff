// PREVIEW ONLY. The real calculation lives on the server (B7) and is snapshotted into the order.
// Rules mirrored here:
// - an active condition is enabled, inside its period and matches the cart's scope;
// - priority customer → mode → global: for each type only the highest-priority scope present is used;
// - several discounts in that scope: each line takes the largest matching percent (no stacking);
// - several conditions of another type in that scope: the customer-friendly one wins for delivery
//   (lowest threshold / price), the strictest one for minimums;
// - thresholds compare against goods total after discount; volume = qty × pack baseQty.
import type { Condition, ConditionType, CustomerMode } from "../../types";

export const DEFAULT_DELIVERY_FEE = 800;
const RANK = { customer: 0, mode: 1, global: 2 } as const;

export type CartLine = {
  productId: string;
  categoryIds: string[]; // product category + its ancestors
  qty: number;
  unitPrice: number;
  baseQty: number;
};
export type PreviewCtx = { mode: CustomerMode; customerId: string | null; now: Date };

export const isActive = (c: Condition, ctx: PreviewCtx) =>
  c.enabled &&
  (!c.startsAt || Date.parse(c.startsAt) <= +ctx.now) &&
  (!c.endsAt || Date.parse(c.endsAt) >= +ctx.now) &&
  (c.scope === "global" ||
    (c.scope === "mode" && c.scopeMode === ctx.mode) ||
    (c.scope === "customer" && !!ctx.customerId && c.scopeCustomerId === ctx.customerId));

export function previewCart(conditions: Condition[], lines: CartLine[], ctx: PreviewCtx) {
  const active = conditions.filter((c) => isActive(c, ctx));
  const winners = (type: ConditionType) => {
    const ofType = active.filter((c) => c.type === type);
    const best = Math.min(...ofType.map((c) => RANK[c.scope]));
    return ofType.filter((c) => RANK[c.scope] === best);
  };
  const pick = (type: ConditionType, cmp: (a: number, b: number) => boolean) =>
    winners(type).reduce<Condition | null>((w, c) => (!w || cmp(c.value ?? 0, w.value ?? 0) ? c : w), null);

  const applied = new Set<Condition>();
  const discounts = winners("discount");
  let subtotal = 0, discount = 0, volume = 0;
  for (const l of lines) {
    const lineTotal = Math.round(l.qty * l.unitPrice);
    subtotal += lineTotal;
    volume += l.qty * l.baseQty;
    const match = discounts
      .filter((c) => c.target === "all" || (c.target === "product" ? c.targetId === l.productId : l.categoryIds.includes(c.targetId ?? "")))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
    if (match) {
      discount += Math.round((lineTotal * (match.value ?? 0)) / 100);
      applied.add(match);
    }
  }
  const goods = subtotal - discount;

  const freeFrom = pick("free_delivery_from", (a, b) => a < b);
  const customFee = pick("custom_delivery_price", (a, b) => a < b);
  const minAmount = pick("min_order_amount", (a, b) => a > b);
  const minVolume = pick("min_order_volume", (a, b) => a > b);
  const preorder = pick("preorder_allowed", () => false);
  [freeFrom, customFee, minAmount, minVolume, preorder].forEach((c) => c && applied.add(c));

  const isFree = !!freeFrom && goods >= (freeFrom.value ?? 0);
  const deliveryFee = isFree ? 0 : (customFee?.value ?? DEFAULT_DELIVERY_FEE);
  const amountOk = !minAmount || goods >= (minAmount.value ?? 0);
  const volumeOk = !minVolume || volume >= (minVolume.value ?? 0);

  return {
    subtotal,
    discount,
    goods,
    deliveryFee,
    total: goods + deliveryFee,
    volume,
    minAmount: minAmount?.value ?? null,
    minVolume: minVolume?.value ?? null,
    amountOk,
    volumeOk,
    canOrder: lines.length > 0 && amountOk && volumeOk,
    preorderAllowed: !!preorder,
    applied: [...applied],
  };
}
