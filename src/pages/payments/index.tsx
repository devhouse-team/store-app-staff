import { List, useTable } from "@refinedev/antd";
import { useNotification, useOne, useUpdate } from "@refinedev/core";
import { Button, Card, Descriptions, Segmented, Space, Table, Tag } from "antd";
import { useState } from "react";
import { Link } from "react-router";
import { PAYMENT_STATUS, dateTime, tenge } from "../../lib/format";
import type { Order, PaymentStatus, Settings } from "../../types";

type Tab = PaymentStatus | "all";

export const PaymentList = () => {
  const [tab, setTab] = useState<Tab>("pending");
  const { tableProps, setFilters } = useTable<Order>({
    resource: "orders",
    syncWithLocation: false,
    filters: {
      permanent: [
        { field: "paymentMethod", operator: "eq", value: "transfer" },
        { field: "status", operator: "ne", value: "cancelled" }, // refunds of cancelled orders: order page
      ],
      initial: [{ field: "paymentStatus", operator: "eq", value: "pending" }],
    },
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
  });
  const { result: s } = useOne<Settings>({ resource: "settings", id: "main" });
  const { mutate } = useUpdate<Order>();
  const [busyId, setBusyId] = useState<string>();
  const { open } = useNotification();

  const confirm = (o: Order) => {
    setBusyId(o.id);
    mutate(
      { resource: "orders", id: o.id, values: { paymentStatus: "confirmed" }, successNotification: false },
      {
        onSuccess: () => open?.({ type: "success", message: `Оплата заказа № ${o.number} подтверждена`, description: "Клиент получит push" }),
        onSettled: () => setBusyId(undefined),
      },
    );
  };

  return (
    <List>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Card size="small" title="Реквизиты для перевода">
          <Descriptions size="small" column={{ xs: 1, sm: 3 }}>
            <Descriptions.Item label="Получатель">{s?.transferRecipient ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Kaspi">{s?.kaspiPhone ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Карта">{s?.card ?? "—"}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Segmented<Tab>
          value={tab}
          onChange={(v) => {
            setTab(v);
            setFilters([{ field: "paymentStatus", operator: "eq", value: v === "all" ? undefined : v }], "replace");
          }}
          options={[
            { value: "pending", label: "Ожидают" },
            { value: "confirmed", label: "Подтверждены" },
            { value: "all", label: "Все" },
          ]}
        />
        <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }}>
          <Table.Column<Order> dataIndex="number" title="Заказ" render={(n, r) => <Link to={`/orders/${r.id}`}>№ {n}</Link>} />
          <Table.Column<Order> dataIndex="createdAt" title="Дата" render={dateTime} />
          <Table.Column<Order> dataIndex="customerName" title="Клиент" render={(v, r) => <>{v}<br /><small>{r.customerPhone}</small></>} />
          <Table.Column<Order> dataIndex="total" title="Сумма" align="right" render={(v, r) => tenge(v, r.approximate)} />
          <Table.Column<Order>
            dataIndex="paymentStatus"
            title="Оплата"
            render={(v: PaymentStatus) => <Tag color={PAYMENT_STATUS[v].color}>{PAYMENT_STATUS[v].label}</Tag>}
          />
          <Table.Column<Order>
            key="actions"
            render={(_, r) =>
              r.paymentStatus === "pending" && (
                <Button size="small" type="primary" loading={busyId === r.id} onClick={() => confirm(r)}>
                  Подтвердить оплату
                </Button>
              )
            }
          />
        </Table>
      </Space>
    </List>
  );
};
