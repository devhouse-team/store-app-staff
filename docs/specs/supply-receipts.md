# Spec: «Приёмка» screens (staff-interface)

Status: draft 2026-11-14. Backend is on staging (contract in
`backend/backend/openapi.json`, business rules in `backend/docs/specs/supply-receipts.md`). This file is the contract for
`staff-interface` (Refine 5 + Ant Design 5 + PWA). Server computes all totals; UI never sums money.

Naming: «Накладные» is already the menu item for customer invoices. Use **«Приёмка»** for
supplier receipts and **«Поставщики»** for suppliers. Both go in the «Каталог» group after «Остатки».
Visible with `stock.read`; edit actions need `stock.write`.

## API (all under `/api/v1/admin`)

| Call | Use |
|---|---|
| `GET /suppliers?q=&is_active=&page=&size=` → `Page<Supplier>` | list, picker search |
| `POST /suppliers` `{name, phone?, bin?, comment?}` → 201 `Supplier` | create (also inline) |
| `PATCH /suppliers/{id}` partial | edit, deactivate (`is_active:false`) |
| `POST /receipts` `{supplier_id, doc_number?, doc_date?, comment?}` → 201 `Receipt` | new draft |
| `GET /receipts?supplier_id=&status=draft\|posted&date_from=&date_to=` → `Page<Receipt>` | list |
| `GET /receipts/{id}` → `Receipt` | open |
| `POST /receipts/{id}/items` `{product_id, pack_id, pack_qty, unit_cost}` → `Receipt` | add line |
| `PATCH /receipts/{id}/items/{item_id}` `{pack_id?, pack_qty?, unit_cost?}` → `Receipt` | edit line |
| `DELETE /receipts/{id}/items/{item_id}` → `Receipt` | remove line |
| `POST /receipts/{id}/post` → `Receipt` | «Провести» |
| `GET /receipts/defaults?product_id=&supplier_id=` → `{pack_id, last_cost: {pack_id, unit_cost} \| null}` | line prefill |
| `GET /catalog/products/by-barcode/{code}` → `ProductAdmin` (with `packs`) or 404 | scan lookup |
| `GET /stock/movements` now has `receipt_id` | link from journal |

Every line mutation returns the whole `Receipt` → replace local state with it (no client merging).
`Receipt`: `id, supplier_id, supplier_name, doc_number, doc_date, status, staff_id, comment,
posted_at, created_at, total, items[]`. `Item`: `id, product_id, product_name, sku, base_unit,
pack_id, pack_name, pack_qty, qty_in_base, unit_cost (per pack), base_qty, line_total`.
Decimals arrive as strings: show with `lib/format.ts`, send as strings.

Errors (`{code, message, details}`; show `message`, it is Russian):
`receipt_posted` 409 → reload receipt, switch to read-only; `receipt_empty` 400;
`supplier_inactive` 400; `product_inactive` / `pack_inactive` / `pack_mismatch` 400 (on post they
carry `details.item_id` → highlight that row); `product_not_found` 404 on by-barcode → «новый товар» flow;
422 → field errors on the line.

## Screens

### 1. «Поставщики» (`/suppliers`)
Table: name, phone, БИН, active. Search box → `q`. Drawer form create/edit
(БИН: 12 digits, validate client-side too). Deactivate instead of delete (no delete endpoint).

### 2. «Приёмка» list (`/receipts`)
Table: №, date (`doc_date`), supplier, doc number, positions count, total, status tag
(черновик / проведена). Filters: supplier, status, date range. Button «Новая приёмка».
Drafts first is nice-to-have; server orders by id desc.

### 3. Receipt screen (`/receipts/:id`) — mobile first, this is the main work surface
Header: supplier (select with search + «+ Новый поставщик» opening the supplier form inline,
new supplier is selected immediately), doc number, date (default today). On «Новая приёмка» create
the draft as soon as a supplier is chosen, so nothing is lost if the phone locks.

