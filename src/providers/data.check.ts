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
  const r = routes[hit] as any;
  if (r?.__status) return new Response(JSON.stringify(r.body), { status: r.__status, headers: { "content-type": "application/json" } });
  return new Response(r == null ? null : JSON.stringify(r), { status: r == null ? 204 : 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { dataProvider: dp, receiptApi } = await import("./data.ts");
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
  packs: [{ id: 10, external_id: null, name: "1 кг", qty_in_base: "1.000", retail_price: "5750.00", wholesale_price: null, wholesale_min_qty: null, visibility: "retail", step: "1.000", min_qty: "1.000", sort_order: 0, is_active: true },
    { id: 11, external_id: null, name: "5 кг", qty_in_base: "5.000", retail_price: null, wholesale_price: "25000.00", wholesale_min_qty: "12.000", visibility: "wholesale", step: "1.000", min_qty: "1.000", sort_order: 1, is_active: true }] };
reset({ "GET /api/v1/admin/catalog/products": { items: [product], total: 1, page: 1, size: 100 }, "GET /api/v1/admin/catalog/products/3": product,
  "PATCH /api/v1/admin/catalog/products/3": product, "PATCH /api/v1/admin/catalog/packs/10": {}, "DELETE /api/v1/admin/catalog/packs/11": null,
  "POST /api/v1/admin/catalog/products/3/packs": {}, "POST /api/v1/admin/catalog/products": product, "POST /api/v1/admin/catalog/products/bulk": { updated: 1 } });
const all = await dp.getList({ resource: "products", pagination: { mode: "off" }, filters: [{ operator: "or", value: [{ field: "name", operator: "contains", value: "сыр" }] }, { field: "hidden", operator: "eq", value: false }] });
assert.deepEqual(calls[0].query, { q: "сыр", is_active: "true", page: "1", size: "100" });
const p = all.data[0] as any;
assert.equal(p.packs[0].wholesaleMinQty, null); assert.equal(p.packs[1].wholesaleMinQty, 12);
assert.equal(p.baseUnit, "кг"); assert.equal(p.packs[0].retailPrice, 5750); assert.equal(p.hidden, false);
reset({ ...routes });
const packV = (id: string | undefined, label: string) => ({ id, label, baseQty: 1, retailPrice: 100, wholesalePrice: null, wholesaleMinQty: null, visibility: "retail", step: 1, minQty: 1 });
await dp.update({ resource: "products", id: "3", variables: { name: "Сыр", hidden: true, baseUnit: "кг", imageUrl: null, packs: [packV("10", "1 кг"), packV(undefined, "2 кг")] } });
assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
  "GET /api/v1/admin/catalog/products/3", "PATCH /api/v1/admin/catalog/products/3", "DELETE /api/v1/admin/catalog/packs/11",
  "PATCH /api/v1/admin/catalog/packs/10", "POST /api/v1/admin/catalog/products/3/packs", "GET /api/v1/admin/catalog/products/3",
]);
assert.deepEqual(calls[1].body, { name: "Сыр", base_unit: "kg", is_active: false });
assert.equal((calls[3].body as any).wholesale_min_qty, null);
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

// --- suppliers & receipts (Приёмка)
const supplier = { id: 5, name: "ИП Касымов", phone: null, bin: "123456789012", comment: null, is_active: true, created_at: "2026-11-14T08:00:00Z" };
const receipt = {
  id: 12, supplier_id: 5, supplier_name: "ИП Касымов", doc_number: "Н-1", doc_date: "2026-11-14", status: "draft", staff_id: 1, comment: null,
  posted_at: null, created_at: "2026-11-14T08:00:00Z", total: "900.00",
  items: [{ id: 71, product_id: 3, product_name: "Сыр", sku: "S1", base_unit: "kg", pack_id: 10, pack_name: "1 кг", pack_qty: "2.000",
    qty_in_base: "1.000", unit_cost: "450.00", base_qty: "2.000", line_total: "900.00" }],
};
reset({ "GET /api/v1/admin/suppliers": page([supplier]), "POST /api/v1/admin/suppliers": supplier, "PATCH /api/v1/admin/suppliers/5": { ...supplier, is_active: false } });
const sl = await dp.getList({ resource: "suppliers", filters: [{ field: "name", operator: "contains", value: "ип" }, { field: "active", operator: "eq", value: true }] });
assert.deepEqual(calls[0].query, { q: "ип", is_active: "true", page: "1", size: "10" });
assert.equal((sl.data[0] as any).phone, "");
await dp.create({ resource: "suppliers", variables: { name: "ИП Касымов", phone: "", bin: "123456789012" } });
assert.deepEqual(calls[1].body, { name: "ИП Касымов", phone: null, bin: "123456789012" });
const deact = await dp.update({ resource: "suppliers", id: "5", variables: { active: false } });
assert.equal(`${calls[2].method} ${calls[2].path}`, "PATCH /api/v1/admin/suppliers/5");
assert.deepEqual(calls[2].body, { is_active: false });
assert.equal((deact.data as any).active, false);

reset({ "GET /api/v1/admin/receipts": page([receipt]), "POST /api/v1/admin/receipts": receipt, "GET /api/v1/admin/receipts/12": receipt,
  "POST /api/v1/admin/receipts/12/items": receipt, "PATCH /api/v1/admin/receipts/12/items/71": receipt, "DELETE /api/v1/admin/receipts/12/items/71": receipt,
  "POST /api/v1/admin/receipts/12/post": { ...receipt, status: "posted" }, "GET /api/v1/admin/receipts/defaults": { pack_id: 10, last_cost: { pack_id: 10, unit_cost: "450.00" } },
  "GET /api/v1/admin/catalog/products/by-barcode/4870001112223": { ...product, barcode: "4870001112223" } });
