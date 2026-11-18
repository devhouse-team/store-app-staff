import { useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { List, useSelect, useTable } from "@refinedev/antd";
import { useCreate, useNavigation, type CrudFilter, type HttpError } from "@refinedev/core";
import { App, Button, DatePicker, Form, Grid, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { RECEIPT_STATUS, date, options, tenge } from "../../lib/format";
import { useCan } from "../../providers/auth";
import type { Receipt, Supplier } from "../../types";
import { SupplierSelect } from "../suppliers";

const LAST_SUPPLIER = "tolyq-staff-last-supplier";
type Opt = { value: string; label: string };
const readLast = (): Opt | null => {
  try {
    const s = JSON.parse(localStorage.getItem(LAST_SUPPLIER) ?? "null");
    return s?.id ? { value: s.id, label: s.name } : null;
  } catch {
    return null;
  }
};
const saveLast = (o: Opt) => {
  try {
    localStorage.setItem(LAST_SUPPLIER, JSON.stringify({ id: o.value, name: o.label }));
  } catch {
    /* private mode */
  }
};

type NewValues = { supplierId: string; docNumber?: string; docDate: Dayjs };

/**
 * Header of a new receipt. The header can be edited later, but the draft is created only on «Начать приёмку»:
 * a draft can't be deleted (no DELETE /receipts/{id}), so creating it on a mis-tapped supplier would orphan it.
 */
const NewReceiptModal = ({ onClose }: { onClose: () => void }) => {
  const [form] = Form.useForm<NewValues>();
  const { message } = App.useApp();
  const { show } = useNavigation();
  const { mutateAsync: create, mutation } = useCreate<Receipt>();
  const [last] = useState(readLast);

  const submit = async (v: NewValues) => {
    try {
      const { data } = await create({
        resource: "receipts",
        values: { supplierId: v.supplierId, docNumber: v.docNumber, docDate: v.docDate },
        successNotification: false,
        errorNotification: false,
      });
      saveLast({ value: data.supplierId, label: data.supplierName });
      show("receipts", data.id);
    } catch (e) {
      const err = e as HttpError;
      if (err.code === "supplier_inactive" || err.code === "supplier_not_found") form.setFields([{ name: "supplierId", errors: [err.message] }]);
      else message.error(err.message);
    }
  };

  return (
    <Modal
      open
      title="Новая приёмка"
      okText="Начать приёмку"
      cancelText="Отмена"
      onCancel={onClose}
      onOk={() => form.submit()}
      okButtonProps={{ loading: mutation.isPending }}
      destroyOnHidden
    >
      <Form form={form} name="newReceipt" layout="vertical" initialValues={{ supplierId: last?.value, docDate: dayjs() }} onFinish={submit}>
        <Form.Item label="Поставщик" name="supplierId" rules={[{ required: true, message: "Выберите поставщика" }]}>
          <SupplierSelect known={last ? [last] : []} />
        </Form.Item>
        <Form.Item label="№ накладной" name="docNumber" rules={[{ max: 64 }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label="Дата" name="docDate" rules={[{ required: true, message: "Укажите дату" }]}>
          <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} inputReadOnly />
        </Form.Item>
      </Form>
    </Modal>
  );
};

type FilterValues = { supplierId?: string; status?: string; range?: [Dayjs, Dayjs] | null };
const toFilters = (v: FilterValues): CrudFilter[] => [
  { field: "supplierId", operator: "eq", value: v.supplierId },
  { field: "status", operator: "eq", value: v.status },
  { field: "docDate", operator: "gte", value: v.range?.[0]?.format("YYYY-MM-DD") },
  { field: "docDate", operator: "lte", value: v.range?.[1]?.format("YYYY-MM-DD") },
];

export const ReceiptList = () => {
  const { tableProps, searchFormProps } = useTable<Receipt, never, FilterValues>({ resource: "receipts", syncWithLocation: false, onSearch: toFilters });
  const { selectProps } = useSelect<Supplier>({ resource: "suppliers", optionLabel: "name", searchField: "name" });
  const { show } = useNavigation();
  const wide = !!Grid.useBreakpoint().md;
  const canWrite = useCan("stock.write");
  const [creating, setCreating] = useState(false);

  return (
    <List
      headerButtons={
        canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            Новая приёмка
          </Button>
        )
      }
    >
      <Form {...searchFormProps} name="receiptFilters" layout="inline" onValuesChange={() => searchFormProps.form?.submit()} style={{ rowGap: 8, marginBottom: 12 }}>
        <Form.Item name="supplierId">
          <Select {...selectProps} allowClear placeholder="Поставщик" style={{ minWidth: 200 }} />
        </Form.Item>
        <Form.Item name="status">
          <Select allowClear placeholder="Статус" options={options(RECEIPT_STATUS)} style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="range">
          <DatePicker.RangePicker format="DD.MM.YYYY" placeholder={["С", "По"]} inputReadOnly />
        </Form.Item>
      </Form>

      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        scroll={wide ? { x: true } : undefined}
        onRow={(r) => ({ onClick: () => show("receipts", r.id), style: { cursor: "pointer" } })}
      >
        {!wide && (
          <Table.Column<Receipt>
            key="mobile"
            title="Приёмки"
            render={(_, r) => (
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Space size={6} wrap style={{ justifyContent: "space-between", width: "100%" }}>
                  <Typography.Text strong>#{r.id} · {r.supplierName}</Typography.Text>
                  <span className="num" style={{ fontWeight: 600 }}>{tenge(r.total)}</span>
                </Space>
                <Space size={6}>
                  <Tag color={RECEIPT_STATUS[r.status].color}>{RECEIPT_STATUS[r.status].label}</Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {date(r.docDate)}
                    {r.docNumber && ` · № ${r.docNumber}`}
                  </Typography.Text>
                </Space>
              </Space>
            )}
          />
        )}
        {wide && (
          <>
            <Table.Column<Receipt> dataIndex="id" title="№" render={(v) => `#${v}`} />
            <Table.Column<Receipt> dataIndex="docDate" title="Дата" render={date} />
            <Table.Column<Receipt> dataIndex="supplierName" title="Поставщик" />
            <Table.Column<Receipt> dataIndex="docNumber" title="№ накладной" render={(v) => v || "—"} />
            <Table.Column<Receipt> key="count" title="Позиций" align="right" render={(_, r) => r.items.length} />
            <Table.Column<Receipt> dataIndex="total" title="Сумма" align="right" render={(v) => tenge(v)} />
            <Table.Column<Receipt>
              dataIndex="status"
              title="Статус"
              render={(v: Receipt["status"]) => <Tag color={RECEIPT_STATUS[v].color}>{RECEIPT_STATUS[v].label}</Tag>}
            />
          </>
        )}
      </Table>
      {creating && <NewReceiptModal onClose={() => setCreating(false)} />}
    </List>
  );
};
