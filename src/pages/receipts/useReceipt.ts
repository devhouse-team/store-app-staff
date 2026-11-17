// Receipt work-screen state. Rules:
// - every server call goes through one serialized queue (`run`), and the receipt it returns replaces state as-is
//   (totals are server-computed; nothing is merged or summed here);
// - line edits are debounced per line (400 ms) and flushed on blur, before other actions, on unmount and on pagehide.
import type { HttpError } from "@refinedev/core";
import { App } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { dataProvider, receiptApi } from "../../providers/data";
import type { Pack, Product, Receipt, ReceiptDefaults } from "../../types";

export type Field = "packId" | "packQty" | "unitCost";
export type Patch = { packId?: string; packQty?: number; unitCost?: number };
type ViewPatch = { [K in Field]?: Patch[K] | null };
type LastCost = ReceiptDefaults["lastCost"];

const API_FIELD: Record<string, Field> = { pack_id: "packId", pack_qty: "packQty", unit_cost: "unitCost" };
const valid = (f: Field, v: unknown) => (f === "packId" ? !!v : typeof v === "number" && (f === "packQty" ? v > 0 : v >= 0));
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
// antd precision applies only on blur; the API rejects more decimals (422)
const roundField = (f: Field, v: Patch[Field] | null) =>
  typeof v !== "number" ? v : f === "packQty" ? round3(v) : f === "unitCost" ? round2(v) : v;

const without = <T>(m: Record<string, T>, k: string) => {
  const rest = { ...m };
  delete rest[k];
  return rest;
};

