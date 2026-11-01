import { List, useTable } from "@refinedev/antd";
import { DatePicker, Select, Space, Table, Tag, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { MODE, ORDER_STATUS, PAYMENT_STATUS, WHOLESALE_STATUS, dateTime } from "../../lib/format";
import type { AuditEntry } from "../../types";

// Backend audit entities (log_action calls in backend/src/modules/*).
export const ENTITY: Record<string, string> = {
  order: "Заказы", payment: "Оплата", invoice: "Накладные", product: "Товары", pack: "Фасовки", stock: "Остатки",
  customer: "Клиенты", wholesale_request: "Заявки на опт", condition: "Условия", settings: "Настройки",
  staff: "Сотрудники", staff_api_token: "API-токены",
};
export const ACTION: Record<string, { label: string; color: string }> = {
  create: { label: "Создание", color: "green" },
  update: { label: "Изменение", color: "blue" },
  delete: { label: "Удаление", color: "red" },
  status_change: { label: "Смена статуса", color: "blue" },
  items_edit: { label: "Правка состава", color: "purple" },
  expected_date: { label: "Дата предзаказа", color: "gold" },
  courier_assign: { label: "Курьер", color: "geekblue" },
  price_change: { label: "Цена", color: "orange" },
  threshold: { label: "Порог", color: "default" },
  block: { label: "Блокировка", color: "red" },
  unblock: { label: "Разблокировка", color: "green" },
  generate: { label: "Формирование", color: "green" },
  regenerate: { label: "Переформирование", color: "cyan" },
  confirm: { label: "Подтверждение", color: "green" },
  refund: { label: "Возврат", color: "default" },
};
export const actionTag = (a: string) => <Tag color={ACTION[a]?.color ?? "default"}>{ACTION[a]?.label ?? a}</Tag>;

// Human labels for the fields staff change most; anything else shows its key.
const FIELD: Record<string, string> = {
  status: "Статус", payment_status: "Оплата", courier_id: "Курьер", items: "Состав", total: "Сумма", subtotal: "Товары",
  expected_date: "Ожидаемая дата", reason: "Причина", retail_price: "Розничная цена", wholesale_price: "Оптовая цена",
  name: "Название", is_active: "Активно", category_id: "Категория", low_threshold: "Порог «мало»", value: "Значение",
  mode: "Режим", admin_comment: "Комментарий клиенту", internal_note: "Внутренняя заметка", fee: "Стоимость", vat_rate: "НДС, %",
};
const ENUMS: Record<string, Record<string, { label: string }>> = {
  status: { ...ORDER_STATUS, ...WHOLESALE_STATUS }, payment_status: PAYMENT_STATUS, mode: MODE,
};
const value = (k: string, v: unknown) =>
  typeof v === "boolean" ? (v ? "да" : "нет") : v == null || v === "" ? "—" : ENUMS[k]?.[String(v)]?.label ?? v;

const short = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === undefined ? "—" : s.length > 40 ? `${s.slice(0, 40)}…` : s;
};
const changes = (r: AuditEntry) => {
  const before = (r.before ?? {}) as Record<string, unknown>;
  const after = (r.after ?? {}) as Record<string, unknown>;
  if (!r.after) return r.action === "delete" ? "Запись удалена" : "—";
  if (!r.before) return "Создана запись";
  return Object.keys(after).map((k) => (
    <div key={k}>
      <Typography.Text type="secondary">{FIELD[k] ?? k}:</Typography.Text> {short(value(k, before[k]))} → {short(value(k, after[k]))}
    </div>
  ));
};
const json = (v: unknown) => <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(v, null, 2)}</pre>;

export const AuditList = () => {
  const [resource, setResource] = useState<string>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const { tableProps } = useTable<AuditEntry>({
    syncWithLocation: false,
    filters: {
      permanent: [
        { field: "resource", operator: "eq", value: resource },
        { field: "createdAt", operator: "gte", value: range?.[0].startOf("day").toISOString() },
        { field: "createdAt", operator: "lte", value: range?.[1].endOf("day").toISOString() },
      ],
    },
  });

  return (
    <List>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select allowClear placeholder="Раздел" aria-label="Раздел" style={{ minWidth: 200 }} value={resource} onChange={setResource}
          options={Object.entries(ENTITY).map(([value, label]) => ({ value, label }))} />
        <DatePicker.RangePicker format="DD.MM.YYYY" placeholder={["С", "По"]} aria-label="Период" value={range} onChange={(v) => setRange(v?.[0] && v[1] ? [v[0], v[1]] : null)} />
      </Space>
      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        scroll={{ x: true }}
        expandable={{
          expandedRowRender: (r) => (
            <Space align="start" wrap style={{ width: "100%" }}>
              <div><Typography.Text strong>Было</Typography.Text>{json(r.before)}</div>
              <div><Typography.Text strong>Стало</Typography.Text>{json(r.after)}</div>
            </Space>
          ),
        }}
      >
        <Table.Column<AuditEntry> dataIndex="createdAt" title="Дата" render={dateTime} />
        <Table.Column<AuditEntry> dataIndex="staff" title="Сотрудник" />
        <Table.Column<AuditEntry> dataIndex="resource" title="Раздел" render={(e: string) => ENTITY[e] ?? e} />
        <Table.Column<AuditEntry> dataIndex="recordId" title="Запись" />
        <Table.Column<AuditEntry> dataIndex="action" title="Действие" render={actionTag} />
        <Table.Column<AuditEntry> title="Изменения" render={(_, r) => changes(r)} />
      </Table>
    </List>
  );
};
