import { useCustom, useNotification } from "@refinedev/core";
import { BankOutlined, ShoppingOutlined, SolutionOutlined } from "@ant-design/icons";
import { Button, Card, Col, DatePicker, Empty, Grid, List, Row, Segmented, Space, Statistic, Table, Tag, Tooltip, Typography, theme } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { MODE, ORDER_STATUS, date, tenge } from "../../lib/format";
import { download } from "../../providers/api";
import type { CustomerMode, OrderStatus } from "../../types";

type Preset = "today" | "7" | "30" | "custom";
const presetRange = (p: Exclude<Preset, "custom">): [Dayjs, Dayjs] => {
  const days = p === "today" ? 0 : Number(p) - 1;
  return [dayjs().subtract(days, "day").startOf("day"), dayjs().endOf("day")];
};

type Summary = { revenue: string; orders_count: number; avg_check: string };
// GET /admin/analytics/dashboard (B13): all aggregates are computed by the server.
type DashboardData = {
  counted_statuses: OrderStatus[];
  summary: Record<"all" | CustomerMode, Summary>;
  top_products: { product_id: number; name: string; quantity: string; revenue: string }[];
  top_customers: { customer_id: number; name: string; orders_count: number; revenue: string }[];
  low_stock: { product_id: number; sku: string; name: string; available: string; low_threshold: string }[];
  pending_preorders: { count: number; items: { order_id: number; number: string; mode: CustomerMode; total: string; expected_date: string | null }[] };
};

export const Dashboard = () => {
  const [preset, setPreset] = useState<Preset>("30");
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => presetRange("30"));
  const [mode, setMode] = useState<CustomerMode | "all">("all");
  const { open } = useNotification();
  const period = { date_from: range[0].format("YYYY-MM-DD"), date_to: range[1].format("YYYY-MM-DD"), mode: mode === "all" ? undefined : mode };

  const { result, query } = useCustom<DashboardData>({ url: "/admin/analytics/dashboard", method: "get", config: { query: period } });
  const d = result?.data;
  const s = d?.summary[mode];
  const loading = query.isLoading;
  const exportCsv = () =>
    download("/admin/analytics/orders-export", `orders_${period.date_from}_${period.date_to}.csv`, { ...period, format: "csv" })
      .catch((e) => open?.({ type: "error", message: "Не удалось выгрузить CSV", description: e.message }));

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
          <Button onClick={exportCsv}>Экспорт заказов CSV</Button>
        </Space>
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          {range[0].format("DD.MM.YYYY")} — {range[1].format("DD.MM.YYYY")}. В выручку входят статусы:{" "}
          {(d?.counted_statuses ?? []).map((x) => ORDER_STATUS[x]?.label ?? x).join(", ").toLowerCase() || "—"}.
        </Typography.Text>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="Выручка" value={tenge(Number(s?.revenue ?? 0))} loading={loading} /></Card></Col>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Заказов" value={s?.orders_count ?? 0} loading={loading} /></Card></Col>
        <Col xs={12} sm={8}><Card size="small"><Statistic title="Средний чек" value={tenge(Number(s?.avg_check ?? 0))} loading={loading} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Топ товаров">
            <Table size="small" rowKey="product_id" loading={loading} dataSource={d?.top_products} pagination={false} scroll={{ x: true }}>
              <Table.Column dataIndex="name" title="Товар" />
              <Table.Column dataIndex="quantity" title="Кол-во (баз. ед.)" align="right" render={(v: string) => Number(v).toLocaleString("ru-RU")} />
              <Table.Column dataIndex="revenue" title="Выручка" align="right" render={(v: string) => tenge(Number(v))} />
            </Table>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Топ клиентов">
            <Table size="small" rowKey="customer_id" loading={loading} dataSource={d?.top_customers} pagination={false} scroll={{ x: true }}>
              <Table.Column dataIndex="name" title="Клиент" render={(v: string, r: { customer_id: number }) => <Link to={`/customers/${r.customer_id}`}>{v}</Link>} />
              <Table.Column dataIndex="orders_count" title="Заказов" align="right" />
              <Table.Column dataIndex="revenue" title="Выручка" align="right" render={(v: string) => tenge(Number(v))} />
            </Table>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Низкие остатки" extra={<Link to="/stock">Все остатки</Link>}>
            <List
              size="small"
              loading={loading}
              dataSource={d?.low_stock ?? []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Остатков ниже порога нет" /> }}
              renderItem={(x) => (
                <List.Item extra={<span className="num">{Number(x.available)} / порог {Number(x.low_threshold)}</span>}>
                  {x.name} {Number(x.available) <= 0 ? <Tag color="red">нет в наличии</Tag> : <Tag color="orange">мало</Tag>}
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title={`Ожидающие предзаказы${d ? ` (${d.pending_preorders.count})` : ""}`}>
            <List
              size="small"
              loading={loading}
              dataSource={d?.pending_preorders.items ?? []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Предзаказов нет" /> }}
              renderItem={(o) => (
                <List.Item>
                  <span>
                    <Link to={`/orders/${o.order_id}`}>№{o.number}</Link> <Tag color={MODE[o.mode].color}>{MODE[o.mode].label}</Tag> ожидается {date(o.expected_date)}
                  </span>
                  <span className="num" style={{ whiteSpace: "nowrap" }}>{tenge(Number(o.total))}</span>
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
export const AttentionCounters = () => {
  const { result } = useCustom<{ new_orders: number; pending_wholesale_requests: number; pending_transfers: number }>({
    url: "/admin/notifications/attention-counters",
    method: "get",
    queryOptions: { refetchInterval: 30_000 },
  });
  const c = result?.data;
  const compact = !Grid.useBreakpoint().md;
  const { token } = theme.useToken();
  const location = useLocation();
  const navigate = useNavigate();
  const items = [
    {
      label: "Новые заказы",
      icon: <ShoppingOutlined />,
      to: "/orders?status=new",
      count: c?.new_orders ?? 0,
    },
    {
      label: "Заявки на опт",
      icon: <SolutionOutlined />,
      to: "/wholesale",
      count: c?.pending_wholesale_requests ?? 0,
    },
    {
      label: "Переводы",
      icon: <BankOutlined />,
      to: "/payments",
      count: c?.pending_transfers ?? 0,
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