Body: list of lines (cards on phone, table on desktop): name, SKU, pack select, quantity stepper,
price per pack, line total, delete. Below each card: «= {base_qty} {base_unit}».

Add a product:
1. **Scan** button (big, sticky at bottom on phone) → camera scanner (see below), or
2. **Search** field: existing product search (name / SKU / barcode); Enter with a barcode from a
   Bluetooth/USB scanner works here too (they type + Enter).
3. Product found:
   - already in the receipt with the same pack → `PATCH` its `pack_qty + 1` (do not add a line);
   - else `GET /receipts/defaults?product_id&supplier_id` → pack = `pack_id` ?? first active pack;
     price = `last_cost.unit_cost` if `last_cost.pack_id` == chosen pack, else empty and focused;
     `POST items` with `pack_qty: 1`. If price is empty, add after the user enters it.
4. **Price change hint**: when `last_cost` exists for the chosen pack and the entered price differs,
   show under the field «было 450 ₸ → 460 ₸ (+10)» (orange up, green down). Keep `last_cost` per line
   in component state, it is not in `Item`.
5. Pack change on a line → `PATCH pack_id`; refetch defaults for the price hint.
6. Inputs save on blur / stepper change (debounce ~400 ms); show a small saving indicator per line.

Footer (sticky): «{n} позиций · {total} ₸» from server `total`, button **«Провести»** →
confirm modal «Провести приёмку на {total} ₸? Остатки увеличатся, изменить её будет нельзя.»
→ `POST /post` → read-only view + success toast. Disabled when no lines.

Posted receipt: everything read-only, show `posted_at`, staff. No edit/cancel (fix via stock adjustment).

### 4. Barcode not found
Modal «Новый товар» with barcode prefilled (read-only): name*, unit (`base_unit`, default шт),
pack name (default «шт») + `qty_in_base` (default 1), retail price. Create via existing product
create + pack create calls (same as products form), then add as a line (step 3).
Needs `catalog.write`; without it show «Товар не найден. Попросите администратора добавить его»
with the code shown and copyable.

### 5. Scanner component (`components/BarcodeScanner.tsx`)
- Full-screen overlay with live camera (`getUserMedia({video:{facingMode:"environment"}})`), frame
  guide, torch toggle if supported, close button. Continuous mode: after a hit vibrate
  (`navigator.vibrate(50)`) + beep, show the product name for ~1 s, keep scanning. Ignore the same code
  within 1.5 s (prevents double count).
- Decoder: `BarcodeDetector` (formats ean_13, ean_8, upc_a, upc_e, code_128) when present
  (Chrome Android). Otherwise (iPhone Safari) lazy-load `zxing-wasm` via dynamic `import()` so it
  is not in the main bundle. One new dependency only.
- Camera needs HTTPS (prod is https; dev localhost is fine). Permission denied → message with
  fallback to the search field.

### 6. Small touches elsewhere
- «Остатки» → movements journal: reason «receipt» with `receipt_id` → link «Приёмка #id».
- `src/providers/data.ts`: resources `suppliers`, `receipts`; run `npx tsx src/providers/data.check.ts`.
- Remember last used supplier in `localStorage` (per device) as the default for a new receipt.

## Acceptance
- On a phone: create receipt, scan 3 products (one twice → qty 2), change one pack, enter prices,
  post → stock increases by base quantities, receipt read-only.
- Barcode unknown → create product → it is in the receipt.
- Price hint appears when the price differs from the last posted one from that supplier.
- Interrupted draft (close tab) reopens from the list with all lines.
- Works on Chrome Android and iPhone Safari (camera) and with a hardware scanner (search field).

## Out of scope
Supplier debts/payments, cancelling posted receipts, margin reports, per-pack barcodes, printing.

## Round 3 (2026-11-17): backend changes + 4 fixes

