// Offline contract check for the data/auth providers: `npx tsx src/providers/data.check.ts`
// fetch is stubbed; every request the providers make is validated against backend/openapi.json
// (path + method exist, query params declared, JSON body keys known to the request schema),
// and backend-shaped responses are checked to map onto the page types.
/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs poke at untyped JSON */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(here, "../../../backend/backend/openapi.json");
const spec = existsSync(specPath) ? JSON.parse(readFileSync(specPath, "utf8")) : null;
if (!spec) console.warn(`data.check: ${specPath} not found — contract validation skipped`);

type Call = { method: string; path: string; query: Record<string, string>; body: unknown; headers: Record<string, string> };
const calls: Call[] = [];
let routes: Record<string, unknown> = {};

const schemaProps = (s: any): Set<string> | null => {
  if (!s) return null;
  if (s.$ref) return schemaProps(spec.components.schemas[s.$ref.split("/").pop()]);
  if (s.anyOf) return s.anyOf.map(schemaProps).find(Boolean) ?? null;
  return s.properties ? new Set(Object.keys(s.properties)) : null;
};
const findOp = (method: string, path: string) => {
  for (const [tpl, ops] of Object.entries<any>(spec.paths)) {
    const re = new RegExp(`^${tpl.replace(/\{[^}]+\}/g, "[^/]+")}$`);
    if (re.test(path) && ops[method.toLowerCase()]) return ops[method.toLowerCase()];
  }
  return null;
};
const validate = (c: Call) => {
  if (!spec) return;
  const op = findOp(c.method, c.path);
  assert.ok(op, `no ${c.method} ${c.path} in openapi.json`);
  const declared = new Set((op.parameters ?? []).filter((p: any) => p.in === "query").map((p: any) => p.name));
  for (const k of Object.keys(c.query)) assert.ok(declared.has(k), `${c.method} ${c.path}: unknown query param ${k}`);
  const json = op.requestBody?.content?.["application/json"]?.schema;
  if (json && c.body && typeof c.body === "object" && !Array.isArray(c.body)) {
    const props = schemaProps(json);
    if (props) for (const k of Object.keys(c.body)) assert.ok(props.has(k), `${c.method} ${c.path}: unknown body key ${k}`);
  }
};

globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
  const call = { method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: (init.headers ?? {}) as Record<string, string> };
  calls.push(call);
  validate(call);
  const key = `${method} ${url.pathname}`;
  const hit = Object.keys(routes).find((k) => k === key) ?? Object.keys(routes).find((k) => new RegExp(`^${k}$`).test(key));
  if (!hit) return new Response(JSON.stringify({ error: { code: "not_found", message: "Не найдено", details: {} } }), { status: 404, headers: { "content-type": "application/json" } });
  const r = routes[hit];
  return new Response(r == null ? null : JSON.stringify(r), { status: r == null ? 204 : 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { dataProvider: dp } = await import("./data.ts");
const { authProvider } = await import("./auth.ts");
const reset = (r: Record<string, unknown>) => ((routes = r), (calls.length = 0));
const page = (items: unknown[]) => ({ items, total: items.length, page: 1, size: 100 });

// --- auth: form login, CSRF echoed on unsafe methods
reset({ "POST /api/v1/admin/auth/login": { id: 1, username: "admin", csrf_token: "tok" }, "GET /api/v1/admin/staff/me": { id: 1, name: "Айдана", username: "admin", email: "a@t.kz", is_superuser: true, permissions: [] } });
assert.equal((await authProvider.login({ email: "a@t.kz", password: "secret123" })).success, true);
assert.ok(calls[0].body instanceof URLSearchParams && calls[0].body.get("username") === "a@t.kz");

// --- orders: filters → query, backend fields → page fields
const order = {
  id: 7, number: "A-0007", parent_id: null, status: "new", mode: "retail", payment_method: "transfer", payment_status: "pending",
  delivery_type: "delivery", total: "12500.00", is_estimated: true, expected_date: null, created_at: "2026-10-30T10:00:00Z",
  delivery_address: { city: "Алматы", street: "Абая", house: "1", apartment: null }, delivery_date: "2026-11-02", slot_id: 3, zone_id: 1,
  contact_name: "Ерлан", contact_phone: "+77001112233", comment: null, subtotal: "11500.00", discount_total: "0.00", delivery_fee: "1000.00",
  cancel_reason: null, courier: null, invoice: null, payment_id: 70, customer: { id: 5, name: "Ерлан", phone: null, email: null },
  items: [{ id: 71, product_id: 1, pack_id: 2, name: "Сыр", sku: "S1", pack_name: "кг", qty_in_base: "1", unit_price: "5750.00", quantity: "2.000",
    line_total: "11500.00", discount_amount: "0", actual_weight: null, estimated: true, is_preorder: false }],
  idempotency_key: null, conditions_snapshot: {},
};
reset({ "GET /api/v1/admin/orders": page([order]), "GET /api/v1/admin/orders/7": order, "POST /api/v1/admin/orders/7/status": { ...order, status: "cancelled" }, "POST /api/v1/admin/payments/70/confirm": {}, "PATCH /api/v1/admin/orders/7/items": order });
const list = await dp.getList({ resource: "orders", pagination: { currentPage: 2, pageSize: 20 }, filters: [
  { field: "status", operator: "eq", value: "new" }, { field: "createdAt", operator: "gte", value: "2026-10-01" },
  { field: "status", operator: "ne", value: "cancelled" }, { field: "paymentMethod", operator: "eq", value: "transfer" },
] });
assert.deepEqual(calls[0].query, { status: "new", date_from: "2026-10-01", payment_method: "transfer", page: "2", size: "20" });
const o = list.data[0] as any;
assert.equal(o.id, "7"); assert.equal(o.total, 12500); assert.equal(o.customerPhone, "+77001112233");
assert.equal(o.address, "Алматы, Абая, д. 1"); assert.equal(o.items[0].qty, 2); assert.equal(o.paymentId, "70");
calls.length = 0;
await dp.update({ resource: "orders", id: "7", variables: { status: "cancelled", cancelReason: "нет товара" } });
assert.deepEqual(calls[0].body, { status: "cancelled", reason: "нет товара" });
assert.equal(calls[0].headers["X-CSRF-Token"], "tok");
reset({ ...routes });
await dp.update({ resource: "orders", id: "7", variables: { paymentStatus: "confirmed" } });
assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["GET /api/v1/admin/orders/7", "POST /api/v1/admin/payments/70/confirm", "GET /api/v1/admin/orders/7"]);
reset({ ...routes });
await dp.update({ resource: "orders", id: "7", variables: { items: [{ id: 71, actual_weight: 2.1 }] } });
assert.deepEqual(calls[0].body, { items: [{ id: 71, actual_weight: 2.1 }] });

// --- products: "all rows" paging, create with packs, pack diff on update, bulk
const product = { id: 3, external_id: null, source: "manual", sku: "S1", name: "Сыр", category_id: 2, barcode: null, brand: null, base_unit: "kg",
  is_weighted: true, weight_step: "0.100", is_perishable: true, shelf_life_days: 7, preorder_allowed: false, description: null, images: [], is_active: true,
  packs: [{ id: 10, external_id: null, name: "1 кг", qty_in_base: "1.000", retail_price: "5750.00", wholesale_price: null, visibility: "retail", step: "1.000", min_qty: "1.000", sort_order: 0, is_active: true },
    { id: 11, external_id: null, name: "5 кг", qty_in_base: "5.000", retail_price: null, wholesale_price: "25000.00", visibility: "wholesale", step: "1.000", min_qty: "1.000", sort_order: 1, is_active: true }] };
reset({ "GET /api/v1/admin/catalog/products": { items: [product], total: 1, page: 1, size: 100 }, "GET /api/v1/admin/catalog/products/3": product,
  "PATCH /api/v1/admin/catalog/products/3": product, "PATCH /api/v1/admin/catalog/packs/10": {}, "DELETE /api/v1/admin/catalog/packs/11": null,
  "POST /api/v1/admin/catalog/products/3/packs": {}, "POST /api/v1/admin/catalog/products": product, "POST /api/v1/admin/catalog/products/bulk": { updated: 1 } });
const all = await dp.getList({ resource: "products", pagination: { mode: "off" }, filters: [{ operator: "or", value: [{ field: "name", operator: "contains", value: "сыр" }] }, { field: "hidden", operator: "eq", value: false }] });
assert.deepEqual(calls[0].query, { q: "сыр", is_active: "true", page: "1", size: "100" });
const p = all.data[0] as any;
assert.equal(p.baseUnit, "кг"); assert.equal(p.packs[0].retailPrice, 5750); assert.equal(p.hidden, false);
reset({ ...routes });
const packV = (id: string | undefined, label: string) => ({ id, label, baseQty: 1, retailPrice: 100, wholesalePrice: null, visibility: "retail", step: 1, minQty: 1 });
await dp.update({ resource: "products", id: "3", variables: { name: "Сыр", hidden: true, baseUnit: "кг", imageUrl: null, packs: [packV("10", "1 кг"), packV(undefined, "2 кг")] } });
assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
  "GET /api/v1/admin/catalog/products/3", "PATCH /api/v1/admin/catalog/products/3", "DELETE /api/v1/admin/catalog/packs/11",
  "PATCH /api/v1/admin/catalog/packs/10", "POST /api/v1/admin/catalog/products/3/packs", "GET /api/v1/admin/catalog/products/3",
]);
assert.deepEqual(calls[1].body, { name: "Сыр", base_unit: "kg", is_active: false });
reset({ ...routes });
await dp.create({ resource: "products", variables: { sku: "S2", name: "Х", categoryId: "2", baseUnit: "шт", packs: [packV(undefined, "шт")] } });
assert.equal((calls[0].body as any).packs[0].name, "шт");
reset({ ...routes });
await dp.updateMany!({ resource: "products", ids: ["3"], variables: { categoryId: "4" } });
assert.deepEqual(calls[0].body, { ids: [3], action: "set_category", category_id: 4 });

