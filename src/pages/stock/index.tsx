import { List, useTable } from "@refinedev/antd";
import { useCreate, useGetIdentity, useList, useUpdate } from "@refinedev/core";
import { CheckCircleOutlined, CloseCircleOutlined, EditOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Checkbox, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import type { Stock, StockMovement } from "../../types";
import { dateTime, qty } from "../../lib/format";

const REASONS = ["Поставка", "Пересорт", "Бой/порча", "Инвентаризация", "Другое"];
const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

const available = (s: Stock) => s.quantity - s.reserved;
const status = (s: Stock) =>
  available(s) <= 0
    ? { label: "Нет в наличии", color: "error", icon: <CloseCircleOutlined /> }
    : available(s) <= s.lowThreshold
      ? { label: "Мало", color: "warning", icon: <WarningOutlined /> }
      : { label: "В наличии", color: "success", icon: <CheckCircleOutlined /> };

type AdjustValues = { mode: "delta" | "set"; value: number; reason: string; comment?: string };

const AdjustModal = ({ record, onClose }: { record: Stock; onClose: () => void }) => {
  const [form] = Form.useForm<AdjustValues>();
  const { data: me } = useGetIdentity<{ name: string }>();
  const { mutateAsync: update, mutation } = useUpdate<Stock>();
  const { mutateAsync: create } = useCreate<StockMovement>();
  const mode = Form.useWatch("mode", form);
  const value = Form.useWatch("value", form);
  const reason = Form.useWatch("reason", form);
  const next = value == null ? record.quantity : mode === "set" ? value : record.quantity + value;
  const step = record.unit === "кг" ? 0.1 : 1;

  const save = async (v: AdjustValues) => {
    const round = (n: number) => Math.round(n * 1000) / 1000; // kg are fractional; avoid 0.1 + 0.2 drift
    const quantity = round(v.mode === "set" ? v.value : record.quantity + v.value);
    const delta = round(quantity - record.quantity);
    if (!delta) return onClose();
    await update({ resource: "stock", id: record.id, values: { quantity }, successNotification: { type: "success", message: "Остаток обновлён" } });
    await create({
      resource: "stock_movements",
      values: {
        productId: record.productId,
        productName: record.productName,
        delta,
        reason: v.comment?.trim() ? `${v.reason}: ${v.comment.trim()}` : v.reason,
        staff: me?.name ?? "—",
        createdAt: new Date().toISOString(),
      },
      successNotification: false,
    });
    onClose();
  };

  return (
    <Modal
      open
      title={`Корректировка: ${record.productName}`}
      okText="Сохранить"
      cancelText="Отмена"
      onCancel={onClose}
      onOk={() => form.submit()}
      okButtonProps={{ loading: mutation.isPending }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ mode: "delta" }} onFinish={save}>
        <Typography.Paragraph style={num}>
          Сейчас: {qty(record.quantity, record.unit)} · в резерве: {qty(record.reserved, record.unit)}
        </Typography.Paragraph>
        <Form.Item label="Способ" name="mode">
          <Radio.Group
            optionType="button"
            options={[
              { value: "delta", label: "Изменить на (+/−)" },
              { value: "set", label: "Установить остаток" },
            ]}
          />
        </Form.Item>
        <Form.Item
          label={mode === "set" ? `Новый остаток, ${record.unit}` : `Изменение, ${record.unit}`}
          name="value"
          extra={value != null ? `Будет: ${qty(next, record.unit)}` : undefined}
          rules={[
            { required: true, message: "Укажите количество" },
            {
              validator: async (_, v?: number) => {
                if (v == null) return;
                const q = form.getFieldValue("mode") === "set" ? v : record.quantity + v;
                if (q < 0) throw new Error("Остаток не может быть меньше 0");
              },
            },
          ]}
          dependencies={["mode"]}
        >
          <InputNumber step={step} style={{ width: "100%" }} placeholder={mode === "set" ? "0" : "+10 или −2"} />
        </Form.Item>
        <Form.Item label="Причина" name="reason" rules={[{ required: true, message: "Выберите причину" }]}>
          <Select options={REASONS.map((r) => ({ value: r, label: r }))} />
        </Form.Item>
        <Form.Item
          label="Комментарий"
          name="comment"
          dependencies={["reason"]}
          rules={[{ required: reason === "Другое", whitespace: true, message: "Опишите причину" }]}
        >
          <Input maxLength={200} placeholder="Номер накладной, детали" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const ThresholdCell = ({ record }: { record: Stock }) => {
  const { mutate } = useUpdate<Stock>();
  const save = (v: number | null) => {
    if (v == null || v < 0 || v === record.lowThreshold) return;
    mutate({ resource: "stock", id: record.id, values: { lowThreshold: v }, successNotification: { type: "success", message: "Порог сохранён" } });
  };
  return (
    <InputNumber
      key={record.lowThreshold}
      aria-label={`Порог «мало» для ${record.productName}`}
      size="small"
      min={0}
      defaultValue={record.lowThreshold}
      style={{ width: 80 }}
      onBlur={(e) => save(e.target.value === "" ? null : Number(e.target.value.replace(",", ".")))}
      onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
    />
  );
};

const StockTable = () => {
  // ponytail: "low" compares two fields per row, so filtering is client-side; backend should expose `?low=true`.
  const { result, query } = useList<Stock>({ resource: "stock", pagination: { mode: "off" }, sorters: [{ field: "productName", order: "asc" }] });
  const [q, setQ] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjust, setAdjust] = useState<Stock | null>(null);
  const rows = useMemo(
    () =>
      result.data.filter(
        (s) => s.productName.toLowerCase().includes(q.trim().toLowerCase()) && (!lowOnly || available(s) <= s.lowThreshold),
      ),
    [result.data, q, lowOnly],
  );
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          aria-label="Поиск по товару"
          placeholder="Поиск по товару"
          allowClear
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260, maxWidth: "100%" }}
        />
        <Checkbox checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)}>
          Только «мало» и «нет в наличии»
        </Checkbox>
      </Space>
      <Table
        dataSource={rows}
        loading={query.isLoading}
        rowKey="id"
        size="small"
        scroll={{ x: true }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: lowOnly ? "Всё в наличии" : "Нет данных" }}
        columns={[
          { title: "Товар", dataIndex: "productName", sorter: (a, b) => a.productName.localeCompare(b.productName) },
          { title: "Остаток", dataIndex: "quantity", align: "right", sorter: (a, b) => a.quantity - b.quantity, render: (v, s) => <span style={num}>{qty(v, s.unit)}</span> },
          { title: "Резерв", dataIndex: "reserved", align: "right", render: (v, s) => <span style={num}>{qty(v, s.unit)}</span> },
          { title: "Доступно", key: "available", align: "right", sorter: (a, b) => available(a) - available(b), render: (_, s) => <span style={num}>{qty(available(s), s.unit)}</span> },
          { title: "Порог «мало»", dataIndex: "lowThreshold", render: (_, s) => <ThresholdCell record={s} /> },
          {
            title: "Статус",
            key: "status",
            render: (_, s) => {
              const st = status(s);
              return <Tag color={st.color} icon={st.icon}>{st.label}</Tag>;
            },
          },
          {
            title: "",
            key: "actions",
            fixed: "right",
            render: (_, s) => (
              <Tooltip title="Корректировка остатка">
                <Button size="small" icon={<EditOutlined />} aria-label={`Корректировка: ${s.productName}`} onClick={() => setAdjust(s)} />
              </Tooltip>
            ),
          },
        ]}
      />
      {adjust && <AdjustModal key={adjust.id} record={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
};

const MovementsTable = () => {
  const { result: stock } = useList<Stock>({ resource: "stock", pagination: { mode: "off" } });
  const { tableProps, setFilters } = useTable<StockMovement>({
    resource: "stock_movements",
    syncWithLocation: false,
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
  });
  return (
    <>
      <Select
        aria-label="Фильтр по товару"
        placeholder="Все товары"
        allowClear
        showSearch
        optionFilterProp="label"
        options={stock.data.map((s) => ({ value: s.productId, label: s.productName }))}
        onChange={(v) => setFilters([{ field: "productId", operator: "eq", value: v }], "replace")}
        style={{ width: 260, maxWidth: "100%", marginBottom: 12 }}
      />
      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        scroll={{ x: true }}
        locale={{ emptyText: "Движений нет" }}
        columns={[
          { title: "Дата", dataIndex: "createdAt", render: dateTime, sorter: true },
          { title: "Товар", dataIndex: "productName" },
          {
            title: "Изменение",
            dataIndex: "delta",
            align: "right",
            render: (d: number) => (
              <Typography.Text type={d < 0 ? "danger" : "success"} style={num}>
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
              </Typography.Text>
            ),
          },
          { title: "Причина", dataIndex: "reason" },
          { title: "Сотрудник", dataIndex: "staff" },
        ]}
      />
    </>
  );
};

export const StockList = () => (
  <List>
    <Tabs
      destroyOnHidden
      items={[
        { key: "stock", label: "Остатки", children: <StockTable /> },
        { key: "movements", label: "Журнал движений", children: <MovementsTable /> },
      ]}
    />
  </List>
);