Backend on staging now (commit `d3d3b47`; re-copy `backend/backend/openapi.json`, it is the contract):
- `POST /receipts/{id}/items` accepts a line **without** `unit_cost`. `Item.unit_cost` and
  `Item.line_total` are `string | null`; `Receipt.total` sums priced lines only.
- `POST /receipts/{id}/post` with an unpriced line → 400 `item_no_price` «Укажите цену»,
  `details.item_id` → highlight and focus that line's price.
- `PATCH /receipts/{id}` `{supplier_id?, doc_number?, doc_date?, comment?}` (draft only) →
  `Receipt`. Errors: 409 `receipt_posted`, 400 `supplier_inactive`.
- Inactive products can be received (`product_inactive` no longer exists).

### Fix 1 — remove client-only draft lines (double line after app is hidden)
Cause: priced `DraftLine` is sent by `commitDraft`, but it stays in `draftsRef` until the response,
so `sendNow` on `visibilitychange`/`pagehide` (`useReceipt.ts:201`) sends it a second time.
Do not patch this with flags. Delete the `DraftLine` mechanism entirely (`drafts`, `draftsRef`,
`setDraft`, `discardDraft`, `commitDraft`, the draft branch in `addProduct` and in `sendNow`, the
«Укажите цену: N» counter based on drafts and the `drafts.length > 0` disable on «Провести»):
- every scan/search/new product → `POST items` immediately, `unit_cost` = last cost for the chosen
  pack or omitted;
- a line with `unit_cost === null` shows an empty, highlighted price field («Укажите цену»);
  the footer counts such lines from `receipt.items`;
- price entry is a normal line edit (`PATCH unit_cost`, debounced, flushed on hide).
After this, `sendNow` only sends pending PATCHes (idempotent: absolute values), never a POST.

### Fix 2 — first tap on «Провести» lost
Cause: `disabled={… || busy}` (`Show.tsx:425`). The tap blurs the input → save starts → button
disables before `click`. Remove `busy` from `disabled`; `confirmPost` already awaits `settle()`.
Keep disabled only for `!n` (no lines). Unpriced lines are reported by the server (`item_no_price`)
— optionally also pre-check `receipt.items.some(i => i.unitCost == null)` and focus the first one.

### Fix 3 — two barcodes in the frame double-count
Cause: dedupe remembers only the last code (`BarcodeScanner.tsx:46`); A,B,A,B passes every time.
Keep `Map<code, lastSeenAt>`; ignore a code seen within `SAME_CODE_MS`, refresh its time on every
sighting. Optional: if one frame decodes several codes, take only the first.

### Fix 4 — hardware scanner types into the focused price field
Add a page-level `keydown` listener (capture phase) on the receipt screen: a burst of ≥ 6
printable chars with < 35 ms between keys ending with Enter is a scan. When a burst is detected,
`preventDefault` the keys, restore the focused input's previous value, and handle the code like a
camera scan. Normal typing (slower) is untouched. Keep the search field's Enter flow working.

### Header edit (new)
Receipt header (supplier, number, date, comment) is editable while draft via `PATCH /receipts/{id}`,
saved on blur/change. With this, the draft may again be created right after the supplier is
chosen (spec §3); keep «Начать приёмку» only if it is clearly better on the phone — say which.

### New product from receiving
Create it **hidden** (`is_active: false`) — it goes to the storefront when someone fills photo and
category and activates it. Show a note in the modal: «Товар будет скрыт с витрины, пока его не включат
в каталоге».

### Acceptance for this round
- Scan → line exists on the server at once (reload the page: it is there, price empty).
- Enter price, immediately hide the app / lock the phone → exactly one line, correct price.
- Edit a quantity and tap «Провести» right away → confirm modal opens on the first tap.
- Two different barcodes in the frame for 3 s → each counted once.
- Hardware scanner (or simulated fast keystrokes + Enter) while the price field is focused →
  product added, price field unchanged.
- Post with an unpriced line → that line highlighted with «Укажите цену».
- Number/date typo fixed after the receipt was created.