// --- stock: adjust + threshold
reset({ "POST /api/v1/admin/stock/3/adjust": { product_id: 3, sku: "S1", name: "Сыр", base_unit: "kg", quantity: "5", reserved: "1", available: "4", low_threshold: "2", is_low: false },
  "PUT /api/v1/admin/stock/3/threshold": { product_id: 3, sku: "S1", name: "Сыр", base_unit: "kg", quantity: "5", reserved: "1", available: "4", low_threshold: "3", is_low: false } });
const st = await dp.update({ resource: "stock", id: "3", variables: { delta: 2, reason: "receipt", comment: "Поставка" } });
assert.equal((st.data as any).quantity, 5);
await dp.update({ resource: "stock", id: "3", variables: { lowThreshold: 3 } });
assert.deepEqual(calls[1].body, { low_threshold: 3 });

// --- conditions: PUT needs the full body, UI type codes → backend enum
const cond = { id: 4, name: "5%", type: "discount_percent", scope: "customer", mode: null, customer_id: 5, value: "5.00", priority: 0, is_active: true,
  starts_at: null, ends_at: null, targets: [{ id: 1, target_type: "category", category_id: 2, product_id: null }], created_at: "x", updated_at: "x" };
reset({ "GET /api/v1/admin/pricing/conditions/4": cond, "PUT /api/v1/admin/pricing/conditions/4": { ...cond, is_active: false } });
const c = await dp.update({ resource: "conditions", id: "4", variables: { enabled: false } });
assert.equal((c.data as any).type, "discount");
assert.deepEqual(calls[1].body, { name: "5%", type: "discount_percent", scope: "customer", mode: null, customer_id: 5, value: 5, priority: 0, is_active: false,
  starts_at: null, ends_at: null, targets: [{ target_type: "category", category_id: 2, product_id: null }] });
// priority and extra targets survive a toggle
const cond2 = { ...cond, priority: 5, targets: [...cond.targets, { id: 2, target_type: "product", category_id: null, product_id: 9 }] };
reset({ "GET /api/v1/admin/pricing/conditions/4": cond2, "PUT /api/v1/admin/pricing/conditions/4": cond2 });
await dp.update({ resource: "conditions", id: "4", variables: { enabled: false } });
assert.deepEqual(calls[1].body, { name: "5%", type: "discount_percent", scope: "customer", mode: null, customer_id: 5, value: 5, priority: 5,
  is_active: false, starts_at: null, ends_at: null, targets: cond2.targets.map((x) => ({ target_type: x.target_type, category_id: x.category_id, product_id: x.product_id })) });

// --- settings: nested requisites merged, only touched keys sent
reset({ "GET /api/v1/admin/settings": { shop_requisites: { name: "ТОО", bin: "1", bik: "KZ" }, vat_rate: "12.00" }, "PUT /api/v1/admin/settings": { vat_rate: "16.00" } });
const s = await dp.getOne({ resource: "settings", id: "main" });
assert.equal((s.data as any).vatRate, 12);
await dp.update({ resource: "settings", id: "main", variables: { legalName: "ТОО Т", vatRate: 16, supportEmail: "" } });
assert.deepEqual(calls.at(-1)!.body, { vat_rate: 16, support_email: null, shop_requisites: { name: "ТОО Т", bin: "1", bik: "KZ" } });

// --- the rest: query mapping only
reset({ "GET /api/v1/admin/customers": page([]), "GET /api/v1/admin/customers/wholesale-requests": page([]), "GET /api/v1/admin/audit": page([]),
  "GET /api/v1/admin/catalog/categories": [], "GET /api/v1/admin/delivery/couriers": page([]), "POST /api/v1/admin/customers/5/block": { id: 5, is_active: false } });
await dp.getList({ resource: "customers", filters: [{ operator: "or", value: [{ field: "name", operator: "contains", value: "ер" }, { field: "phone", operator: "contains", value: "ер" }] }, { field: "blocked", operator: "eq", value: true }] });
assert.deepEqual(calls[0].query, { search: "ер", is_active: "false", page: "1", size: "10" });
await dp.getList({ resource: "wholesale_requests", filters: [{ field: "status", operator: "eq", value: "pending" }, { field: "customerId", operator: "eq", value: "5" }] });
await dp.getList({ resource: "audit_log", filters: [{ field: "resource", operator: "eq", value: "order" }, { field: "staffId", operator: "eq", value: 1 }] });
await dp.getList({ resource: "couriers", pagination: { mode: "off" }, filters: [{ field: "active", operator: "eq", value: true }] });
await dp.getList({ resource: "categories", pagination: { mode: "off" } });
assert.equal((await dp.update({ resource: "customers", id: "5", variables: { blocked: true } }) as any).data.blocked, true);

// --- error envelope → HttpError
reset({});
await assert.rejects(dp.getOne({ resource: "orders", id: "999" }), (e: any) => e.statusCode === 404 && e.message === "Не найдено");

console.log("data.check: ok");
