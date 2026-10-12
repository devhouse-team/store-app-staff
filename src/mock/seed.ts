// MOCK DATA — replaced by the FastAPI backend (B2). Not real prices, stock or people.
// Product/category ids match mobile/app/lib/shared/data/mock_data.dart.
import type {
  AuditEntry,
  Category,
  Condition,
  Courier,
  Customer,
  DeliverySlot,
  DeliveryZone,
  ImportJob,
  Invoice,
  Order,
  OrderItem,
  OrderStatus,
  Pack,
  Product,
  Settings,
  Stock,
  StockMovement,
  WholesaleRequest,
} from "../types";

const day = 86_400_000;
// Relative to load time so the demo dashboard is never empty.
const NOW = Date.now();
const ago = (days: number, hours = 0) => new Date(NOW - days * day - hours * 3_600_000).toISOString();

export const categories: Category[] = [
  { id: "c-food", name: "Продукты", parentId: null },
  { id: "c-veg", name: "Овощи и фрукты", parentId: "c-food" },
  { id: "c-dairy", name: "Молочные продукты", parentId: "c-food" },
  { id: "c-bread", name: "Хлеб и выпечка", parentId: "c-food" },
  { id: "c-meat", name: "Мясо и птица", parentId: "c-food" },
  { id: "c-pantry", name: "Бакалея", parentId: "c-food" },
  { id: "c-flour", name: "Мука и крупы", parentId: "c-pantry" },
  { id: "c-sugar", name: "Сахар и соль", parentId: "c-pantry" },
  { id: "c-drinks", name: "Напитки", parentId: "c-food" },
  { id: "c-house", name: "Хозтовары", parentId: null },
  { id: "c-chem", name: "Бытовая химия", parentId: "c-house" },
  { id: "c-paper", name: "Бумажная продукция", parentId: "c-house" },
];

const wh = (retail: number) => Math.round((retail * 0.88) / 10) * 10;
const pack = (id: string, label: string, retail: number | null, p: Partial<Pack> = {}): Pack => ({
  id,
  label,
  unit: "шт",
  baseQty: 1,
  retailPrice: retail,
  wholesalePrice: retail === null ? null : wh(retail),
  visibility: "both",
  step: 1,
  minQty: 1,
  ...p,
});

let skuN = 1000;
const product = (
  id: string,
  name: string,
  categoryId: string,
  packs: Pack[],
  p: Partial<Product> = {},
): Product => ({
  id,
  sku: `A-${++skuN}`,
  barcode: `4870${String(skuN).padStart(9, "0")}`,
  name,
  brand: null,
  categoryId,
  imageUrl: null,
  description: null,
  isWeighed: false,
  weightStep: null,
  isPerishable: false,
  shelfLife: null,
  preorderAllowed: false,
  hidden: false,
  packs,
  ...p,
});
const kg = (id: string, retail: number): Pack =>
  pack(id, "1 кг", retail, { unit: "кг", step: 0.5, minQty: 0.5 });
const weighed: Partial<Product> = { isWeighed: true, weightStep: 0.5 };