const rl = await dp.getList({ resource: "receipts", filters: [{ field: "supplierId", operator: "eq", value: "5" }, { field: "status", operator: "eq", value: "draft" },
  { field: "docDate", operator: "gte", value: "2026-11-01" }, { field: "docDate", operator: "lte", value: "2026-11-14" }] });
assert.deepEqual(calls[0].query, { supplier_id: "5", status: "draft", date_from: "2026-11-01", date_to: "2026-11-14", page: "1", size: "10" });
const r0 = rl.data[0] as any;
assert.equal(r0.total, 900); assert.equal(r0.items[0].packQty, 2); assert.equal(r0.items[0].baseQty, 2); assert.equal(r0.items[0].baseUnit, "кг");
await dp.create({ resource: "receipts", variables: { supplierId: "5", docNumber: "", docDate: "2026-11-14" } });
assert.deepEqual(calls[1].body, { supplier_id: 5, doc_number: null, doc_date: "2026-11-14" });
reset({ ...routes });
await receiptApi.addItem("12", { productId: "3", packId: "10", packQty: 1, unitCost: 450 });
assert.deepEqual(calls[0].body, { product_id: 3, pack_id: 10, pack_qty: "1", unit_cost: "450" });
const upd = await receiptApi.updateItem("12", "71", { packQty: 2 });
assert.deepEqual(calls[1].body, { pack_qty: "2" });
assert.equal(upd.items[0].lineTotal, 900);
await receiptApi.addItem("12", { productId: "3", packId: "10", packQty: 1 }); // unpriced line
assert.deepEqual(calls.at(-1)!.body, { product_id: 3, pack_id: 10, pack_qty: "1" });
calls.pop();
await receiptApi.updateItem("12", "71", { packId: "11", unitCost: 5000 }); // pack change carries the new pack's price
assert.deepEqual(calls.at(-1)!.body, { pack_id: 11, unit_cost: "5000" });
calls.pop(); // keep the path assertions below aligned
await receiptApi.removeItem("12", "71");
const posted = await receiptApi.post("12");
await receiptApi.get("12");
assert.deepEqual(calls.slice(2).map((c) => `${c.method} ${c.path}`), [
  "DELETE /api/v1/admin/receipts/12/items/71", "POST /api/v1/admin/receipts/12/post", "GET /api/v1/admin/receipts/12",
]);
assert.equal(posted.status, "posted");
reset({ ...routes });
const d = await receiptApi.defaults("3", "5");
assert.deepEqual(calls[0].query, { product_id: "3", supplier_id: "5" });
assert.equal(d.packId, "10"); assert.equal(d.lastCost?.unitCost, 450);
const bp = await receiptApi.byBarcode("4870001112223");
assert.equal(`${calls[1].method} ${calls[1].path}`, "GET /api/v1/admin/catalog/products/by-barcode/4870001112223");
assert.equal(bp.packs[0].id, "10");
reset({ "GET /api/v1/admin/stock/movements": page([{ id: 1, product_id: 3, delta: "2.000", reason: "receipt", balance_after: "7", order_id: null, staff_id: 1,
  comment: "Приёмка #12", receipt_id: 12, created_at: "2026-11-14T09:00:00Z" }]) });
const mv = (await dp.getList({ resource: "stock_movements" })).data[0] as any;
assert.equal(mv.receiptId, "12"); assert.equal(mv.reason, "Поставка");
// error codes survive into HttpError
reset({ "POST /api/v1/admin/receipts/12/post": { __status: 409, body: { error: { code: "receipt_posted", message: "Накладная уже проведена", details: {} } } } });
await assert.rejects(receiptApi.post("12"), (e: any) => e.code === "receipt_posted" && e.statusCode === 409);
reset({ "POST /api/v1/admin/receipts/12/post": { __status: 400, body: { error: { code: "pack_inactive", message: "Фасовка неактивна", details: { pack_id: 10, item_id: 71 } } } } });
await assert.rejects(receiptApi.post("12"), (e: any) => e.code === "pack_inactive" && e.errors.item_id === 71);

// header edit (PATCH /receipts/{id}); blank number → null; unpriced lines map to null money
reset({ "PATCH /api/v1/admin/receipts/12": { ...receipt, supplier_id: 6 }, "GET /api/v1/admin/receipts/12": { ...receipt,
  items: [{ ...receipt.items[0], unit_cost: null, line_total: null }] } });
await dp.update({ resource: "receipts", id: "12", variables: { supplierId: "6", docNumber: " ", docDate: "2026-11-15", comment: "Пересорт" } });
assert.equal(`${calls[0].method} ${calls[0].path}`, "PATCH /api/v1/admin/receipts/12");
assert.deepEqual(calls[0].body, { supplier_id: 6, doc_number: null, doc_date: "2026-11-15", comment: "Пересорт" });
const unpriced = await receiptApi.get("12");
assert.equal(unpriced.items[0].unitCost, null); assert.equal(unpriced.items[0].lineTotal, null);

// --- error envelope → HttpError
reset({});
await assert.rejects(dp.getOne({ resource: "orders", id: "999" }), (e: any) => e.statusCode === 404 && e.message === "Не найдено");

console.log("data.check: ok");
