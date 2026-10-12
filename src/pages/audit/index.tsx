import { List, useTable } from "@refinedev/antd";
import { useResourceParams } from "@refinedev/core";
import { DatePicker, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { useState } from "react";
import { MODE, ORDER_STATUS, PAYMENT_STATUS, WHOLESALE_STATUS, dateTime } from "../../lib/format";
import type { AuditEntry } from "../../types";

const EXTRA_LABELS: Record<string, string> = { delivery_slots: "Слоты доставки", stock_movements: "Движения остатков", delivery_zones: "Зоны доставки" };
const ACTION = { create: { label: "Создание", color: "green" }, update: { label: "Изменение", color: "blue" }, delete: { label: "Удаление", color: "red" } } as const;

// Human labels for the fields staff change most; anything else shows its key.
const FIELD: Record<string, string> = {
  status: "Статус", paymentStatus: "Оплата", courierId: "Курьер", items: "Состав", total: "Сумма", subtotal: "Товары",
  totalBeforeWeighing: "До взвешивания", expectedDate: "Ожидаемая дата", cancelReason: "Причина отмены", invoiceId: "Накладная",
  approximate: "Приблизительно", retailPrice: "Розничная цена", wholesalePrice: "Оптовая цена", packs: "Фасовки", name: "Название",
  hidden: "Скрыт", categoryId: "Категория", quantity: "Остаток", lowThreshold: "Порог «мало»", enabled: "Включено", value: "Значение",
  blocked: "Блокировка", mode: "Режим", wholesaleStatus: "Опт-доступ", commentToCustomer: "Комментарий клиенту",
  internalNote: "Внутренняя заметка", active: "Активно", fee: "Стоимость", freeFrom: "Бесплатно от", vatRate: "НДС, %",
};
const ENUMS: Record<string, Record<string, { label: string }>> = {
  status: { ...ORDER_STATUS, ...WHOLESALE_STATUS }, paymentStatus: PAYMENT_STATUS, mode: MODE, wholesaleStatus: WHOLESALE_STATUS,
};
const value = (k: string, v: unknown) =>
  typeof v === "boolean" ? (v ? "да" : "нет") : v == null || v === "" ? "—" : ENUMS[k]?.[String(v)]?.label ?? v;

const short = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s === undefined ? "—" : s.length > 40 ? `${s.slice(0, 40)}…` : s;
};
const changes = (r: AuditEntry) => {
  if (r.action !== "update") return r.action === "create" ? "Создана запись" : "Запись удалена";
  const before = (r.before ?? {}) as Record<string, unknown>;
  const after = (r.after ?? {}) as Record<string, unknown>;
  return Object.keys(after).map((k) => (
    <div key={k}>
      <Typography.Text type="secondary">{FIELD[k] ?? k}:</Typography.Text> {short(value(k, before[k]))} → {short(value(k, after[k]))}
    </div>
  ));
};
const json = (v: unknown) => <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(v, null, 2)}</pre>;

export const AuditList = () => {
  const { resources } = useResourceParams();
  const label = (name: string) => EXTRA_LABELS[name] ?? (resources.find((r) => r.name === name)?.meta?.label as string | undefined) ?? name;
  const resourceOptions = [...new Set([...resources.filter((r) => r.list || r.meta?.hide).map((r) => r.name), ...Object.keys(EXTRA_LABELS)])]
    .filter((n) => !["dashboard", "audit_log", "sales", "catalog", "clients", "logistics"].includes(n))
    .map((value) => ({ value, label: label(value) }));

  const [resource, setResource] = useState<string>();
  const [staff, setStaff] = useState("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);

  const { tableProps } = useTable<AuditEntry>({
    syncWithLocation: false,
    sorters: { permanent: [{ field: "createdAt", order: "desc" }] },
    filters: {
      permanent: [
        { field: "resource", operator: "eq", value: resource },
        { field: "staff", operator: "contains", value: staff.trim() },
        { field: "createdAt", operator: "gte", value: range?.[0].startOf("day").toISOString() },
        { field: "createdAt", operator: "lte", value: range?.[1].endOf("day").toISOString() },
      ],
    },
  });

  return (
    <List>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select allowClear placeholder="Раздел" aria-label="Раздел" style={{ minWidth: 200 }} options={resourceOptions} value={resource} onChange={setResource} />
        <Input.Search allowClear placeholder="Сотрудник" aria-label="Сотрудник" style={{ width: 200 }} onSearch={setStaff} />
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
        <Table.Column<AuditEntry> dataIndex="resource" title="Раздел" render={label} />
        <Table.Column<AuditEntry> dataIndex="recordId" title="Запись" />
        <Table.Column<AuditEntry> dataIndex="action" title="Действие" render={(a: AuditEntry["action"]) => <Tag color={ACTION[a].color}>{ACTION[a].label}</Tag>} />
        <Table.Column<AuditEntry> title="Изменения" render={(_, r) => changes(r)} />
      </Table>
    </List>
  );
};