export const products: Product[] = [
  product("p-tomato", "Помидоры", "c-veg", [kg("p-tomato-kg", 890)], weighed),
  product("p-potato", "Картофель", "c-veg", [kg("p-potato-kg", 250)], weighed),
  product("p-carrot", "Морковь", "c-veg", [kg("p-carrot-kg", 220)], weighed),
  product("p-apple", "Яблоки Апорт", "c-veg", [kg("p-apple-kg", 690)], weighed),
  product("p-milk", "Молоко 3,2%", "c-dairy", [pack("p-milk-1l", "1 л", 520, { unit: "л" })], {
    brand: "Food Master", isPerishable: true, shelfLife: "7 суток",
  }),
  product("p-kefir", "Кефир 2,5%", "c-dairy", [pack("p-kefir-1l", "1 л", 480, { unit: "л" })], {
    brand: "Food Master", isPerishable: true, shelfLife: "10 суток",
  }),
  product("p-tvorog", "Творог 9%", "c-dairy", [pack("p-tvorog-350", "350 г", 650)], {
    isPerishable: true, shelfLife: "5 суток",
  }),
  product("p-cheese", "Сыр Российский", "c-dairy", [kg("p-cheese-kg", 3800)], { ...weighed, isPerishable: true, shelfLife: "30 суток" }),
  product("p-eggs", "Яйца С1", "c-dairy", [pack("p-eggs-10", "10 шт", 1100)]),
  product("p-bread", "Хлеб пшеничный", "c-bread", [pack("p-bread-1", "1 шт", 150)], { isPerishable: true, shelfLife: "3 суток" }),
  product("p-beef", "Говядина (лопатка)", "c-meat", [kg("p-beef-kg", 3200)], { ...weighed, isPerishable: true, shelfLife: "3 суток" }),
  product("p-chicken", "Курица охлаждённая", "c-meat", [kg("p-chicken-kg", 1650)], { ...weighed, isPerishable: true, shelfLife: "5 суток" }),
  product("p-flour", "Мука пшеничная в/с", "c-flour", [
    pack("p-flour-2", "2 кг", 540, { unit: "шт", baseQty: 2, wholesalePrice: null, visibility: "retail" }),
    pack("p-flour-10", "10 кг", 2500, { baseQty: 10 }),
    pack("p-flour-50", "50 кг", null, { baseQty: 50, wholesalePrice: 11500, visibility: "wholesale" }),
  ], { brand: "Цесна" }),
  product("p-rice", "Рис круглый", "c-flour", [pack("p-rice-1", "1 кг", 750)]),
  product("p-buckwheat", "Гречка", "c-flour", [pack("p-buckwheat-1", "1 кг", 690)], { preorderAllowed: true }),
  product("p-pasta", "Макароны рожки", "c-flour", [pack("p-pasta-400", "400 г", 290)], { brand: "Corona" }),
  product("p-sugar", "Сахар", "c-sugar", [
    pack("p-sugar-1", "1 кг", 480),
    pack("p-sugar-50", "50 кг", null, { baseQty: 50, wholesalePrice: 19000, visibility: "wholesale" }),
  ]),
  product("p-salt", "Соль поваренная", "c-sugar", [pack("p-salt-1", "1 кг", 120)]),
  product("p-oil", "Масло подсолнечное", "c-pantry", [pack("p-oil-1l", "1 л", 1100, { unit: "л" })], { brand: "Шедевр" }),
  product("p-tea", "Чай чёрный", "c-pantry", [pack("p-tea-100", "100 пак.", 1250)], { brand: "Пиала" }),
  product("p-water", "Вода питьевая", "c-drinks", [pack("p-water-5l", "5 л", 450)], { brand: "Тассай" }),
  product("p-cola", "Кола", "c-drinks", [pack("p-cola-15", "1,5 л", 690)]),
  product("p-juice", "Сок яблочный", "c-drinks", [pack("p-juice-1l", "1 л", 780)], { preorderAllowed: true }),
  product("p-fairy", "Fairy для посуды", "c-chem", [pack("p-fairy-450", "450 мл", 1450)], { brand: "Fairy" }),
  product("p-powder", "Стиральный порошок", "c-chem", [pack("p-powder-3", "3 кг", 3290)], { brand: "Tide" }),
  product("p-soap", "Мыло хозяйственное", "c-chem", [pack("p-soap-200", "200 г", 290)]),
  product("p-toilet", "Туалетная бумага", "c-paper", [pack("p-toilet-12", "12 рул.", 1890)], { brand: "Zewa" }),
  product("p-napkins", "Салфетки", "c-paper", [pack("p-napkins-100", "100 шт", 390)]),
  product("p-old", "Печенье (снято)", "c-pantry", [pack("p-old-300", "300 г", 450)], { hidden: true }),
];

const stockQty: Record<string, number> = { "p-eggs": 3, "p-buckwheat": 0, "p-juice": 0, "p-cola": 4, "p-old": 0 };
export const stock: Stock[] = products.map((p) => ({
  id: p.id,
  productId: p.id,
  productName: p.name,
  unit: p.isWeighed ? "кг" : "шт",
  quantity: stockQty[p.id] ?? 20 + ((p.id.length * 7) % 60),
  reserved: p.id === "p-milk" ? 4 : 0,
  lowThreshold: 5,
}));

export const stockMovements: StockMovement[] = [
  { id: "sm-1", productId: "p-eggs", productName: "Яйца С1", delta: -12, reason: "Заказ №1043", staff: "Система", createdAt: ago(1) },
  { id: "sm-2", productId: "p-flour", productName: "Мука пшеничная в/с", delta: 40, reason: "Поставка", staff: "Айдана", createdAt: ago(2) },
  { id: "sm-3", productId: "p-cola", productName: "Кола", delta: -2, reason: "Корректировка: бой", staff: "Айдана", createdAt: ago(3) },
];

