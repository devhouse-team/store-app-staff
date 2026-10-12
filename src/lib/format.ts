// Shared labels and formatters. Labels mirror mobile DESIGN.md §S10 so staff and
// customers see the same words.
import dayjs from "dayjs";
import type {
  ConditionScope,
  ConditionType,
  CustomerMode,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  WholesaleStatus,
} from "../types";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export const tenge = (v: number | null | undefined, approx = false) =>
  v == null ? "—" : `${approx ? "≈\u00a0" : ""}${money.format(v)}\u00a0₸`;
export const qty = (v: number, unit: string) => `${new Intl.NumberFormat("ru-RU").format(v)} ${unit}`;
export const dateTime = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YYYY HH:mm") : "—");
export const date = (iso: string | null | undefined) => (iso ? dayjs(iso).format("DD.MM.YYYY") : "—");

type Tag = { label: string; color: string };

export const ORDER_STATUS: Record<OrderStatus, Tag> = {
  new: { label: "Новый", color: "blue" },
  preorder: { label: "Предзаказ", color: "gold" },
  confirmed: { label: "Подтверждён", color: "cyan" },
  assembling: { label: "Собирается", color: "purple" },
  in_delivery: { label: "Передан в доставку", color: "geekblue" },
  ready_for_pickup: { label: "Готов к выдаче", color: "lime" },
  completed: { label: "Выполнен", color: "green" },
  cancelled: { label: "Отменён", color: "red" },
};

/** Allowed manual transitions (A2). Backend enforces the same graph. */
export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "preorder", "cancelled"],
  preorder: ["confirmed", "cancelled"],
  confirmed: ["assembling", "cancelled"],
  assembling: ["in_delivery", "ready_for_pickup", "cancelled"],
  in_delivery: ["completed", "cancelled"],
  ready_for_pickup: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const PAYMENT_STATUS: Record<PaymentStatus, Tag> = {
  pending: { label: "Ожидает оплаты", color: "orange" },
  confirmed: { label: "Оплачен", color: "green" },
  refunded: { label: "Возврат", color: "default" },
};

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  cash: "Наличные",
  transfer: "Перевод (Kaspi / карта)",
  online: "Онлайн",
};

export const MODE: Record<CustomerMode, Tag> = {
  retail: { label: "Розница", color: "green" },
  wholesale: { label: "Опт", color: "volcano" },
};

export const WHOLESALE_STATUS: Record<WholesaleStatus, Tag> = {
  pending: { label: "На рассмотрении", color: "blue" },
  documents_requested: { label: "Нужны документы", color: "orange" },
  approved: { label: "Одобрена", color: "green" },
  rejected: { label: "Отклонена", color: "red" },
};

export const CONDITION_TYPE: Record<ConditionType, string> = {
  discount: "Скидка, %",
  free_delivery_from: "Бесплатная доставка от суммы",
  preorder_allowed: "Предзаказ разрешён",
  min_order_amount: "Минимальная сумма заказа",
  min_order_volume: "Минимальный объём заказа",
  custom_delivery_price: "Своя стоимость доставки",
};

export const CONDITION_SCOPE: Record<ConditionScope, string> = {
  global: "Общее",
  mode: "Режим",
  customer: "Клиент",
};

export const options = <K extends string>(map: Record<K, Tag | string>) =>
  (Object.keys(map) as K[]).map((value) => {
    const v = map[value];
    return { value, label: typeof v === "string" ? v : v.label };
  });
