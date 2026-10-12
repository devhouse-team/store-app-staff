import { type CrudFilter, useList } from "@refinedev/core";
import { BankOutlined, ShoppingOutlined, SolutionOutlined } from "@ant-design/icons";
import { Button, Card, Col, DatePicker, Empty, Grid, List, Row, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography, theme } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { date, dateTime, MODE, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, qty, tenge } from "../../lib/format";
import type { CustomerMode, Order, OrderStatus, Stock } from "../../types";

type Preset = "today" | "7" | "30" | "custom";
const presetRange = (p: Exclude<Preset, "custom">): [Dayjs, Dayjs] => {
  const days = p === "today" ? 0 : Number(p) - 1;
  return [dayjs().subtract(days, "day").startOf("day"), dayjs().endOf("day")];
};

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const exportCsv = (orders: Order[], [from, to]: [Dayjs, Dayjs]) => {
  const head = ["Номер", "Дата", "Клиент", "Телефон", "Режим", "Статус", "Оплата", "Статус оплаты", "Получение", "Сумма товаров", "Скидка", "Доставка", "Итого"];
  const rows = orders.map((o) => [
    o.number, dateTime(o.createdAt), o.customerName, o.customerPhone, MODE[o.mode].label, ORDER_STATUS[o.status].label,
    PAYMENT_METHOD[o.paymentMethod], PAYMENT_STATUS[o.paymentStatus].label, o.fulfilment === "pickup" ? "Самовывоз" : "Доставка",
    o.subtotal, o.discount, o.deliveryFee, o.total,
  ]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `orders_${from.format("YYYY-MM-DD")}_${to.format("YYYY-MM-DD")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

export const Dashboard = () => {
  const { token } = theme.useToken();
  const [preset, setPreset] = useState<Preset>("30");
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => presetRange("30"));
  const [mode, setMode] = useState<CustomerMode | "all">("all");

  // ponytail: aggregates computed client-side over the period's orders; switch to the B13 analytics endpoint when it lands.
  const { result, query } = useList<Order>({
    resource: "orders",
    pagination: { mode: "off" },
    sorters: [{ field: "createdAt", order: "desc" }],
    filters: [
      { field: "createdAt", operator: "gte", value: range[0].toISOString() },
      { field: "createdAt", operator: "lte", value: range[1].toISOString() },
      { field: "mode", operator: "eq", value: mode === "all" ? undefined : mode },
    ],
  });
  const { result: stockRes, query: stockQuery } = useList<Stock>({ resource: "stock", pagination: { mode: "off" } });
  const { result: preRes, query: preQuery } = useList<Order>({
    resource: "orders",
    pagination: { mode: "off" },
    filters: [{ field: "status", operator: "eq", value: "preorder" }],
    sorters: [{ field: "expectedDate", order: "asc" }],
  });

  const s = useMemo(() => {
    const all = result.data;
    const live = all.filter((o) => o.status !== "cancelled");
    const revenue = live.reduce((sum, o) => sum + o.total, 0);
    const byStatus = Object.fromEntries((Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => [k, 0])) as Record<OrderStatus, number>;
    all.forEach((o) => byStatus[o.status]++);

    const products = new Map<string, { id: string; name: string; unit: string; qty: number; revenue: number }>();
    const customers = new Map<string, { id: string; name: string; mode: CustomerMode; orders: number; revenue: number }>();
    const days = new Map<string, number>();
    for (let d = range[0].startOf("day"); !d.isAfter(range[1]); d = d.add(1, "day")) days.set(d.format("YYYY-MM-DD"), 0);
    for (const o of live) {
      for (const i of o.items) {
        const p = products.get(i.productId) ?? { id: i.productId, name: i.name, unit: i.unit, qty: 0, revenue: 0 };
        p.qty += i.actualQty ?? i.qty;
        p.revenue += i.lineTotal;
        products.set(i.productId, p);
      }
      const c = customers.get(o.customerId) ?? { id: o.customerId, name: o.customerName, mode: o.mode, orders: 0, revenue: 0 };
      c.orders++;
      c.revenue += o.total;
      customers.set(o.customerId, c);
      const day = dayjs(o.createdAt).format("YYYY-MM-DD");
      days.set(day, (days.get(day) ?? 0) + o.total);
    }
    const top = <T extends { revenue: number }>(m: Map<string, T>) => [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    const daily = [...days].sort(([a], [b]) => (a < b ? 1 : -1));
    return {
      all, revenue, count: live.length, avg: live.length ? Math.round(revenue / live.length) : 0, byStatus,
      topProducts: top(products), topCustomers: top(customers), daily, maxDay: Math.max(1, ...daily.map(([, v]) => v)),
    };
  }, [result.data, range]);

  const lowStock = stockRes.data.filter((x) => x.quantity - x.reserved <= x.lowThreshold).sort((a, b) => a.quantity - a.reserved - (b.quantity - b.reserved));
  const loading = query.isLoading;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small">
        <Space wrap>
          <Segmented<Preset>
            aria-label="Период"
            value={preset}
            onChange={(p) => {
              setPreset(p);
              if (p !== "custom") setRange(presetRange(p));
            }}
            options={[
              { value: "today", label: "Сегодня" },
              { value: "7", label: "7 дней" },
              { value: "30", label: "30 дней" },
              { value: "custom", label: "Период" },
            ]}
          />
          {preset === "custom" && (
            <DatePicker.RangePicker
              aria-label="Произвольный период"
              format="DD.MM.YYYY"
              allowClear={false}
              value={range}
              onChange={(v) => v?.[0] && v[1] && setRange([v[0].startOf("day"), v[1].endOf("day")])}
            />
          )}
          <Segmented<CustomerMode | "all">
            aria-label="Режим"
            value={mode}
            onChange={setMode}
            options={[
              { value: "all", label: "Все" },
              { value: "retail", label: "Розница" },
              { value: "wholesale", label: "Опт" },
            ]}
          />
          <Button onClick={() => exportCsv(s.all, range)} disabled={!s.all.length}>Экспорт заказов CSV</Button>
        </Space>
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          {range[0].format("DD.MM.YYYY")} — {range[1].format("DD.MM.YYYY")}. Отменённые заказы не входят в выручку.
        </Typography.Text>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="Выручка" value={tenge(s.revenue)} loading={loading} /></Card></Col>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Заказов" value={s.count} loading={loading} /></Card></Col>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Средний чек" value={tenge(s.avg)} loading={loading} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Заказы по статусам" loading={loading}>
            <Space wrap>
              {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((k) => (
                <Tag key={k} color={ORDER_STATUS[k].color}>{ORDER_STATUS[k].label}: <b>{s.byStatus[k]}</b></Tag>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Выручка по дням" loading={loading}>
            <div style={{ maxHeight: 320, overflowY: "auto" }} role="table" aria-label="Выручка по дням">
              {s.daily.map(([d, v]) => (
                <div key={d} role="row" style={{ display: "grid", gridTemplateColumns: "56px 1fr 96px", gap: 8, alignItems: "center", padding: "2px 0" }}>
                  <span role="cell">{dayjs(d).format("DD.MM")}</span>
                  <div aria-hidden style={{ background: token.colorFillSecondary, borderRadius: token.borderRadiusSM, height: 12 }}>
                    <div style={{ width: `${(v / s.maxDay) * 100}%`, height: "100%", background: token.colorPrimary, borderRadius: token.borderRadiusSM }} />
                  </div>
                  <span role="cell" className="num" style={{ textAlign: "right" }}>{tenge(v)}</span>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Топ товаров">
            <Table size="small" rowKey="id" loading={loading} dataSource={s.topProducts} pagination={false} scroll={{ x: true }}>
              <Table.Column dataIndex="name" title="Товар" />
              <Table.Column dataIndex="qty" title="Кол-во" align="right" render={(v: number, r: { unit: string }) => qty(Math.round(v * 100) / 100, r.unit)} />
              <Table.Column dataIndex="revenue" title="Выручка" align="right" render={(v: number) => tenge(v)} />
            </Table>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Топ клиентов">
            <Table size="small" rowKey="id" loading={loading} dataSource={s.topCustomers} pagination={false} scroll={{ x: true }}>
              <Table.Column dataIndex="name" title="Клиент" render={(v: string, r: { id: string }) => <Link to={`/customers/${r.id}`}>{v}</Link>} />
              <Table.Column dataIndex="mode" title="Режим" render={(v: CustomerMode) => <Tag color={MODE[v].color}>{MODE[v].label}</Tag>} />
              <Table.Column dataIndex="orders" title="Заказов" align="right" />
              <Table.Column dataIndex="revenue" title="Выручка" align="right" render={(v: number) => tenge(v)} />
            </Table>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Низкие остатки" extra={<Link to="/stock">Все остатки</Link>}>
            <List
              size="small"
              loading={stockQuery.isLoading}
              dataSource={lowStock}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Остатков ниже порога нет" /> }}
              renderItem={(x) => (
                <List.Item extra={<span className="num">{qty(x.quantity - x.reserved, x.unit)} / порог {x.lowThreshold}</span>}>
                  {x.productName} {x.quantity - x.reserved <= 0 ? <Tag color="red">нет в наличии</Tag> : <Tag color="orange">мало</Tag>}
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Ожидающие предзаказы">
            <List
              size="small"
              loading={preQuery.isLoading}
              dataSource={preRes.data}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Предзаказов нет" /> }}
              renderItem={(o) => (
                <List.Item>
                  <span>
                    <Link to={`/orders/${o.id}`}>№{o.number}</Link> · {o.customerName} · ожидается {date(o.expectedDate)}
                  </span>
                  <span className="num" style={{ whiteSpace: "nowrap" }}>{tenge(o.total, o.approximate)}</span>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

// B20 "требует внимания" counters for the header. Polls every 30 s.
const useCount = (resource: string, filters: CrudFilter[]) =>
  useList({ resource, filters, pagination: { pageSize: 1 }, queryOptions: { refetchInterval: 30_000 } }).result.total ?? 0;

export const AttentionCounters = () => {
  const compact = !Grid.useBreakpoint().md;
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const items = [
    {
      label: "Новые заказы",
      icon: <ShoppingOutlined />,
      to: "/orders?status=new",
      count: useCount("orders", [{ field: "status", operator: "eq", value: "new" }]),
    },
    {
      label: "Заявки на опт",
      icon: <SolutionOutlined />,
      to: "/wholesale",
      count: useCount("wholesale_requests", [{ field: "status", operator: "eq", value: "pending" }]),
    },
    {
      label: "Переводы",
      icon: <BankOutlined />,
      to: "/payments",
      count: useCount("orders", [
        { field: "paymentMethod", operator: "eq", value: "transfer" },
        { field: "paymentStatus", operator: "eq", value: "pending" },
        { field: "status", operator: "ne", value: "cancelled" },
      ]),
    },
  ];
  return (
    // Real buttons (hover / press / focus states from antd), 40px tall, 44px+ wide, 8px apart.
    // The count sits inside the button instead of a tiny overlapping badge.
    <Space size={8}>
      {items.map((i) => {
        const active = location.pathname === i.to.split("?")[0];
        const hot = i.count > 0;
        return (
          <Tooltip key={i.to} title={compact ? i.label : undefined}>
            <Button
              className={!active && hot ? "attn-hot" : undefined}
              type={active ? "primary" : "default"}
              icon={i.icon}
              onClick={() => navigate(i.to)}
              aria-label={`${i.label}: ${i.count}`}
              aria-current={active ? "page" : undefined}
              style={{
                height: 40,
                minWidth: 44,
                paddingInline: compact ? 10 : 12,
                fontWeight: 500,
                ...(!active && hot ? { background: token.colorPrimaryBg, borderColor: token.colorPrimaryBorder, color: token.colorPrimaryText } : {}),
              }}
            >
              {!compact && i.label}
              <span
                className="num"
                aria-hidden
                style={{
                  minWidth: 20,
                  padding: "0 6px",
                  borderRadius: 10,
                  fontSize: 12,
                  lineHeight: "20px",
                  fontWeight: 600,
                  background: active ? token.colorBgContainer : hot ? token.colorError : token.colorFillSecondary,
                  color: active ? token.colorPrimary : hot ? token.colorWhite : token.colorTextSecondary,
                }}
              >
                {i.count}
              </span>
            </Button>
          </Tooltip>
        );
      })}
    </Space>
  );
};
