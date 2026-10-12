// Staff-side domain types. Enum values are the backend codes (TASKS.md B6–B17,
// mobile/app/lib/shared/domain/enums.dart). Keep in step with the OpenAPI contract (B2).
// Money = integer tenge. Quantities = number (kg can be fractional).

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

export interface Pack {
  id: string;
  label: string; // '10 кг'
  unit: "шт" | "кг" | "л";
  baseQty: number; // amount of base unit in one pack
  retailPrice: number | null;
  wholesalePrice: number | null;
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
  description: string | null;
  isWeighed: boolean;
  weightStep: number | null;
  isPerishable: boolean;
  shelfLife: string | null;
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
  productName: string;
  delta: number;
  reason: string; // 'Корректировка: пересорт', 'Заказ №1042'
  staff: string;
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
  settlement: string;
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
  number: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  isNewCustomer: boolean;
  mode: CustomerMode;
  status: OrderStatus;
  createdAt: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  approximate: boolean;
  totalBeforeWeighing: number | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfilment: Fulfilment;
  address: string | null;
  slot: string | null;
  courierId: string | null;
  expectedDate: string | null; // preorder
  cancelReason: string | null;
  comment: string | null;
  invoiceId: string | null;
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
}

export interface DeliveryZone {
  id: string;
  settlement: string;
  fee: number;
  freeFrom: number | null;
  minOrderRetail: number;
  minOrderWholesale: number;
  active: boolean;
}

export interface DeliverySlot {
  id: string;
  days: number[]; // 1 = Mon … 7 = Sun
  from: string; // '14:00'
  to: string;
  limit: number;
  active: boolean;
}

export interface Invoice {
  id: string;
  number: string; // 'Н-000123'
  orderId: string;
  orderNumber: number;
  customerName: string;
  bin: string | null;
  total: number;
  vat: number;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  staff: string;
  resource: string;
  recordId: string;
  action: "create" | "update" | "delete";
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  fileName: string;
  dryRun: boolean;
  status: "ok" | "errors" | "applied";
  rows: number;
  created: number;
  updated: number;
  errors: { row: number; field: string; message: string }[];
  staff: string;
  createdAt: string;
}

/** Singleton settings record, id = 'main'. */
export interface Settings {
  id: "main";
  legalName: string;
  bin: string;
  legalAddress: string;
  bank: string;
  iban: string;
  vatRate: number; // percent
  transferRecipient: string;
  kaspiPhone: string;
  card: string;
  onlinePaymentEnabled: boolean;
  pickupAddress: string;
  pickupHours: string;
  supportPhone: string;
  supportWhatsapp: string;
  telegramGroup: string;
}
