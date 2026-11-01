// Pack helpers for the product form.
import type { Pack, PackVisibility, Unit } from "../../types";

export const VISIBILITY: Record<PackVisibility, string> = { retail: "Розница", wholesale: "Опт", both: "Оба" };
export const UNITS: Unit[] = ["шт", "кг", "л"];

export const hasRetail = (v: PackVisibility) => v !== "wholesale";
export const hasWholesale = (v: PackVisibility) => v !== "retail";

/** Drops prices that don't apply to the visibility. New packs keep no id (the server assigns one). */
export const normalizePacks = <P extends Omit<Pack, "id"> & { id?: string }>(packs: P[]): P[] =>
  packs.map((p) => ({
    ...p,
    retailPrice: hasRetail(p.visibility) ? (p.retailPrice ?? null) : null,
    wholesalePrice: hasWholesale(p.visibility) ? (p.wholesalePrice ?? null) : null,
  }));
