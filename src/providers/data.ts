// DataProvider over the Tolyq admin API (/api/v1/admin/*, contract: backend/openapi.json).
// Each Refine resource maps to an endpoint plus a pair of mappers: backend JSON → page types
// (src/types.ts: string ids, numbers for decimals) and page values → request body.
// Sorting is server-defined (no sort params in the API); unsupported filters are ignored.
import type { BaseRecord, CrudFilter, DataProvider, LogicalFilter } from "@refinedev/core";
import dayjs from "dayjs";
import type { Condition, ConditionType, Order, Unit } from "../types";
import { API_URL, api, type Query } from "./api";

/* eslint-disable @typescript-eslint/no-explicit-any -- backend JSON is mapped field by field below */
type J = any;
type Vars = Record<string, any>;

const sid = (v: unknown) => (v == null ? null : String(v));
const iid = (v: unknown) => (v == null || v === "" ? null : Number(v));
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const day = (v: unknown) => (v ? dayjs(String(v)).format("YYYY-MM-DD") : undefined);
/** Picks the keys present in `v` and renames them: { uiKey: [apiKey, convert?] }. */
const rename = (v: Vars, map: Record<string, [string, ((x: any) => unknown)?]>) =>
  Object.fromEntries(Object.entries(map).filter(([k]) => k in v).map(([k, [api, f]]) => [api, f ? f(v[k]) : v[k]]));

export const UNIT: Record<string, Unit> = { pcs: "шт", kg: "кг", l: "л" };
const UNIT_API: Record<string, string> = { шт: "pcs", кг: "kg", л: "l" };

// UI condition types predate the backend enum; the mapping lives here only.
const COND_TYPE: Record<ConditionType, string> = {
  discount: "discount_percent",
  free_delivery_from: "free_delivery_from",
  preorder_allowed: "preorder_allowed",
  min_order_amount: "min_order_amount",
  min_order_volume: "min_order_quantity",
  custom_delivery_price: "delivery_fee",
};
const COND_TYPE_UI = Object.fromEntries(Object.entries(COND_TYPE).map(([k, v]) => [v, k])) as Record<string, ConditionType>;

export const MOVEMENT_REASON: Record<string, string> = {
  receipt: "Поставка", adjustment: "Корректировка", write_off: "Списание", order: "Заказ", order_cancel: "Отмена заказа", import: "Импорт",
};

export const formatAddress = (a: J) =>
  a ? [a.city, a.street, a.house && `д. ${a.house}`, a.apartment && `кв. ${a.apartment}`].filter(Boolean).join(", ") || null : null;

const pack = (k: J) => ({
  id: String(k.id), label: k.name, baseQty: num(k.qty_in_base), retailPrice: num(k.retail_price), wholesalePrice: num(k.wholesale_price),
  wholesaleMinQty: num(k.wholesale_min_qty),
  visibility: k.visibility, step: num(k.step), minQty: num(k.min_qty),
});
const packApi = (k: Vars) => ({
  name: k.label, qty_in_base: k.baseQty, retail_price: k.retailPrice ?? null, wholesale_price: k.wholesalePrice ?? null,
  wholesale_min_qty: k.wholesaleMinQty ?? null,
  visibility: k.visibility, step: k.step, min_qty: k.minQty,
});
const PRODUCT_FIELDS: Record<string, [string, ((x: any) => unknown)?]> = {
  sku: ["sku"], name: ["name"], barcode: ["barcode", (x) => x || null], brand: ["brand"], categoryId: ["category_id", iid],
  description: ["description"], baseUnit: ["base_unit", (x) => UNIT_API[x] ?? x], isWeighed: ["is_weighted"], weightStep: ["weight_step"],
  isPerishable: ["is_perishable"], shelfLifeDays: ["shelf_life_days"], preorderAllowed: ["preorder_allowed"], hidden: ["is_active", (x) => !x],
};

const orderItem = (i: J) => ({
  id: String(i.id), productId: sid(i.product_id), packId: sid(i.pack_id), name: i.name, packLabel: i.pack_name,
  unit: i.estimated ? "кг" : "шт", qty: num(i.quantity), actualQty: num(i.actual_weight), unitPrice: num(i.unit_price),
  lineTotal: num(i.line_total), approximate: i.estimated, preorder: i.is_preorder,
});

