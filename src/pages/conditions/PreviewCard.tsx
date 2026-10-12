import { useState } from "react";
import { Alert, Button, Card, Col, Descriptions, Form, InputNumber, Row, Select, Space, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { Category, Condition, Customer, CustomerMode, Product } from "../../types";
import { CONDITION_TYPE, MODE, options, tenge } from "../../lib/format";
import { previewCart, type CartLine } from "./preview";

type Line = { packId?: string; qty: number };

const ancestors = (cats: Category[], id: string) => {
  const out: string[] = [];
  for (let c = cats.find((x) => x.id === id); c; c = cats.find((x) => x.id === c!.parentId)) out.push(c.id);
  return out;
};

export const Preview = ({ conditions, products, categories, customers }: {
  conditions: Condition[]; products: Product[]; categories: Category[]; customers: Customer[];
}) => {
  const [mode, setMode] = useState<CustomerMode>("retail");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([{ qty: 2 }]);

  const packs = products.flatMap((p) =>
    p.packs
      .filter((pk) => pk.visibility === "both" || pk.visibility === mode)
      .map((pk) => ({ p, pk, price: mode === "retail" ? pk.retailPrice : pk.wholesalePrice }))
      .filter((x): x is typeof x & { price: number } => x.price != null),
  );
  const cart: CartLine[] = lines.flatMap((l) => {
    const x = packs.find((y) => y.pk.id === l.packId);
    return x ? [{ productId: x.p.id, categoryIds: ancestors(categories, x.p.categoryId), qty: l.qty, unitPrice: x.price, baseQty: x.pk.baseQty }] : [];
  });
  const r = previewCart(conditions, cart, { mode, customerId, now: new Date() });
  const setLine = (i: number, l: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...l } : x)));

  return (
    <Card size="small" title="Предпросмотр на тестовой корзине" style={{ marginTop: 16 }}>
      <Alert type="warning" showIcon style={{ marginBottom: 12 }}
        message="Только предпросмотр. Итоговый расчёт делает сервер при оформлении заказа (учитывает ещё зону доставки)." />
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
                    options={packs.map((x) => ({ value: x.pk.id, label: `${x.p.name}, ${x.pk.label} — ${tenge(x.price)}` }))} />
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
            <Button icon={<PlusOutlined />} onClick={() => setLines([...lines, { qty: 1 }])}>Добавить товар</Button>
          </Form>
        </Col>
        <Col xs={24} lg={12}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Сумма товаров"><span className="num">{tenge(r.subtotal)}</span></Descriptions.Item>
            <Descriptions.Item label="Скидка"><span className="num">{r.discount ? `− ${tenge(r.discount)}` : "—"}</span></Descriptions.Item>
            <Descriptions.Item label="Доставка"><span className="num">{r.deliveryFee ? tenge(r.deliveryFee) : "Бесплатно"}</span></Descriptions.Item>
            <Descriptions.Item label="Итого"><Typography.Text strong className="num">{tenge(r.total)}</Typography.Text></Descriptions.Item>
            <Descriptions.Item label="Минимальный заказ">
              <Space direction="vertical" size={0}>
                {r.minAmount != null && <span className="num">Сумма от {tenge(r.minAmount)}: {r.amountOk ? "выполнено" : "не выполнено"}</span>}
                {r.minVolume != null && <span className="num">Объём от {r.minVolume} (в корзине {r.volume}): {r.volumeOk ? "выполнено" : "не выполнено"}</span>}
                {r.canOrder ? <Tag color="green">Заказ можно оформить</Tag> : <Tag color="red">{cart.length ? "Заказ оформить нельзя" : "Корзина пуста"}</Tag>}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="Предзаказ">{r.preorderAllowed ? <Tag color="green">Разрешён</Tag> : <Tag>Не разрешён</Tag>}</Descriptions.Item>
            <Descriptions.Item label="Применены условия">
              {r.applied.length ? (
                <Space direction="vertical" size={0}>
                  {r.applied.map((c) => <span key={c.id}>{c.name} <Typography.Text type="secondary">({CONDITION_TYPE[c.type]})</Typography.Text></span>)}
                </Space>
              ) : "Нет"}
            </Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>
    </Card>
  );
};
