// Pack helpers shared by the product form and the CSV import. Pure (type-only imports) so
// pages/imports/csv.check.ts can run them under plain node.
import type { Pack, PackVisibility, Product } from "../../types";

export const VISIBILITY: Record<PackVisibility, string> = { retail: "Розница", wholesale: "Опт", both: "Оба" };
export const UNITS: Pack["unit"][] = ["шт", "кг", "л"];

export const hasRetail = (v: PackVisibility) => v !== "wholesale";
export const hasWholesale = (v: PackVisibility) => v !== "retail";

/** Drops prices that don't apply to the visibility and assigns ids to new packs (`${productId}-${n}`). */
export const normalizePacks = (packs: (Omit<Pack, "id"> & { id?: string })[], productId: string): Pack[] => {
  const used = new Set(packs.map((p) => p.id).filter(Boolean));
  let n = 0;
  return packs.map((p) => {
    let id = p.id;
    if (!id) {
      do id = `${productId}-${++n}`;
      while (used.has(id));
      used.add(id);
    }
    return {
      ...p,
      id,
      retailPrice: hasRetail(p.visibility) ? (p.retailPrice ?? null) : null,
      wholesalePrice: hasWholesale(p.visibility) ? (p.wholesalePrice ?? null) : null,
    };
  });
};

/** Stock unit convention from the seed: weighed goods are counted in kg, the rest in pieces. */
export const stockUnit = (p: Pick<Product, "isWeighed">) => (p.isWeighed ? "кг" : "шт");

export const newProductId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