type Res = {
  path: string;
  toUi: (r: J) => BaseRecord;
  toApi?: (v: Vars) => Vars;
  /** UI filter field → query param (or a function returning [param, value]). */
  filters?: Record<string, string | ((value: any, op: string) => [string, unknown])>;
  unpaged?: boolean; // endpoint returns a plain array
  updateMethod?: "PATCH" | "PUT";
  create?: (v: Vars) => Promise<J>;
  update?: (id: string, v: Vars) => Promise<J>;
  getOne?: (id: string) => Promise<J>;
};

const resources: Record<string, Res> = {
  categories: {
    path: "/admin/catalog/categories",
    unpaged: true,
    toUi: (c) => ({ id: String(c.id), name: c.name, parentId: sid(c.parent_id) }),
    toApi: (v) => rename(v, { name: ["name"], parentId: ["parent_id", iid] }),
  },
  products: {
    path: "/admin/catalog/products",
    toUi: (p) => ({
      id: String(p.id), sku: p.sku, barcode: p.barcode ?? "", name: p.name, brand: p.brand, categoryId: sid(p.category_id) ?? "",
      imageUrl: p.images?.[0]?.thumb ?? p.images?.[0]?.detail ?? null, imageKeys: (p.images ?? []).map((i: J) => i.key),
      description: p.description, baseUnit: UNIT[p.base_unit] ?? p.base_unit, isWeighed: p.is_weighted, weightStep: num(p.weight_step),
      isPerishable: p.is_perishable, shelfLifeDays: p.shelf_life_days, preorderAllowed: p.preorder_allowed, hidden: !p.is_active,
      packs: (p.packs ?? []).filter((k: J) => k.is_active !== false).map(pack),
    }),
    filters: {
      name: "q", sku: "q", barcode: "q",
      categoryId: (v) => ["category_id", Array.isArray(v) ? v[0] : v],
      hidden: (v) => ["is_active", !v],
    },
    create: async (v) => {
      const p = await api<J>("POST", "/admin/catalog/products", { body: { ...rename(v, PRODUCT_FIELDS), packs: (v.packs ?? []).map(packApi) } });
      return syncImage(p, v);
    },
    update: async (id, v) => {
      const path = `/admin/catalog/products/${id}`;
      const before = await api<J>("GET", path);
      const fields = rename(v, PRODUCT_FIELDS);
      if (Object.keys(fields).length) await api("PATCH", path, { body: fields });
      if (v.packs) {
        const keep = new Set(v.packs.map((k: Vars) => k.id).filter(Boolean));
        for (const k of before.packs as J[]) if (!keep.has(String(k.id))) await api("DELETE", `/admin/catalog/packs/${k.id}`);
        for (const k of v.packs as Vars[])
          if (k.id) await api("PATCH", `/admin/catalog/packs/${k.id}`, { body: packApi(k) });
          else await api("POST", `${path}/packs`, { body: packApi(k) });
      }
      return syncImage(await api<J>("GET", path), v);
    },
  },
  stock: {
    path: "/admin/stock",
    toUi: (s) => ({
      id: String(s.product_id), productId: String(s.product_id), productName: s.name, sku: s.sku, unit: UNIT[s.base_unit] ?? s.base_unit,
      quantity: num(s.quantity), reserved: num(s.reserved), lowThreshold: num(s.low_threshold),
    }),
    filters: { productName: "q", low: "low_only" },
    // { lowThreshold } → threshold; { delta, reason, comment } → adjustment with a movement record.
    update: (id, v) =>
      "lowThreshold" in v
        ? api("PUT", `/admin/stock/${id}/threshold`, { body: { low_threshold: v.lowThreshold } })
        : api("POST", `/admin/stock/${id}/adjust`, { body: { delta: v.delta, reason: v.reason, comment: v.comment } }),
  },
  stock_movements: {
    path: "/admin/stock/movements",
    toUi: (m) => ({
      id: String(m.id), productId: String(m.product_id), delta: num(m.delta), orderId: sid(m.order_id), staffId: sid(m.staff_id),
      reason: [MOVEMENT_REASON[m.reason] ?? m.reason, m.comment].filter(Boolean).join(": "), createdAt: m.created_at,
    }),
    filters: { productId: "product_id", orderId: "order_id" },
  },
  orders: {
    path: "/admin/orders",
    toUi: (o): Order => ({
      id: String(o.id), number: o.number, customerId: sid(o.customer?.id) ?? "", customerName: o.contact_name ?? o.customer?.name ?? "—",
      customerPhone: o.contact_phone ?? o.customer?.phone ?? "", mode: o.mode, status: o.status, createdAt: o.created_at,
      items: (o.items ?? []).map(orderItem), subtotal: num(o.subtotal) ?? 0, discount: num(o.discount_total) ?? 0,
      deliveryFee: num(o.delivery_fee) ?? 0, total: num(o.total) ?? 0, approximate: o.is_estimated, paymentMethod: o.payment_method,
      paymentStatus: o.payment_status, fulfilment: o.delivery_type, address: formatAddress(o.delivery_address),
      slot: o.delivery_date ? dayjs(o.delivery_date).format("DD.MM.YYYY") : null, courierId: sid(o.courier?.id ?? o.courier_id),
      paymentId: sid(o.payment_id), expectedDate: o.expected_date, cancelReason: o.cancel_reason ?? null, comment: o.comment ?? null,
      invoiceId: sid(o.invoice?.id), invoiceNumber: o.invoice?.number ?? null, invoiceUrl: o.invoice?.url ?? null,
    }),
    filters: {
      status: (v) => ["status", Array.isArray(v) ? v[0] : v],
      createdAt: (v, op) => [op.startsWith("g") ? "date_from" : "date_to", day(v)],
      mode: "mode", paymentStatus: "payment_status", paymentMethod: "payment_method", isNewCustomer: "new_customer", customerId: "customer_id",
    },
    // Staff edits are separate actions on the backend; the server recalculates totals.
    update: async (id, v) => {
      const path = `/admin/orders/${id}`;
      let out: J = null;
      if (v.items) out = await api("PATCH", `${path}/items`, { body: { items: v.items } });
      if ("expectedDate" in v && v.expectedDate) out = await api("POST", `${path}/expected-date`, { body: { expected_date: v.expectedDate } });
      if ("courierId" in v) out = await api("POST", `${path}/courier`, { body: { courier_id: iid(v.courierId) } });
      if (v.status) out = await api("POST", `${path}/status`, { body: { status: v.status, reason: v.cancelReason ?? null } });
      if (v.paymentStatus) {
        const paymentId = v.paymentId ?? (await api<J>("GET", path)).payment_id;
        if (!paymentId) throw { message: "У заказа нет платежа", statusCode: 409 };
        await api("POST", `/admin/payments/${paymentId}/${v.paymentStatus === "refunded" ? "refund" : "confirm"}`, { body: {} });
        out = null; // payment endpoints return the payment, not the order
      }
      return out ?? api("GET", path);
    },
  },
  invoices: {
    path: "/admin/invoices",
    toUi: (i) => ({
      id: String(i.id), number: i.number, orderId: String(i.order_id), total: num(i.total), vat: num(i.vat_amount),
      vatRate: num(i.vat_rate), createdAt: i.issued_at, url: i.url ?? null,
    }),
    filters: { orderId: "order_id" },
    create: (v) => api("POST", `/admin/invoices/orders/${v.orderId}`),
  },
  customers: {
    path: "/admin/customers",
    toUi: (c) => ({
      id: String(c.id), name: c.name, phone: c.phone ?? "", email: c.email, mode: c.mode,
      wholesaleStatus: c.wholesale_request?.status ?? (c.wholesale_approved ? "approved" : null),
      orgName: c.wholesale_request?.org_name ?? null, bin: c.wholesale_request?.bin ?? null, ordersCount: c.orders_count ?? 0,
      isNew: !!c.is_new, blocked: !c.is_active, createdAt: c.created_at,
    }),
    filters: { name: "search", phone: "search", mode: "mode", isNew: "is_new", blocked: (v) => ["is_active", !v] },
    update: (id, v) => api("POST", `/admin/customers/${id}/${v.blocked ? "block" : "unblock"}`),
  },
  wholesale_requests: {
    path: "/admin/customers/wholesale-requests",
    toUi: (r) => ({
      id: String(r.id), customerId: String(r.customer_id), orgName: r.org_name, bin: r.bin, address: r.address ?? null,
      contactPerson: r.contact_name ?? null, phone: r.contact_phone ?? null, status: r.status,
      documents: (r.documents ?? []).map((d: J) => ({ id: String(d.id), name: d.file_name, sizeBytes: d.size, url: d.url })),
      commentToCustomer: r.admin_comment ?? null, internalNote: r.internal_note ?? null, submittedAt: r.created_at, reviewedAt: r.reviewed_at,
    }),
    filters: { status: (v) => ["status", Array.isArray(v) ? v[0] : v], customerId: "customer_id", orgName: "search" },
    toApi: (v) => rename(v, { status: ["status"], commentToCustomer: ["admin_comment"], internalNote: ["internal_note"] }),
  },
  conditions: {
    path: "/admin/pricing/conditions",
    toUi: (c): Condition => {
      const t = c.targets?.[0];
      return {
        id: String(c.id), name: c.name, type: COND_TYPE_UI[c.type] ?? c.type, value: num(c.value),
        target: t?.target_type ?? "all", targetId: sid(t?.category_id ?? t?.product_id), scope: c.scope, scopeMode: c.mode,
        scopeCustomerId: sid(c.customer_id), startsAt: c.starts_at, endsAt: c.ends_at, enabled: c.is_active,
        priority: c.priority, targets: c.targets,
      };
    },
    toApi: (v) => {
      // UI edits only targets[0]; keep the stored list unless that first target changed
      const t = v.targets?.[0];
      const same = t && (t.target_type ?? "all") === (v.target ?? "all") && sid(t.category_id ?? t.product_id) === (v.targetId ?? null);
      return {
        name: v.name, type: COND_TYPE[v.type as ConditionType] ?? v.type, scope: v.scope, mode: v.scope === "mode" ? v.scopeMode : null,
        customer_id: v.scope === "customer" ? iid(v.scopeCustomerId) : null, value: v.value ?? null, priority: v.priority ?? 0,
        is_active: !!v.enabled, starts_at: v.startsAt ?? null, ends_at: v.endsAt ?? null,
        targets: same
          ? v.targets.map((x: J) => ({ target_type: x.target_type, category_id: x.category_id, product_id: x.product_id }))
          : v.target && v.target !== "all" && v.targetId
            ? [{ target_type: v.target, [v.target === "category" ? "category_id" : "product_id"]: iid(v.targetId) }]
            : [{ target_type: "all" }],
      };
    },
    filters: {
      type: (v) => ["type", COND_TYPE[v as ConditionType] ?? v], scope: "scope", scopeCustomerId: "customer_id",
      enabled: (v) => ["is_active", String(v)],
    },
    updateMethod: "PUT",
  },
  delivery_zones: {
    path: "/admin/delivery/zones",
    toUi: (z) => ({
      id: String(z.id), name: z.name, localities: z.localities ?? [], fee: num(z.fee) ?? 0, freeFrom: num(z.free_from),
      minOrder: num(z.min_order_amount), active: z.is_active ?? true,
    }),
    toApi: (v) => rename(v, {
      name: ["name"], localities: ["localities"], fee: ["fee"], freeFrom: ["free_from"], minOrder: ["min_order_amount"], active: ["is_active"],
    }),
  },
  delivery_slots: {
    path: "/admin/delivery/slots",
    toUi: (s) => ({
      id: String(s.id), weekday: s.weekday, from: String(s.start_time).slice(0, 5), to: String(s.end_time).slice(0, 5),
      limit: s.capacity ?? null, active: s.is_active ?? true,
    }),
    toApi: (v) => rename(v, { weekday: ["weekday"], from: ["start_time"], to: ["end_time"], limit: ["capacity"], active: ["is_active"] }),
  },
  couriers: {
    path: "/admin/delivery/couriers",
    toUi: (c) => ({ id: String(c.id), name: c.name, phone: c.phone, active: c.is_active ?? true }),
    toApi: (v) => rename(v, { name: ["name"], phone: ["phone"], active: ["is_active"] }),
    filters: { active: "is_active" },
  },
  audit_log: {
    path: "/admin/audit",
    toUi: (a) => ({
      id: String(a.id), staff: a.staff_name ?? "—", staffId: sid(a.staff_id), resource: a.entity, recordId: a.entity_id,
      action: a.action, before: a.before, after: a.after, createdAt: a.created_at,
    }),
    filters: {
      resource: "entity", staffId: "staff_id", action: "action",
      createdAt: (v, op) => [op.startsWith("g") ? "date_from" : "date_to", v],
    },
  },
  imports: {
    path: "/admin/import/jobs",
    toUi: (j) => ({
      id: String(j.id), fileName: j.file_name, dryRun: j.dry_run, status: j.status, rows: j.total_rows, okRows: j.ok_rows,
      errorRows: j.error_rows, summary: j.summary ?? {}, createdAt: j.created_at,
      errors: (j.errors ?? []).map((e: J) => ({ row: e.row_number, level: e.level, message: e.message })),
    }),
  },
  settings: {
    path: "/admin/settings",
    toUi: (s) => ({
      id: "main", legalName: s.shop_requisites?.name ?? null, bin: s.shop_requisites?.bin ?? null,
      legalAddress: s.shop_requisites?.address ?? null, bank: s.shop_requisites?.bank ?? null, iban: s.shop_requisites?.iik ?? null,
      bik: s.shop_requisites?.bik ?? null, kbe: s.shop_requisites?.kbe ?? null, vatRate: num(s.vat_rate),
      transferRecipient: s.transfer_requisites?.recipient ?? null, kaspiPhone: s.transfer_requisites?.kaspi_phone ?? null,
      card: s.transfer_requisites?.card ?? null, pickupAddress: s.pickup_address ?? null, pickupHours: s.pickup_hours ?? null,
      supportPhone: s.support_phone ?? null, supportEmail: s.support_email ?? null, supportTelegram: s.support_telegram ?? null,
    }),
    getOne: () => api("GET", "/admin/settings"),
    // PUT is partial by top-level key, but a nested object replaces the stored one → merge with the current value.
    update: async (_id, v) => {
      const cur = await api<J>("GET", "/admin/settings");
      const req = rename(v, { legalName: ["name"], bin: ["bin"], legalAddress: ["address"], bank: ["bank"], iban: ["iik"], bik: ["bik"], kbe: ["kbe"] });
      const tr = rename(v, { transferRecipient: ["recipient"], kaspiPhone: ["kaspi_phone"], card: ["card"] });
      const empty = (x: unknown) => (x === "" ? null : x);
      const body: Vars = rename(v, {
        vatRate: ["vat_rate"], pickupAddress: ["pickup_address", empty], pickupHours: ["pickup_hours", empty],
        supportPhone: ["support_phone", empty], supportEmail: ["support_email", empty], supportTelegram: ["support_telegram", empty],
      });
      if (Object.keys(req).length) body.shop_requisites = { ...cur.shop_requisites, ...req };
      if (Object.keys(tr).length) body.transfer_requisites = { ...cur.transfer_requisites, ...tr };
      return api("PUT", "/admin/settings", { body });
    },
  },
};

