import { useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";
import { List, ShowButton, useTable } from "@refinedev/antd";
import { useNotification, useNavigation, type CrudFilter } from "@refinedev/core";
import { Button, Checkbox, DatePicker, Form, Grid, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { Dayjs } from "dayjs";
import { useLocation } from "react-router";
import { MODE, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, dateTime, options, tenge } from "../../lib/format";
import { download } from "../../providers/api";
import type { Order } from "../../types";

type FilterValues = {
  status?: string;
  range?: [Dayjs, Dayjs] | null;
  mode?: string;
  newOnly?: boolean;
  paymentStatus?: string;
};

// The API filters by one status and has no text search over customers.
const toFilters = (v: FilterValues): CrudFilter[] => [
  { field: "status", operator: "eq", value: v.status },
  { field: "createdAt", operator: "gte", value: v.range?.[0]?.format("YYYY-MM-DD") },
  { field: "createdAt", operator: "lte", value: v.range?.[1]?.format("YYYY-MM-DD") },
  { field: "mode", operator: "eq", value: v.mode },
  { field: "paymentStatus", operator: "eq", value: v.paymentStatus },
  { field: "isNewCustomer", operator: "eq", value: v.newOnly || undefined },
];

const FULFILMENT = { delivery: "Доставка", pickup: "Самовывоз" } as const;

// Remount on ?status= change so the header counter link applies its filter even when /orders is already open.
export const OrderList = () => <OrderTable key={useLocation().search} />;

const OrderTable = () => {
  // ?status=new deep link from the header attention counters.
  const initialStatus = new URLSearchParams(useLocation().search).get("status");
  const { tableProps, filters, searchFormProps } = useTable<Order, never, FilterValues>({
    syncWithLocation: false,
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    filters: { initial: initialStatus ? [{ field: "status", operator: "eq", value: initialStatus }] : [] },
    onSearch: toFilters,
  });
  const { show } = useNavigation();
  const wide = !!Grid.useBreakpoint().md;
  const [showFilters, setShowFilters] = useState(false);
  const { open } = useNotification();

  // Server-side CSV with the same filters as the table.
  const exportCsv = () => {
    const v = (field: string, op = "eq") =>
      (filters.find((f) => "field" in f && f.field === field && f.operator === op)?.value as string | boolean | undefined) ?? undefined;
    download("/admin/orders/export.csv", `orders-${new Date().toISOString().slice(0, 10)}.csv`, {
      status: v("status"), date_from: v("createdAt", "gte"), date_to: v("createdAt", "lte"), mode: v("mode"),
      payment_status: v("paymentStatus"), new_customer: v("isNewCustomer"),
    }).catch((e) => open?.({ type: "error", message: "Не удалось выгрузить CSV", description: e.message }));
  };

  return (
    <List headerButtons={<Button icon={<DownloadOutlined />} onClick={exportCsv}>Экспорт CSV</Button>}>
      <Form {...searchFormProps} initialValues={{ status: initialStatus ?? undefined }} layout="inline" onValuesChange={() => searchFormProps.form?.submit()} style={{ rowGap: 8, marginBottom: 12 }}>
        {!wide && (
          <Button onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            {showFilters ? "Скрыть фильтры" : "Фильтры"}
          </Button>
        )}
        {/* Phones: filters collapse behind one button so the list starts on the first screen. */}
        <div style={{ display: wide || showFilters ? "contents" : "none" }}>
          <Form.Item name="status">
            <Select allowClear placeholder="Статус" options={options(ORDER_STATUS)} style={{ minWidth: 180 }} />
          </Form.Item>
          <Form.Item name="range">
            <DatePicker.RangePicker format="DD.MM.YYYY" placeholder={["С", "По"]} />
          </Form.Item>
          <Form.Item name="mode">
            <Select allowClear placeholder="Режим" options={options(MODE)} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="paymentStatus">
            <Select allowClear placeholder="Оплата" options={options(PAYMENT_STATUS)} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="newOnly" valuePropName="checked">
            <Checkbox>Только новые клиенты</Checkbox>
          </Form.Item>
        </div>
      </Form>

      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        scroll={wide ? { x: true } : undefined}
        onRow={(r) => ({ onClick: () => show("orders", r.id), style: { cursor: "pointer" } })}
      >
        {!wide && (
          // Phones: one stacked cell with what a manager scans for — number, status, client, total.
          <Table.Column<Order>
            key="mobile"
            title="Заказы"
            render={(_, r) => (
              <Space direction="vertical" size={2} style={{ width: "100%" }}>
                <Space size={6} wrap style={{ justifyContent: "space-between", width: "100%" }}>
                  <Typography.Link strong onClick={() => show("orders", r.id)}>№ {r.number}</Typography.Link>
                  <span className="num" style={{ fontWeight: 600 }}>{tenge(r.total, r.approximate)}</span>
                </Space>
                <Space size={4} wrap>
                  <Tag color={ORDER_STATUS[r.status].color}>{ORDER_STATUS[r.status].label}</Tag>
                  <Tag color={MODE[r.mode].color}>{MODE[r.mode].label}</Tag>
                  <Tag color={PAYMENT_STATUS[r.paymentStatus].color}>{PAYMENT_STATUS[r.paymentStatus].label}</Tag>
                </Space>
                <Typography.Text>
                  {r.customerName} {r.isNewCustomer && <Tag color="blue">новый</Tag>}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dateTime(r.createdAt)} · {FULFILMENT[r.fulfilment]}
                </Typography.Text>
              </Space>
            )}
          />
        )}
        {wide && <Table.Column<Order> dataIndex="number" title="№" />}
        {wide && (
          <>
          <Table.Column<Order> dataIndex="createdAt" title="Дата" render={dateTime} />
          <Table.Column<Order>
          dataIndex="customerName"
          title="Клиент"
          render={(v, r) => (
            <Space size={4} wrap>
              {v}
              {r.isNewCustomer && <Tag color="blue">новый клиент</Tag>}
            </Space>
          )}
        />
          <Table.Column<Order> dataIndex="mode" title="Режим" render={(v: Order["mode"]) => <Tag color={MODE[v].color}>{MODE[v].label}</Tag>} />
          <Table.Column<Order>
          dataIndex="status"
          title="Статус"
          render={(v: Order["status"]) => <Tag color={ORDER_STATUS[v].color}>{ORDER_STATUS[v].label}</Tag>}
        />
          <Table.Column<Order>
          dataIndex="paymentStatus"
          title="Оплата"
          render={(v: Order["paymentStatus"], r) => (
            <Space size={4} wrap>
              <span>{PAYMENT_METHOD[r.paymentMethod]}</span>
              <Tag color={PAYMENT_STATUS[v].color}>{PAYMENT_STATUS[v].label}</Tag>
            </Space>
          )}
        />
          <Table.Column<Order> dataIndex="fulfilment" title="Получение" render={(v: Order["fulfilment"]) => FULFILMENT[v]} />
          <Table.Column<Order> dataIndex="total" title="Сумма" align="right" render={(v, r) => tenge(v, r.approximate)} />
          <Table.Column<Order>
          key="actions"
          render={(_, r) => (
            <span onClick={(e) => e.stopPropagation()}>
              <Tooltip title="Открыть">
                <ShowButton hideText size="small" recordItemId={r.id} aria-label={`Открыть заказ № ${r.number}`} />
              </Tooltip>
            </span>
          )}
        />
          </>
        )}
      </Table>
    </List>
  );
};