export function useReceipt(id: string, canCatalogRead: boolean) {
  const { message } = App.useApp();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const recRef = useRef<Receipt | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [packs, setPacks] = useState<Record<string, Pack[]>>({});
  const [lastCost, setLastCost] = useState<Record<string, LastCost>>({});
  const [pendingView, setPendingView] = useState<Record<string, ViewPatch>>({});
  const [saving, setSaving] = useState<Record<string, number>>({});
  const [errorItemId, setErrorItemId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, Partial<Record<Field, string>>>>({});
  const [focusId, setFocusId] = useState<string | null>(null); // a new unpriced line: its price input gets focus
  // lines whose pack changed while the price stayed: the price is per pack, so it needs a look
  const [priceCheck, setPriceCheck] = useState<Record<string, true>>({});
  const checkPrice = useCallback((k: string, on: boolean) => setPriceCheck((m) => (on ? { ...m, [k]: true } : m[k] ? without(m, k) : m)), []);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(new Map<string, Patch>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const apply = useCallback((r: Receipt) => {
    recRef.current = r;
    setReceipt(r);
  }, []);
  const reload = useCallback(() => receiptApi.get(id).then(apply), [id, apply]);

  const onError = useCallback(
    async (e: HttpError, itemId?: string) => {
      if (e.code === "receipt_posted" || e.code === "receipt_item_not_found") {
        if (e.code === "receipt_posted") message.warning(e.message);
        else message.error(e.message);
        await reload().catch(() => undefined);
        return;
      }
      message.error(e.message);
      if (e.statusCode === 422 && itemId) {
        // loc is ["body", "pack_qty", <union branch>…]: take the field segment, not the last one
        const errs = (e.errors?.errors ?? []) as { loc?: (string | number)[] }[];
        const fields = Object.fromEntries(
          errs.map((x) => API_FIELD[x.loc?.map(String).find((k) => k in API_FIELD) ?? ""]).filter(Boolean).map((f) => [f, "Некорректное значение"]),
        );
        setFieldErrors((m) => ({ ...m, [itemId]: fields }));
      }
      const bad = e.errors?.item_id ?? (e.statusCode === 400 ? itemId : undefined);
      if (bad != null) setErrorItemId(String(bad));
    },
    [message, reload],
  );

  /** Serialized server call; a returned receipt replaces state. Resolves to true on success. */
  const run = useCallback(
    (op: (r: Receipt) => Promise<Receipt | void>, itemId?: string) =>
      (queue.current = queue.current.then(async () => {
        try {
          const next = await op(recRef.current!);
          if (next) apply(next);
          if (itemId) {
            setErrorItemId((cur) => (cur === itemId ? null : cur));
            setFieldErrors((m) => (m[itemId] ? without(m, itemId) : m));
          }
          return true;
        } catch (e) {
          await onError(e as HttpError, itemId);
          return false;
        }
      })) as Promise<boolean>,
    [apply, onError],
  );

  const flush = useCallback(
    (itemId: string) => {
      clearTimeout(timers.current.get(itemId));
      timers.current.delete(itemId);
      const patch = pending.current.get(itemId);
      if (!patch) return Promise.resolve(true);
      pending.current.delete(itemId);
      setSaving((s) => ({ ...s, [itemId]: (s[itemId] ?? 0) + 1 }));
      return run((r) => receiptApi.updateItem(r.id, itemId, patch), itemId).then((ok) => {
        setSaving((s) => (s[itemId] > 1 ? { ...s, [itemId]: s[itemId] - 1 } : without(s, itemId)));
        // the receipt now holds the saved (or, on error, the old) values
        if (!pending.current.has(itemId)) setPendingView((v) => without(v, itemId));
        return ok;
      });
    },
    [run],
  );
  const flushAll = useCallback(() => Promise.all([...pending.current.keys()].map(flush)), [flush]);

  const setField = useCallback(
    (itemId: string, f: Field, v0: Patch[Field] | null) => {
      const v = roundField(f, v0);
      if (f === "unitCost") checkPrice(itemId, false);
      setPendingView((m) => ({ ...m, [itemId]: { ...m[itemId], [f]: v } }));
      const p = { ...pending.current.get(itemId) };
      if (valid(f, v)) Object.assign(p, { [f]: v });
      else delete p[f]; // an emptied input is not sent; blur restores the saved value
      if (Object.keys(p).length) pending.current.set(itemId, p);
      else pending.current.delete(itemId);
      clearTimeout(timers.current.get(itemId));
      if (pending.current.has(itemId)) timers.current.set(itemId, setTimeout(() => flush(itemId), 400));
    },
    [flush, checkPrice],
  );
  /** Blur / Enter: save now and drop an empty input back to the saved value. */
  const commit = useCallback(
    (itemId: string) => {
      flush(itemId);
      setPendingView((m) => {
        const v = m[itemId];
        if (!v) return m;
        const kept = Object.fromEntries(Object.entries(v).filter(([, x]) => x != null));
        return Object.keys(kept).length ? { ...m, [itemId]: kept } : without(m, itemId);
      });
    },
    [flush],
  );

  /** Last posted price per product from the receipt's supplier (for the «было → стало» hint). */
  const loadLastCost = useCallback(async (r: Receipt) => {
    const ids = [...new Set(r.items.map((i) => i.productId))];
    const d = await Promise.all(ids.map((p) => receiptApi.defaults(p, r.supplierId).catch(() => null)));
    setLastCost(Object.fromEntries(ids.map((p, i) => [p, d[i]?.lastCost ?? null])));
  }, []);

  // Load. Defaults and pack lists are only needed while the receipt is editable.
  useEffect(() => {
    let alive = true;
    receiptApi
      .get(id)
      .then(async (r) => {
        if (!alive) return;
        apply(r);
        if (r.status === "draft") await loadLastCost(r);
      })
      .catch((e: HttpError) => {
        if (e.statusCode === 404) setNotFound(true);
        else message.error(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, apply, message, loadLastCost]);

  const draftLoaded = receipt?.status === "draft";
  useEffect(() => {
    // ItemOut has no pack list; it comes from the catalog (needs catalog.read, otherwise the pack select is locked).
    const ids = [...new Set(recRef.current?.items.map((i) => i.productId))];
    if (!draftLoaded || !canCatalogRead || !ids.length) return;
    dataProvider
      .getMany!({ resource: "products", ids })
      .then(({ data }) => setPacks((m) => ({ ...Object.fromEntries((data as Product[]).map((p) => [p.id, p.packs])), ...m })))
      .catch(() => undefined);
  }, [draftLoaded, canCatalogRead]);

  // Leaving: unmount → flush through the queue (fetches outlive the component);
  // pagehide / hidden tab → send pending edits right away with keepalive so they survive the page being killed.
  useEffect(() => {
    let sentHidden = false;
    const sendNow = () => {
      const r = recRef.current;
      if (!r) return;
      const sent = [...pending.current.keys()];
      for (const [itemId, patch] of pending.current) {
        clearTimeout(timers.current.get(itemId));
        receiptApi.updateItem(r.id, itemId, patch, true).catch(() => undefined);
      }
      pending.current.clear();
      timers.current.clear();
      if (!sent.length) return;
      setPendingView((v) => Object.fromEntries(Object.entries(v).filter(([k]) => !sent.includes(k))));
      sentHidden = true; // PATCHes carry absolute values, so a repeat is harmless
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendNow();
      else if (sentHidden) {
        sentHidden = false;
        run((r) => receiptApi.get(r.id)); // those responses bypassed the queue → resync
      }
    };
    window.addEventListener("pagehide", sendNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", sendNow);
      document.removeEventListener("visibilitychange", onVisibility);
      flushAll();
    };
  }, [run, flushAll]);

  /** Scan / search / new product. The same product in the pack defaults pick gets +1 instead of a new line. */
  const addProduct = useCallback(
    (p: Product) => {
      flushAll();
      setPacks((m) => ({ ...m, [p.id]: p.packs }));
      // Inside the queue, so a fast second scan sees the line the first one created.
      return run(async (r) => {
        const def = await receiptApi.defaults(p.id, r.supplierId);
        setLastCost((m) => ({ ...m, [p.id]: def.lastCost }));
        const packId = p.packs.find((k) => k.id === def.packId)?.id ?? p.packs[0]?.id;
        if (!packId) throw { message: "У товара нет активной фасовки", statusCode: 400 };
        const line = r.items.findLast((i) => i.productId === p.id && i.packId === packId);
        if (line) {
          setPendingView((v) => without(v, line.id)); // an emptied input would hide the new qty
          return receiptApi.updateItem(r.id, line.id, { packQty: round3(line.packQty + 1) });
        }
        // The line exists on the server at once; without a known price for this pack it is priced on screen.
        const unitCost = def.lastCost?.packId === packId ? def.lastCost.unitCost : undefined;
        const next = await receiptApi.addItem(r.id, { productId: p.id, packId, packQty: 1, unitCost });
        if (unitCost == null) setFocusId(next.items.at(-1)?.id ?? null); // items are ordered by id
        return next;
      });
    },
    [flushAll, run],
  );

  /** Pack change: the last price for the new pack goes in the same PATCH; without one the old price is flagged. */
  const changePack = useCallback(
    (itemId: string, productId: string, packId: string) => {
      clearTimeout(timers.current.get(itemId));
      setPendingView((m) => ({ ...m, [itemId]: { ...m[itemId], packId } }));
      setSaving((s) => ({ ...s, [itemId]: (s[itemId] ?? 0) + 1 }));
      return run(async (r) => {
        const d = await receiptApi.defaults(productId, r.supplierId).catch(() => null);
        if (d) setLastCost((m) => ({ ...m, [productId]: d.lastCost }));
        const cost = d?.lastCost?.packId === packId ? d.lastCost.unitCost : undefined;
        const patch: Patch = { ...pending.current.get(itemId), packId, ...(cost != null && { unitCost: cost }) };
        pending.current.delete(itemId);
        // flag only a priced line: the server can't clear a price, and an unpriced one is already highlighted
        const priced = (patch.unitCost ?? r.items.find((i) => i.id === itemId)?.unitCost) != null;
        checkPrice(itemId, cost == null && priced);
        return receiptApi.updateItem(r.id, itemId, patch);
      }, itemId).then((ok) => {
        setSaving((s) => (s[itemId] > 1 ? { ...s, [itemId]: s[itemId] - 1 } : without(s, itemId)));
        if (!pending.current.has(itemId)) setPendingView((v) => without(v, itemId));
        return ok;
      });
    },
    [run, checkPrice],
  );

  const remove = useCallback(
    (itemId: string) => {
      clearTimeout(timers.current.get(itemId));
      pending.current.delete(itemId);
      setPendingView((v) => without(v, itemId));
      return run((r) => receiptApi.removeItem(r.id, itemId), itemId);
    },
    [run],
  );

  /** Header edit (PATCH /receipts/{id}); a new supplier means new last prices. */
  const updateHeader = useCallback(
    (v: Partial<Pick<Receipt, "supplierId" | "docNumber" | "docDate" | "comment">>) =>
      run(async (r) => {
        const next = (await dataProvider.update({ resource: "receipts", id: r.id, variables: v })).data as Receipt;
        if (next.supplierId !== r.supplierId) void loadLastCost(next);
        return next;
      }),
    [run, loadLastCost],
  );

  /** Saves pending edits and waits for the queue, so a confirm shows the total that will be posted. */
  const settle = useCallback(async () => {
    await flushAll();
    await queue.current;
    return recRef.current!;
  }, [flushAll]);

  const post = useCallback(() => {
    flushAll();
    return run(async (r) => {
      const next = await receiptApi.post(r.id);
      message.success("Приёмка проведена");
      return next;
    });
  }, [flushAll, run, message]);

  return {
    receipt, notFound, packs, lastCost, pendingView, saving, errorItemId, fieldErrors, priceCheck, focusId,
    setField, commit, changePack, remove, addProduct, updateHeader, settle, post, checkPrice, markError: setErrorItemId,
  };
}
