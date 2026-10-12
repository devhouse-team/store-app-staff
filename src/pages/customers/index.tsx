import { useList, useShow, useUpdate } from "@refinedev/core";
import { List, Show, useTable } from "@refinedev/antd";
import { Button, Card, Checkbox, Descriptions, Empty, Form, Input, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { Link } from "react-router";
import type { Condition, Customer, Order, WholesaleRequest } from "../../types";
import { CONDITION_TYPE, MODE, ORDER_STATUS, WHOLESALE_STATUS, date, dateTime, options, tenge } from "../../lib/format";

type Search = { q?: string; mode?: string; isNew?: boolean; blocked?: boolean };

export const CustomerTags = ({ c }: { c: Customer }) => (
  <>
    {c.isNew && <Tag color="blue">новый</Tag>}
    {c.blocked && <Tag color="red">заблокирован</Tag>}
  </>
);

export const CustomerList = () => {
  const { tableProps, searchFormProps } = useTable<Customer, never, Search>({
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    onSearch: (v) => [
      { key: "q", operator: "or", value: [
        { field: "name", operator: "contains", value: v.q },
        { field: "phone", operator: "contains", value: v.q },
      ] },
      { field: "mode", operator: "eq", value: v.mode },
      { field: "isNew", operator: "eq", value: v.isNew || undefined },
      { field: "blocked", operator: "eq", value: v.blocked || undefined },
    ],
  });

  return (
    <List>
      <Form {...searchFormProps} layout="inline" onValuesChange={() => searchFormProps.form?.submit()} style={{ marginBottom: 16, rowGap: 8 }}>
        <Form.Item name="q" label="Поиск">
          <Input allowClear placeholder="Имя или телефон" style={{ width: 220 }} />
        </Form.Item>
        <Form.Item name="mode" label="Режим">
          <Select allowClear placeholder="Все" options={options(MODE)} style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="isNew" valuePropName="checked">
          <Checkbox>Только новые</Checkbox>
        </Form.Item>
        <Form.Item name="blocked" valuePropName="checked">
          <Checkbox>Заблокированные</Checkbox>
        </Form.Item>
      </Form>
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }}>
        <Table.Column<Customer> dataIndex="name" title="Имя" render={(v, c) => (
          <Space size={4} wrap><Link to={`/customers/${c.id}`}>{v}</Link><CustomerTags c={c} /></Space>
        )} />
        <Table.Column dataIndex="phone" title="Телефон" render={(v) => <span style={{ whiteSpace: "nowrap" }}>{v}</span>} />
        <Table.Column dataIndex="email" title="Email" render={(v) => v ?? "—"} />
        <Table.Column dataIndex="settlement" title="Населённый пункт" />
        <Table.Column<Customer> dataIndex="mode" title="Режим" render={(v: Customer["mode"]) => <Tag color={MODE[v].color}>{MODE[v].label}</Tag>} />
        <Table.Column<Customer> dataIndex="wholesaleStatus" title="Заявка на опт" render={(v: Customer["wholesaleStatus"]) =>
          v ? <Tag color={WHOLESALE_STATUS[v].color}>{WHOLESALE_STATUS[v].label}</Tag> : "—"} />
        <Table.Column dataIndex="ordersCount" title="Заказов" align="right" sorter />
        <Table.Column dataIndex="createdAt" title="Регистрация" sorter render={date} />
      </Table>
    </List>
  );
};

