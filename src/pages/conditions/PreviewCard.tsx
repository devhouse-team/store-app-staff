import { useCustomMutation } from "@refinedev/core";
import { Alert, Button, Card, Col, Descriptions, Form, InputNumber, Row, Select, Space, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { Customer, CustomerMode, Product } from "../../types";
import { CONDITION_TYPE, MODE, options, tenge } from "../../lib/format";

type Line = { packId?: string; qty: number };
type PreviewOut = {
  subtotal: string; discount_total: string; total: string; delivery_fee: string | null; free_delivery_from: string | null;
  min_order_amount: string | null; min_order_quantity: string | null; preorder_product_ids: number[];
  applied: { id: number; name: string; type: string }[];
};
// Backend type code → UI label key (see providers/data.ts COND_TYPE).
const TYPE_LABEL: Record<string, string> = {
  discount_percent: CONDITION_TYPE.discount, min_order_quantity: CONDITION_TYPE.min_order_volume, delivery_fee: CONDITION_TYPE.custom_delivery_price,
  free_delivery_from: CONDITION_TYPE.free_delivery_from, preorder_allowed: CONDITION_TYPE.preorder_allowed, min_order_amount: CONDITION_TYPE.min_order_amount,
};
const money = (v: string | null) => (v == null ? "—" : tenge(Number(v)));

/** Test cart priced by the server: POST /admin/pricing/preview (B7 rules, same code as checkout). */
export const Preview = ({ products, customers }: { products: Product[]; customers: Customer[] }) => {
  const [mode, setMode] = useState<CustomerMode>("retail");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ qty: 2 }]);
  const { mutate, mutation } = useCustomMutation<PreviewOut>();
  const r = mutation.data?.data;

  const packs = products.flatMap((p) =>
    p.packs.filter((pk) => pk.visibility === "both" || pk.visibility === mode).map((pk) => ({ p, pk })),
  );
  const cart = lines.filter((l) => l.packId).map((l) => ({ pack_id: Number(l.packId), quantity: l.qty }));
  const setLine = (i: number, l: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...l } : x)));
  const run = () =>
    mutate({
      url: "/admin/pricing/preview",
      method: "post",
      values: { mode, customer_id: customerId ? Number(customerId) : null, lines: cart },
      successNotification: false,
    });

  return (
    <Card size="small" title="Предпросмотр на тестовой корзине" style={{ marginTop: 16 }}>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Расчёт выполняет сервер по действующим условиям. Стоимость доставки зависит ещё от зоны — здесь она без учёта зоны." />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Form layout="vertical">
            <Space wrap>
              <Form.Item label="Режим">
                <Select value={mode} onChange={(m) => { setMode(m); setLines([{ qty: 2 }]); }} options={options(MODE)} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item label="Клиент (необязательно)">
                <Select allowClear showSearch optionFilterProp="label" value={customerId} onChange={(v) => setCustomerId(v ?? null)}
                  placeholder="Без клиента" style={{ width: 220 }} options={customers.map((c) => ({ value: c.id, label: c.name }))} />
              </Form.Item>
            </Space>
            {lines.map((l, i) => (
              <Space key={i} align="start" style={{ display: "flex" }}>
                <Form.Item label={i === 0 ? "Товар" : undefined} style={{ marginBottom: 8 }}>
                  <Select showSearch optionFilterProp="label" value={l.packId} onChange={(packId) => setLine(i, { packId })}
                    placeholder="Выберите товар" style={{ width: 240 }} aria-label={`Товар ${i + 1}`}
                    options={packs.map((x) => ({ value: x.pk.id, label: `${x.p.name}, ${x.pk.label}` }))} />
                </Form.Item>
                <Form.Item label={i === 0 ? "Кол-во" : undefined} style={{ marginBottom: 8 }}>
                  <InputNumber min={0.5} step={1} value={l.qty} onChange={(qty) => setLine(i, { qty: qty ?? 1 })} style={{ width: 90 }} aria-label={`Количество ${i + 1}`} />
                </Form.Item>
                <Form.Item label={i === 0 ? " " : undefined} style={{ marginBottom: 8 }}>
                  <Tooltip title="Убрать строку">
                    <Button aria-label="Убрать строку" icon={<DeleteOutlined />} onClick={() => setLines(lines.filter((_, j) => j !== i))} />
                  </Tooltip>
                </Form.Item>
              </Space>
            ))}
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => setLines([...lines, { qty: 1 }])}>Добавить товар</Button>
              <Button type="primary" disabled={!cart.length} loading={mutation.isPending} onClick={run}>Рассчитать</Button>
            </Space>
          </Form>
        </Col>
        <Col xs={24} lg={12}>
          {r ? (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="Сумма товаров"><span className="num">{money(r.subtotal)}</span></Descriptions.Item>
              <Descriptions.Item label="Скидка"><span className="num">{Number(r.discount_total) ? `− ${money(r.discount_total)}` : "—"}</span></Descriptions.Item>
              <Descriptions.Item label="Итого товары"><Typography.Text strong className="num">{money(r.total)}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="Доставка (условие)"><span className="num">{money(r.delivery_fee)}</span></Descriptions.Item>
              <Descriptions.Item label="Бесплатная доставка от"><span className="num">{money(r.free_delivery_from)}</span></Descriptions.Item>
              <Descriptions.Item label="Минимальный заказ">
                <Space direction="vertical" size={0}>
                  <span className="num">Сумма: {money(r.min_order_amount)}</span>
                  <span className="num">Объём: {r.min_order_quantity == null ? "—" : Number(r.min_order_quantity)}</span>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Предзаказ разрешён">
                {r.preorder_product_ids.length ? `для ${r.preorder_product_ids.length} товар(ов) корзины` : "Нет"}
              </Descriptions.Item>
              <Descriptions.Item label="Применены условия">
                {r.applied.length ? (
                  <Space direction="vertical" size={0}>
                    {r.applied.map((c) => <span key={c.id}>{c.name} <Typography.Text type="secondary">({TYPE_LABEL[c.type] ?? c.type})</Typography.Text></span>)}
                  </Space>
                ) : "Нет"}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Typography.Text type="secondary">Соберите корзину и нажмите «Рассчитать».</Typography.Text>
          )}
        </Col>
      </Row>
    </Card>
  );
};