/** Uploads a newly picked photo (File) or removes the photos when the field was cleared. */
const syncImage = async (p: J, v: Vars) => {
  const path = `/admin/catalog/products/${p.id}/images`;
  if (v.imageUrl instanceof File) {
    for (const i of p.images ?? []) await api("DELETE", path, { query: { key: i.key } });
    const form = new FormData();
    form.append("file", v.imageUrl);
    return api<J>("POST", path, { body: form });
  }
  if ("imageUrl" in v && !v.imageUrl) for (const i of p.images ?? []) p = await api<J>("DELETE", path, { query: { key: i.key } });
  return p;
};

const res = (name: string) => {
  const r = resources[name];
  if (!r) throw new Error(`Unknown resource: ${name}`);
  return r;
};

const toQuery = (r: Res, filters: CrudFilter[] = []): Query => {
  const q: Query = {};
  const add = (f: LogicalFilter) => {
    const { field, operator, value } = f;
    if (value == null || value === "" || (Array.isArray(value) && !value.length) || operator === "ne" || operator === "nin") return;
    const m = r.filters?.[field];
    if (!m) return;
    const [k, v] = typeof m === "string" ? [m, Array.isArray(value) ? value[0] : value] : m(value, operator);
    if (v != null && v !== "") q[k] = v as string;
  };
  for (const f of filters) {
    // "or" groups are search boxes over several fields → the backend's single search param.
    if (f.operator === "or" || f.operator === "and") f.value.forEach((x) => "field" in x && add(x));
    else add(f as LogicalFilter);
  }
  return q;
};