export const CustomerShow = () => {
  const { result: c, query } = useShow<Customer>();
  const id = c?.id;
  const { mutate: update, mutation: { isPending } } = useUpdate();

  const { result: orders, query: ordersQuery } = useList<Order>({
    resource: "orders",
    filters: [{ field: "customerId", operator: "eq", value: id }],
    sorters: [{ field: "createdAt", order: "desc" }],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!id },
  });
  const { result: requests } = useList<WholesaleRequest>({
    resource: "wholesale_requests",
    filters: [{ field: "customerId", operator: "eq", value: id }],
    sorters: [{ field: "submittedAt", order: "desc" }],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!id },
  });
  const { result: conds, query: condsQuery } = useList<Condition>({
    resource: "conditions",
    filters: [
      { field: "scope", operator: "eq", value: "customer" },
      { field: "scopeCustomerId", operator: "eq", value: id },
    ],
    pagination: { mode: "off" },
    queryOptions: { enabled: !!id },
  });
  const request = requests.data[0];

  return (
    <Show isLoading={query.isLoading} title={c?.name ?? "Клиент"} headerButtons={() => c && (
      <Popconfirm
        title={c.blocked ? "Разблокировать клиента?" : "Заблокировать клиента?"}
        description={c.blocked ? "Клиент снова сможет оформлять заказы." : "Клиент не сможет оформлять заказы."}
        okText={c.blocked ? "Разблокировать" : "Заблокировать"}
        okButtonProps={{ danger: !c.blocked }}
        onConfirm={() => update({ resource: "customers", id: c.id, values: { blocked: !c.blocked } })}
      >
        <Button danger={!c.blocked} loading={isPending}>{c.blocked ? "Разблокировать" : "Заблокировать"}</Button>
      </Popconfirm>
    )}>
      {c && (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small" title={<Space wrap>Профиль <CustomerTags c={c} /></Space>}>
            <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
              <Descriptions.Item label="Телефон">{c.phone}</Descriptions.Item>
              <Descriptions.Item label="Email">{c.email ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Населённый пункт">{c.settlement}</Descriptions.Item>
              <Descriptions.Item label="Режим"><Tag color={MODE[c.mode].color}>{MODE[c.mode].label}</Tag></Descriptions.Item>
              <Descriptions.Item label="Заявка на опт">
                {c.wholesaleStatus ? <Tag color={WHOLESALE_STATUS[c.wholesaleStatus].color}>{WHOLESALE_STATUS[c.wholesaleStatus].label}</Tag> : "—"}
                {request && <Link to={`/wholesale/${request.id}`}>Открыть заявку</Link>}
              </Descriptions.Item>
              <Descriptions.Item label="Заказов"><span className="num">{c.ordersCount}</span></Descriptions.Item>
              <Descriptions.Item label="Регистрация">{date(c.createdAt)}</Descriptions.Item>
              {c.orgName && <Descriptions.Item label="Организация">{c.orgName}</Descriptions.Item>}
              {c.bin && <Descriptions.Item label="БИН/ИИН"><span className="num">{c.bin}</span></Descriptions.Item>}
            </Descriptions>
          </Card>

          <Card size="small" title="История заказов">
            <Table<Order> dataSource={orders.data} loading={ordersQuery.isLoading} rowKey="id" size="small" scroll={{ x: true }}
              pagination={{ pageSize: 10, hideOnSinglePage: true }} locale={{ emptyText: <Empty description="Заказов пока нет" /> }}>
              <Table.Column<Order> dataIndex="number" title="№" render={(v, o) => <Link to={`/orders/${o.id}`}>№{v}</Link>} />
              <Table.Column dataIndex="createdAt" title="Дата" render={dateTime} />
              <Table.Column<Order> dataIndex="status" title="Статус" render={(v: Order["status"]) => <Tag color={ORDER_STATUS[v].color}>{ORDER_STATUS[v].label}</Tag>} />
              <Table.Column<Order> dataIndex="total" title="Сумма" align="right" render={(v, o) => tenge(v, o.approximate)} />
            </Table>
          </Card>

          <Card size="small" title="Персональные условия" extra={
            <Link to={`/conditions/create?customerId=${c.id}`}><Button size="small" icon={<PlusOutlined />}>Новое условие</Button></Link>
          }>
            <Table<Condition> dataSource={conds.data} loading={condsQuery.isLoading} rowKey="id" size="small" scroll={{ x: true }}
              pagination={false} locale={{ emptyText: <Empty description="Персональных условий нет" /> }}>
              <Table.Column<Condition> dataIndex="name" title="Название" render={(v, x) => <Link to={`/conditions/${x.id}/edit`}>{v}</Link>} />
              <Table.Column<Condition> dataIndex="type" title="Тип" render={(v: Condition["type"]) => CONDITION_TYPE[v]} />
              <Table.Column<Condition> dataIndex="enabled" title="Статус" render={(v) =>
                v ? <Tag color="green">Включено</Tag> : <Tag>Выключено</Tag>} />
            </Table>
            <Typography.Text type="secondary">Персональные условия важнее условий режима и общих.</Typography.Text>
          </Card>
        </Space>
      )}
    </Show>
  );
};