export const customers: Customer[] = [
  { id: "u-1", name: "Айгерим", phone: "+7 701 234 56 78", email: "demo@tolyq.kz", mode: "retail", wholesaleStatus: null, orgName: null, bin: null, settlement: "Есик", ordersCount: 6, isNew: false, blocked: false, createdAt: ago(40) },
  { id: "u-2", name: "Ержан Сапаров", phone: "+7 702 111 22 33", email: "erzhan@mail.kz", mode: "wholesale", wholesaleStatus: "approved", orgName: "ИП «Сапаров»", bin: "900101300123", settlement: "Түрген", ordersCount: 12, isNew: false, blocked: false, createdAt: ago(60) },
  { id: "u-3", name: "Динара", phone: "+7 705 555 44 33", email: null, mode: "retail", wholesaleStatus: null, orgName: null, bin: null, settlement: "Байтерек", ordersCount: 1, isNew: true, blocked: false, createdAt: ago(1) },
  { id: "u-4", name: "Кафе «Алтын»", phone: "+7 707 987 65 43", email: "altyn.cafe@mail.kz", mode: "wholesale", wholesaleStatus: "pending", orgName: "ТОО «Алтын Дастархан»", bin: "180540012345", settlement: "Есик", ordersCount: 0, isNew: true, blocked: false, createdAt: ago(0, 5) },
  { id: "u-5", name: "Магазин «Береке»", phone: "+7 708 222 33 44", email: null, mode: "wholesale", wholesaleStatus: "documents_requested", orgName: "ИП «Береке»", bin: "850312400567", settlement: "Талгар", ordersCount: 0, isNew: true, blocked: false, createdAt: ago(3) },
  { id: "u-6", name: "Нурлан", phone: "+7 747 000 11 22", email: null, mode: "retail", wholesaleStatus: "rejected", orgName: "ИП «Нурлан»", bin: "920815300999", settlement: "Есик", ordersCount: 3, isNew: false, blocked: true, createdAt: ago(20) },
];

const doc = (id: string, name: string, kb: number) => ({ id, name, sizeBytes: kb * 1024, url: "#mock-signed-url" });
export const wholesaleRequests: WholesaleRequest[] = [
  { id: "w-1", customerId: "u-4", orgName: "ТОО «Алтын Дастархан»", bin: "180540012345", address: "г. Есик, ул. Токтарова, 8", contactPerson: "Асель Нурланова", phone: "+7 707 987 65 43", documents: [doc("d-1", "Справка о регистрации.pdf", 420), doc("d-2", "Удостоверение директора.jpg", 1300)], status: "pending", commentToCustomer: null, internalNote: null, submittedAt: ago(0, 5) },
  { id: "w-2", customerId: "u-5", orgName: "ИП «Береке»", bin: "850312400567", address: "г. Талгар, ул. Ленина, 41", contactPerson: "Бауыржан", phone: "+7 708 222 33 44", documents: [doc("d-3", "Талон ИП.pdf", 210)], status: "documents_requested", commentToCustomer: "Загрузите свидетельство о регистрации ИП", internalNote: null, submittedAt: ago(3) },
  { id: "w-3", customerId: "u-2", orgName: "ИП «Сапаров»", bin: "900101300123", address: "с. Түрген, ул. Мира, 2", contactPerson: "Ержан Сапаров", phone: "+7 702 111 22 33", documents: [doc("d-4", "Свидетельство ИП.pdf", 380)], status: "approved", commentToCustomer: null, internalNote: "Проверено на месте", submittedAt: ago(58) },
  { id: "w-4", customerId: "u-6", orgName: "ИП «Нурлан»", bin: "920815300999", address: "г. Есик, ул. Абая, 99", contactPerson: "Нурлан", phone: "+7 747 000 11 22", documents: [], status: "rejected", commentToCustomer: "Документы не соответствуют организации", internalNote: null, submittedAt: ago(19) },
];

export const couriers: Courier[] = [
  { id: "k-1", name: "Серик", phone: "+7 700 100 20 30", active: true },
  { id: "k-2", name: "Арман", phone: "+7 700 400 50 60", active: true },
  { id: "k-3", name: "Талгат", phone: "+7 700 700 80 90", active: false },
];

