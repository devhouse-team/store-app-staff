// Staff-side view types. providers/data.ts maps the backend contract (backend/openapi.json,
// /api/v1/admin/*) onto these: ids become strings, decimal strings become numbers.
// Enum values are the backend codes except ConditionType (mapped in providers/data.ts).

export type CustomerMode = "retail" | "wholesale";
export type PackVisibility = "retail" | "wholesale" | "both";
export type OrderStatus =
  | "new"
  | "preorder"
  | "confirmed"
  | "assembling"
  | "in_delivery"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";
export type PaymentMethod = "cash" | "transfer" | "online";
export type PaymentStatus = "pending" | "confirmed" | "refunded";
export type Fulfilment = "delivery" | "pickup";
export type WholesaleStatus = "pending" | "documents_requested" | "approved" | "rejected";
export type ConditionType =
  | "discount"
  | "free_delivery_from"
  | "preorder_allowed"
  | "min_order_amount"
  | "min_order_volume"
  | "custom_delivery_price";
export type ConditionScope = "global" | "mode" | "customer";

export interface Category {
  id: string;
  name: string;
  parentId: string | null; // up to 3 levels
}

export type Unit = "шт" | "кг" | "л";

export interface Pack {
  id: string;
  label: string; // '10 кг'
  baseQty: number; // amount of base unit in one pack
  retailPrice: number | null;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null; // retail qty from which wholesalePrice applies; null = wholesale accounts only
  visibility: PackVisibility;
  step: number;
  minQty: number;
}

export interface Product {
  id: string;
  sku: string; // артикул
  barcode: string;
  name: string;
  brand: string | null;
  categoryId: string;
  imageUrl: string | null;
  imageKeys: string[]; // storage keys of uploaded photos (for DELETE)
  description: string | null;
  baseUnit: Unit;
  isWeighed: boolean;
  weightStep: number | null;
  isPerishable: boolean;
  shelfLifeDays: number | null;
  preorderAllowed: boolean;
  hidden: boolean;
  packs: Pack[];
}

export interface Stock {
  id: string; // = productId
  productId: string;
  productName: string;
  unit: string;
  quantity: number; // in base units
  reserved: number;
  lowThreshold: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  delta: number;
  reason: string; // label + comment, e.g. 'Корректировка: пересорт'
  orderId: string | null;
  staffId: string | null;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  mode: CustomerMode;
  wholesaleStatus: WholesaleStatus | null;
  orgName: string | null;
  bin: string | null;
  ordersCount: number;
  isNew: boolean;
  blocked: boolean;
  createdAt: string;
}

export interface WholesaleDocument {
  id: string;
  name: string;
  sizeBytes: number;
  url: string; // signed URL in prod
}

export interface WholesaleRequest {
  id: string;
  customerId: string;
  orgName: string;
  bin: string; // 12 digits
  address: string;
  contactPerson: string;
  phone: string;
  documents: WholesaleDocument[];
  status: WholesaleStatus;
  commentToCustomer: string | null;
  internalNote: string | null;
  submittedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  packId: string;
  name: string;
  packLabel: string;
  unit: string;
  qty: number;
  actualQty: number | null; // after weighing
  unitPrice: number;
  lineTotal: number;
  approximate: boolean; // weighed
  preorder: boolean;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  isNewCustomer?: boolean; // only known as a list filter (new_customer)
  mode: CustomerMode;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  approximate: boolean;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfilment: Fulfilment;
  address: string | null;
  slot: string | null;
  courierId: string | null;
  paymentId: string | null;
  expectedDate: string | null; // preorder
  cancelReason: string | null;
  comment: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
}

export interface Condition {
  id: string;
  name: string;
  type: ConditionType;
  value: number | null; // percent, tenge, or volume depending on type
  target: "all" | "category" | "product"; // for discount
  targetId: string | null;
  scope: ConditionScope;
  scopeMode: CustomerMode | null;
  scopeCustomerId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  enabled: boolean;
  priority?: number; // backend-only, carried through edits
  targets?: unknown[]; // full backend target list, carried through edits
}

export interface DeliveryZone {
  id: string;
  name: string;
  localities: string[];
  fee: number;
  freeFrom: number | null;
  minOrder: number | null;
  active: boolean;
}

export interface DeliverySlot {
  id: string;
  weekday: number; // 0 = Mon … 6 = Sun (Python weekday())
  from: string; // '14:00'
  to: string;
  limit: number | null;
  active: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  orderId: string;
  total: number;
  vat: number;
  vatRate: number;
  createdAt: string | null;
  url: string | null; // signed PDF link, only on detail / generate responses
}

export interface AuditEntry {
  id: string;
  staff: string;
  staffId: string | null;
  resource: string; // backend entity: order, product, pack, …
  recordId: string;
  action: string; // create, update, delete, status_change, …
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  fileName: string | null;
  dryRun: boolean;
  status: "pending" | "running" | "completed" | "failed";
  rows: number;
  okRows: number;
  errorRows: number;
  summary: Record<string, unknown>;
  createdAt: string;
  errors: { row: number | null; level: string; message: string }[]; // detail only
}

/** Singleton shop settings (GET/PUT /admin/settings), id = 'main'. */
export interface Settings {
  id: "main";
  legalName: string | null;
  bin: string | null;
  legalAddress: string | null;
  bank: string | null;
  iban: string | null;
  bik: string | null;
  kbe: string | null;
  vatRate: number | null; // percent
  transferRecipient: string | null;
  kaspiPhone: string | null;
  card: string | null;
  pickupAddress: string | null;
  pickupHours: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  supportTelegram: string | null;
}