const PAGE_MAX = 100; // backend MAX_PAGE_SIZE

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,
  getList: async ({ resource, pagination, filters }) => {
    const r = res(resource);
    const query = toQuery(r, filters);
    if (r.unpaged) {
      const rows = await api<J[]>("GET", r.path, { query });
      return { data: rows.map(r.toUi) as never[], total: rows.length };
    }
    const { currentPage = 1, pageSize = 10, mode = "server" } = pagination ?? {};
    if (mode !== "off") {
      const p = await api<J>("GET", r.path, { query: { ...query, page: currentPage, size: Math.min(pageSize, PAGE_MAX) } });
      return { data: p.items.map(r.toUi) as never[], total: p.total };
    }
    // ponytail: "all rows" = sequential 100-row pages; fine for this shop's catalogue size.
    const items: J[] = [];
    for (let page = 1; ; page++) {
      const p = await api<J>("GET", r.path, { query: { ...query, page, size: PAGE_MAX } });
      items.push(...p.items);
      if (items.length >= p.total || !p.items.length) break;
    }
    return { data: items.map(r.toUi) as never[], total: items.length };
  },
  getMany: async ({ resource, ids }) => {
    const r = res(resource);
    return { data: (await Promise.all(ids.map((id) => (r.getOne?.(String(id)) ?? api<J>("GET", `${r.path}/${id}`))))).map(r.toUi) as never[] };
  },
  getOne: async ({ resource, id }) => {
    const r = res(resource);
    const rec = await (r.getOne?.(String(id)) ?? api<J>("GET", `${r.path}/${id}`));
    if (!rec) throw { message: "Запись не найдена", statusCode: 404 };
    return { data: r.toUi(rec) as never };
  },
  create: async ({ resource, variables }) => {
    const r = res(resource);
    const v = variables as Vars;
    return { data: r.toUi(await (r.create?.(v) ?? api<J>("POST", r.path, { body: r.toApi ? r.toApi(v) : v }))) as never };
  },
  update: async ({ resource, id, variables }) => {
    const r = res(resource);
    let v = variables as Vars;
    if (r.update) return { data: r.toUi(await r.update(String(id), v)) as never };
    if (r.updateMethod === "PUT") v = { ...r.toUi(await api<J>("GET", `${r.path}/${id}`)), ...v }; // PUT needs the full body
    return { data: r.toUi(await api<J>(r.updateMethod ?? "PATCH", `${r.path}/${id}`, { body: r.toApi ? r.toApi(v) : v })) as never };
  },
  updateMany: async ({ resource, ids, variables }) => {
    const v = variables as Vars;
    if (resource === "products") {
      const action = "categoryId" in v ? "set_category" : v.hidden ? "hide" : "show";
      await api("POST", "/admin/catalog/products/bulk", { body: { ids: ids.map(Number), action, category_id: iid(v.categoryId) } });
      return { data: ids.map((id) => ({ id })) as never[] };
    }
    const out = await Promise.all(ids.map((id) => dataProvider.update({ resource, id, variables })));
    return { data: out.map((x) => x.data) as never[] };
  },
  deleteOne: async ({ resource, id }) => {
    await api("DELETE", `${res(resource).path}/${id}`);
    return { data: { id } as never };
  },
  // One-off actions: preview, analytics, picking list, import upload, invoice regenerate…
  // `url` is relative to /api/v1 (e.g. "/admin/pricing/preview").
  custom: async ({ url, method, payload, query }) => ({
    data: (await api(method.toUpperCase(), url, { query: query as Query, body: payload })) as never,
  }),
};