let itemN = 0;
const item = (productId: string, packId: string, qty: number, unitPrice: number, p: Partial<OrderItem> = {}): OrderItem => {
  const prod = products.find((x) => x.id === productId)!;
  const pk = prod.packs.find((x) => x.id === packId)!;
  return {
    id: `oi-${++itemN}`, productId, packId, name: prod.name, packLabel: pk.label, unit: pk.unit,
    qty, actualQty: null, unitPrice, lineTotal: Math.round(qty * unitPrice), approximate: prod.isWeighed, preorder: false, ...p,
  };
};
const order = (
  n: number, customerId: string, status: OrderStatus, createdAt: string, items: OrderItem[], p: Partial<Order> = {},
): Order => {
  const c = customers.find((x) => x.id === customerId)!;
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const discount = p.discount ?? 0;
  const deliveryFee = p.deliveryFee ?? (p.fulfilment === "pickup" ? 0 : c.mode === "wholesale" || subtotal >= 15000 ? 0 : 800);
  return {
    id: `o-${n}`, number: n, customerId, customerName: c.name, customerPhone: c.phone, isNewCustomer: c.isNew,
    mode: c.mode, status, createdAt, items, subtotal, discount, deliveryFee, total: subtotal - discount + deliveryFee,
    approximate: items.some((i) => i.approximate && i.actualQty === null), totalBeforeWeighing: null,
    paymentMethod: "cash", paymentStatus: "pending", fulfilment: "delivery",
    address: `${c.settlement}, ул. Жамбыла, 5`, slot: "Сегодня 14:00–16:00", courierId: null,
    expectedDate: null, cancelReason: null, comment: null, invoiceId: null, ...p,
  };
};

export const orders: Order[] = [
  order(1048, "u-3", "new", ago(0, 1), [item("p-milk", "p-milk-1l", 2, 520), item("p-bread", "p-bread-1", 1, 150), item("p-tomato", "p-tomato-kg", 1.5, 890)], { paymentMethod: "transfer", comment: "Позвонить перед приездом" }),
  order(1047, "u-1", "new", ago(0, 2), [item("p-pasta", "p-pasta-400", 6, 290), item("p-oil", "p-oil-1l", 1, 1100)], { fulfilment: "pickup", address: null, slot: null }),
  order(1046, "u-2", "preorder", ago(0, 20), [item("p-buckwheat", "p-buckwheat-1", 20, 610, { preorder: true })], { discount: 610, expectedDate: new Date(NOW + 4 * day).toISOString().slice(0, 10) }),
  order(1045, "u-2", "confirmed", ago(1), [item("p-flour", "p-flour-10", 5, 2200), item("p-sugar", "p-sugar-50", 1, 19000), item("p-oil", "p-oil-1l", 12, 970)], { discount: 2080, slot: "Завтра 10:00–12:00" }),
  order(1044, "u-1", "assembling", ago(1, 3), [item("p-beef", "p-beef-kg", 1.5, 3200), item("p-tomato", "p-tomato-kg", 1, 890), item("p-potato", "p-potato-kg", 2, 250)], { paymentMethod: "transfer", paymentStatus: "confirmed" }),
  order(1043, "u-2", "in_delivery", ago(2), [item("p-flour", "p-flour-50", 2, 11500), item("p-eggs", "p-eggs-10", 12, 970)], { discount: 1732, courierId: "k-1", invoiceId: "inv-1" }),
  order(1042, "u-1", "ready_for_pickup", ago(2, 5), [item("p-tea", "p-tea-100", 2, 1250), item("p-cheese", "p-cheese-kg", 0.5, 3800, { actualQty: 0.54, lineTotal: 2052 })], { fulfilment: "pickup", address: null, slot: null }),
  order(1041, "u-1", "completed", ago(5), [item("p-beef", "p-beef-kg", 1.5, 3200, { actualQty: 1.62, lineTotal: 5184 }), item("p-milk", "p-milk-1l", 2, 520)], { totalBeforeWeighing: 6640, paymentStatus: "confirmed", courierId: "k-2" }),
  order(1040, "u-6", "cancelled", ago(7), [item("p-cola", "p-cola-15", 4, 690)], { cancelReason: "Клиент не вышел на связь" }),
];

export const conditions: Condition[] = [
  { id: "cd-1", name: "Бесплатная доставка от 15 000 ₸", type: "free_delivery_from", value: 15000, target: "all", targetId: null, scope: "mode", scopeMode: "retail", scopeCustomerId: null, startsAt: null, endsAt: null, enabled: true },
  { id: "cd-2", name: "Минимальный оптовый заказ", type: "min_order_amount", value: 50000, target: "all", targetId: null, scope: "mode", scopeMode: "wholesale", scopeCustomerId: null, startsAt: null, endsAt: null, enabled: true },
  { id: "cd-3", name: "Скидка 5% для ИП «Сапаров»", type: "discount", value: 5, target: "all", targetId: null, scope: "customer", scopeMode: null, scopeCustomerId: "u-2", startsAt: ago(30), endsAt: null, enabled: true },
  { id: "cd-4", name: "Предзаказ для ИП «Сапаров»", type: "preorder_allowed", value: null, target: "all", targetId: null, scope: "customer", scopeMode: null, scopeCustomerId: "u-2", startsAt: null, endsAt: null, enabled: true },
  { id: "cd-5", name: "−10% на молочные (осень)", type: "discount", value: 10, target: "category", targetId: "c-dairy", scope: "global", scopeMode: null, scopeCustomerId: null, startsAt: "2026-10-01T00:00:00+05:00", endsAt: "2026-10-31T23:59:59+05:00", enabled: false },
];

export const deliveryZones: DeliveryZone[] = [
  { id: "z-1", settlement: "Есик", fee: 800, freeFrom: 15000, minOrderRetail: 2000, minOrderWholesale: 50000, active: true },
  { id: "z-2", settlement: "Түрген", fee: 1200, freeFrom: 20000, minOrderRetail: 3000, minOrderWholesale: 50000, active: true },
  { id: "z-3", settlement: "Байтерек", fee: 1000, freeFrom: 15000, minOrderRetail: 3000, minOrderWholesale: 50000, active: true },
  { id: "z-4", settlement: "Талгар", fee: 1500, freeFrom: 25000, minOrderRetail: 5000, minOrderWholesale: 70000, active: true },
];

export const deliverySlots: DeliverySlot[] = [
  { id: "s-1", days: [1, 2, 3, 4, 5, 6, 7], from: "10:00", to: "12:00", limit: 10, active: true },
  { id: "s-2", days: [1, 2, 3, 4, 5, 6, 7], from: "14:00", to: "16:00", limit: 10, active: true },
  { id: "s-3", days: [1, 2, 3, 4, 5], from: "18:00", to: "20:00", limit: 8, active: true },
];

export const invoices: Invoice[] = [
  { id: "inv-1", number: "Н-000001", orderId: "o-1043", orderNumber: 1043, customerName: "ИП «Сапаров»", bin: "900101300123", total: 34908, vat: 3740, createdAt: ago(2) },
];

export const auditLog: AuditEntry[] = [
  { id: "a-1", staff: "Айдана", resource: "orders", recordId: "o-1043", action: "update", before: { status: "assembling" }, after: { status: "in_delivery" }, createdAt: ago(2) },
  { id: "a-2", staff: "Айдана", resource: "products", recordId: "p-cola", action: "update", before: { retailPrice: 790 }, after: { retailPrice: 690 }, createdAt: ago(4) },
];

export const imports: ImportJob[] = [
  { id: "im-1", fileName: "catalog_top200.xlsx", dryRun: false, status: "applied", rows: 200, created: 180, updated: 20, errors: [], staff: "Айдана", createdAt: ago(6) },
  { id: "im-2", fileName: "prices_oct.xlsx", dryRun: true, status: "errors", rows: 50, created: 0, updated: 47, errors: [{ row: 12, field: "Оптовая цена", message: "Не число" }, { row: 30, field: "Штрихкод", message: "Дубликат 4870000001005" }, { row: 44, field: "Категория", message: "Не найдена «Сладости»" }], staff: "Айдана", createdAt: ago(1) },
];

export const settings: Settings[] = [
  {
    id: "main", legalName: "ИП «Аскар»", bin: "880101300000", legalAddress: "г. Есик, ул. Абая, 12", bank: "АО «Kaspi Bank»",
    iban: "KZ00 722S 0000 0000 0000", vatRate: 12, transferRecipient: "ИП Аскар", kaspiPhone: "+7 700 000 00 00",
    card: "4400 •••• •••• 0000", onlinePaymentEnabled: false, pickupAddress: "г. Есик, ул. Абая, 12",
    pickupHours: "Ежедневно 08:00–22:00", supportPhone: "+7 700 000 00 00", supportWhatsapp: "+7 700 000 00 00", telegramGroup: "@askar_orders",
  },
];

export const seed = {
  categories, products, stock, stock_movements: stockMovements, customers, wholesale_requests: wholesaleRequests,
  couriers, orders, conditions, delivery_zones: deliveryZones, delivery_slots: deliverySlots, invoices,
  audit_log: auditLog, imports, settings,
};
export type ResourceName = keyof typeof seed;
