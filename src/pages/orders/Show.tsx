import { DeleteOutlined, PrinterOutlined, SwapOutlined } from "@ant-design/icons";
import { Show, useSelect } from "@refinedev/antd";
import { useCreate, useList, useNotification, useOne, useShow, useUpdate, useWarnAboutChange } from "@refinedev/core";
import {
  Alert, Button, Card, Checkbox, Col, DatePicker, Descriptions, Input, InputNumber, Modal, Popconfirm, Row, Select, Space,
  Table, Tag, Tooltip, Typography,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { MODE, ORDER_NEXT, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, date, dateTime, qty, tenge } from "../../lib/format";
import type { Customer, Invoice, Order, OrderItem, OrderStatus, Product, Settings } from "../../types";
import { InvoicePrint } from "../invoices/InvoicePrint";
import { PrintModal } from "./PrintModal";
import { recalc } from "./recalc";

const EDITABLE: OrderStatus[] = ["new", "preorder", "confirmed", "assembling"];
const INVOICE_READY: OrderStatus[] = ["in_delivery", "ready_for_pickup", "completed"];
const NOTIFY = "Клиент получит уведомление об изменении";

const STATUS_ACTION: Partial<Record<OrderStatus, string>> = {
  confirmed: "Подтвердить",
  preorder: "В предзаказ",
  assembling: "Начать сборку",
  in_delivery: "Передать в доставку",
  ready_for_pickup: "Готов к выдаче",
  completed: "Завершить заказ",
};

export const OrderShow = () => {
  const { result: order, query } = useShow<Order>();
  const { mutateAsync } = useUpdate<Order>();
  const [isPending, setPending] = useState(false); // ponytail: local flag, mutation result types lack isPending here
  const { mutateAsync: create } = useCreate<Invoice>();
  const { open } = useNotification();
  const { setWarnWhen } = useWarnAboutChange();

  const [draft, setDraft] = useState<OrderItem[] | null>(null);
  const [expectedDate, setExpectedDate] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatus>();
  const [cancelReason, setCancelReason] = useState("");
  const [replacing, setReplacing] = useState<OrderItem | null>(null);
  const [replaceWith, setReplaceWith] = useState<string>();
  const [print, setPrint] = useState<"sheet" | "invoice" | null>(null);

  useEffect(() => setWarnWhen(!!draft), [draft, setWarnWhen]);
  useEffect(() => setExpectedDate(order?.expectedDate ?? null), [order?.expectedDate]);

  const { result: products } = useList<Product>({ resource: "products", pagination: { mode: "off" } });
  const { result: settings } = useOne<Settings>({ resource: "settings", id: "main" });
  const { result: customer } = useOne<Customer>({ resource: "customers", id: order?.customerId ?? "", queryOptions: { enabled: !!order } });
  const { result: invoices } = useList<Invoice>({ resource: "invoices", pagination: { mode: "off" } });
  const { result: invoice } = useOne<Invoice>({ resource: "invoices", id: order?.invoiceId ?? "", queryOptions: { enabled: !!order?.invoiceId } });
  const { selectProps: courierSelect } = useSelect({
    resource: "couriers",
    optionLabel: "name",
    filters: [{ field: "active", operator: "eq", value: true }],
    pagination: { mode: "off" },
  });

  const packOptions = useMemo(
    () =>
      (products?.data ?? []).flatMap((p) =>
        p.packs
          .filter((k) => k.visibility === "both" || k.visibility === order?.mode)
          .map((k) => ({ p, k, price: order?.mode === "wholesale" ? k.wholesalePrice : k.retailPrice }))
          .filter((x) => x.price != null)
          .map(({ p, k, price }) => ({ value: `${p.id}|${k.id}`, label: `${p.name} · ${k.label} — ${tenge(price)}` })),
      ),
    [products, order?.mode],
  );

  if (query.isLoading) return <Show isLoading />;
  if (!order) return <Show title="Заказ"><Alert type="error" message="Заказ не найден" /></Show>;

  const items = draft ?? order.items;
  const editable = EDITABLE.includes(order.status);
  const totals = recalc(order, items);
  const anyPreorder = items.some((i) => i.preorder);
  const next = ORDER_NEXT[order.status].filter(
    (s) => !(s === "in_delivery" && order.fulfilment === "pickup") && !(s === "ready_for_pickup" && order.fulfilment === "delivery"),
  );

  const save = (values: Partial<Order>, message = NOTIFY) => {
    setPending(true);
    return mutateAsync({ resource: "orders", id: order.id, values, successNotification: false })
      .then(() => open?.({ type: "success", message: "Сохранено", description: message }))
      .finally(() => setPending(false));
  };

  const patchItem = (id: string, p: Partial<OrderItem>) => setDraft(items.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const saveItems = async () => {
    if (anyPreorder && !expectedDate) {
      open?.({ type: "error", message: "Укажите ожидаемую дату для предзаказа" });
      return;
    }
    await save({
      ...totals,
      expectedDate: anyPreorder ? expectedDate : null,
      ...(anyPreorder && order.status === "new" ? { status: "preorder" as const } : {}),
    });
    setDraft(null);
  };

  const applyReplace = () => {
    const [pid, kid] = replaceWith?.split("|") ?? [];
    const p = products?.data.find((x) => x.id === pid);
    const k = p?.packs.find((x) => x.id === kid);
    if (!replacing || !p || !k) return;
    patchItem(replacing.id, {
      productId: p.id, packId: k.id, name: p.name, packLabel: k.label, unit: k.unit, actualQty: null, approximate: p.isWeighed,
      unitPrice: (order.mode === "wholesale" ? k.wholesalePrice : k.retailPrice) ?? 0,
    });
    setReplacing(null);
    setReplaceWith(undefined);
  };

  const changeStatus = async (to: OrderStatus) => {
    if (to === "cancelled" && !cancelReason.trim()) return;
    await save({ status: to, ...(to === "cancelled" ? { cancelReason: cancelReason.trim() } : {}) });
    setNextStatus(undefined);
    setCancelReason("");
  };

  const createInvoice = async () => {
    const vatRate = settings?.vatRate ?? 12;
    const max = Math.max(0, ...(invoices?.data ?? []).map((i) => Number(i.number.replace(/\D/g, "")) || 0));
    const { data } = await create({
      resource: "invoices",
      successNotification: false,
      values: {
        number: `Н-${String(max + 1).padStart(6, "0")}`,
        orderId: order.id,
        orderNumber: order.number,
        customerName: customer?.orgName ?? order.customerName,
        bin: customer?.bin ?? null,
        total: order.total,
        vat: Math.round((order.total * vatRate) / (100 + vatRate)),
        createdAt: new Date().toISOString(),
      },
    });
    await save({ invoiceId: String(data.id) }, `Накладная ${data.number} сформирована`);
  };

  const statusTag = (s: OrderStatus) => <Tag color={ORDER_STATUS[s].color}>{ORDER_STATUS[s].label}</Tag>;

  return (
    <Show
      title={
        <Space wrap size={8}>
          <span>Заказ № {order.number}</span>
          {statusTag(order.status)}
          <Tag color={MODE[order.mode].color}>{MODE[order.mode].label}</Tag>
        </Space>
      }
      canEdit={false}
      headerButtons={<Button icon={<PrinterOutlined />} onClick={() => setPrint("sheet")}>Печать сборочного листа</Button>}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {next.length > 0 && (
              <Card size="small" title="Статус">
                {/* One button per allowed transition: the main next step is primary, cancel is separate. */}
                <Space wrap>
                  {next.filter((s) => s !== "cancelled").map((s, i) => (
                    <Button key={s} type={i === 0 ? "primary" : "default"} disabled={!!draft} loading={isPending} onClick={() => changeStatus(s)}>
                      {STATUS_ACTION[s]}
                    </Button>
                  ))}
                  {next.includes("cancelled") && (
                    <Button danger type={nextStatus === "cancelled" ? "primary" : "default"} onClick={() => setNextStatus(nextStatus === "cancelled" ? undefined : "cancelled")}>
                      Отменить заказ…
                    </Button>
                  )}
                </Space>
                {nextStatus === "cancelled" && (
                  <Space.Compact block style={{ marginTop: 8 }}>
                    <Input
                      autoFocus
                      placeholder="Причина отмены (видна клиенту)"
                      aria-label="Причина отмены"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                    <Popconfirm title="Отменить заказ?" okText="Отменить заказ" cancelText="Нет" onConfirm={() => changeStatus("cancelled")} disabled={!cancelReason.trim()}>
                      <Button danger type="primary" disabled={!cancelReason.trim()} loading={isPending}>Подтвердить отмену</Button>
                    </Popconfirm>
                  </Space.Compact>
                )}
                {draft && <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>Сначала сохраните состав заказа.</Typography.Text>}
              </Card>
            )}

            <Card
              size="small"
              title="Состав заказа"
              extra={
                draft && (
                  <Space>
                    <Button size="small" onClick={() => setDraft(null)}>Сбросить</Button>
                    <Button size="small" type="primary" loading={isPending} onClick={saveItems}>Сохранить</Button>
                  </Space>
                )
              }
            >
              <Table<OrderItem> dataSource={items} rowKey="id" size="small" pagination={false} scroll={{ x: true }}>
                <Table.Column<OrderItem>
                  title="Товар"
                  render={(_, i) => (
                    <>
                      {i.name}
                      <br />
                      <Typography.Text type="secondary">{i.packLabel}</Typography.Text>
                    </>
                  )}
                />
                <Table.Column<OrderItem>
                  title="Кол-во"
                  render={(_, i) =>
                    editable ? (
                      <InputNumber min={0.01} step={i.unit === "кг" ? 0.1 : 1} value={i.qty} aria-label={`Количество: ${i.name}`}
                        onChange={(v) => v && patchItem(i.id, { qty: v })} style={{ width: 90 }} />
                    ) : (
                      qty(i.qty, i.unit)
                    )
                  }
                />
                <Table.Column<OrderItem>
                  title="Факт. вес"
                  render={(_, i) =>
                    !i.approximate ? "—" : editable ? (
                      <InputNumber min={0} step={0.01} value={i.actualQty} placeholder="взвесить" aria-label={`Фактический вес: ${i.name}`}
                        onChange={(v) => patchItem(i.id, { actualQty: v ?? null })} style={{ width: 100 }} />
                    ) : i.actualQty != null ? qty(i.actualQty, i.unit) : "—"
                  }
                />
                <Table.Column<OrderItem> title="Цена" align="right" render={(_, i) => tenge(i.unitPrice)} />
                <Table.Column<OrderItem>
                  title="Сумма"
                  align="right"
                  render={(_, i) => {
                    const line = totals.items!.find((x) => x.id === i.id)!;
                    return tenge(line.lineTotal, i.approximate && i.actualQty == null);
                  }}
                />
                <Table.Column<OrderItem>
                  title="Предзаказ"
                  render={(_, i) => (
                    <Checkbox checked={i.preorder} disabled={!editable} aria-label={`Предзаказ: ${i.name}`}
                      onChange={(e) => patchItem(i.id, { preorder: e.target.checked })} />
                  )}
                />
                {editable && (
                  <Table.Column<OrderItem>
                    key="actions"
                    render={(_, i) => (
                      <Space size={4}>
                        <Tooltip title="Заменить">
                          <Button size="small" icon={<SwapOutlined />} aria-label={`Заменить ${i.name}`} onClick={() => setReplacing(i)} />
                        </Tooltip>
                        <Popconfirm title="Убрать позицию из заказа?" okText="Убрать" cancelText="Нет" disabled={items.length < 2}
                          onConfirm={() => setDraft(items.filter((x) => x.id !== i.id))}>
                          <Tooltip title={items.length < 2 ? "Нельзя убрать последнюю позицию — отмените заказ" : "Убрать"}>
                            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Убрать ${i.name}`} disabled={items.length < 2} />
                          </Tooltip>
                        </Popconfirm>
                      </Space>
                    )}
                  />
                )}
              </Table>
              {(anyPreorder || order.expectedDate) && (
                <Space wrap style={{ marginTop: 12 }}>
                  <span>Ожидаемая дата предзаказа:</span>
                  <DatePicker
                    format="DD.MM.YYYY"
                    disabled={!editable}
                    value={expectedDate ? dayjs(expectedDate) : null}
                    disabledDate={(d) => d.isBefore(dayjs(), "day")}
                    onChange={(d) => {
                      setExpectedDate(d ? d.format("YYYY-MM-DD") : null);
                      if (!draft) setDraft(items);
                    }}
                  />
                </Space>
              )}
              <Descriptions size="small" column={1} style={{ marginTop: 12, maxWidth: 360, marginLeft: "auto" }} className="num">
                <Descriptions.Item label="Товары">{tenge(totals.subtotal)}</Descriptions.Item>
                {!!order.discount && <Descriptions.Item label="Скидка">−{tenge(order.discount)}</Descriptions.Item>}
                <Descriptions.Item label="Доставка">{tenge(order.deliveryFee)}</Descriptions.Item>
                <Descriptions.Item label="Итого"><b>{tenge(totals.total, totals.approximate)}</b></Descriptions.Item>
                {totals.totalBeforeWeighing != null && (
                  <Descriptions.Item label="До взвешивания">{tenge(totals.totalBeforeWeighing)}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </Space>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card size="small" title="Клиент и получение">
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="Клиент">
                  <Space size={4} wrap>
                    <Link to={`/customers/${order.customerId}`}>{order.customerName}</Link>
                    {order.isNewCustomer && <Tag color="blue">новый клиент</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Телефон"><a href={`tel:${order.customerPhone.replace(/\s/g, "")}`}>{order.customerPhone}</a></Descriptions.Item>
                <Descriptions.Item label="Создан">{dateTime(order.createdAt)}</Descriptions.Item>
                {order.fulfilment === "delivery" ? (
                  <>
                    <Descriptions.Item label="Доставка">{order.address ?? "—"}</Descriptions.Item>
                    <Descriptions.Item label="Слот">{order.slot ?? "—"}</Descriptions.Item>
                  </>
                ) : (
                  <Descriptions.Item label="Самовывоз">{settings ? `${settings.pickupAddress}, ${settings.pickupHours}` : "—"}</Descriptions.Item>
                )}
                {order.expectedDate && <Descriptions.Item label="Предзаказ к">{date(order.expectedDate)}</Descriptions.Item>}
                <Descriptions.Item label="Комментарий">{order.comment ?? "—"}</Descriptions.Item>
                {order.cancelReason && <Descriptions.Item label="Причина отмены">{order.cancelReason}</Descriptions.Item>}
              </Descriptions>
              {order.fulfilment === "delivery" && <Typography.Text strong style={{ display: "block", margin: "8px 0 4px" }}>Курьер</Typography.Text>}
              {order.fulfilment === "delivery" && (
                <Select<string>
                  options={courierSelect.options as { value: string; label: string }[]}
                  loading={courierSelect.loading}
                  allowClear
                  placeholder="Назначить курьера"
                  aria-label="Курьер"
                  style={{ width: "100%", marginTop: 8 }}
                  value={order.courierId ?? undefined}
                  disabled={order.status === "completed" || order.status === "cancelled"}
                  onChange={(v) => save({ courierId: v ?? null }, v ? "Курьер назначен" : "Курьер снят")}
                />
              )}
            </Card>

            <Card size="small" title="Оплата">
              <Space direction="vertical" style={{ width: "100%" }}>
                <Space wrap>
                  <span>{PAYMENT_METHOD[order.paymentMethod]}</span>
                  <Tag color={PAYMENT_STATUS[order.paymentStatus].color}>{PAYMENT_STATUS[order.paymentStatus].label}</Tag>
                </Space>
                <Space wrap>
                  {order.paymentStatus === "pending" && order.paymentMethod === "transfer" && (
                    <Button type="primary" size="small" onClick={() => save({ paymentStatus: "confirmed" }, "Клиент получит push")}>
                      Подтвердить перевод
                    </Button>
                  )}
                  {order.paymentStatus === "confirmed" && (
                    <Popconfirm title="Отметить возврат денег клиенту?" okText="Да, возврат" cancelText="Нет"
                      onConfirm={() => save({ paymentStatus: "refunded" })}>
                      <Button size="small" danger>Отметить возврат</Button>
                    </Popconfirm>
                  )}
                </Space>
              </Space>
            </Card>

            {order.mode === "wholesale" && (
              <Card size="small" title="Накладная">
                {order.invoiceId ? (
                  <Space wrap>
                    <span>{invoice?.number ?? "…"}</span>
                    <Button size="small" icon={<PrinterOutlined />} disabled={!invoice} onClick={() => setPrint("invoice")}>Печать</Button>
                    <Link to="/invoices">Все накладные</Link>
                  </Space>
                ) : INVOICE_READY.includes(order.status) ? (
                  <Button onClick={createInvoice}>Сформировать накладную</Button>
                ) : (
                  <Typography.Text type="secondary">Доступна после передачи в доставку или готовности к выдаче.</Typography.Text>
                )}
              </Card>
            )}
          </Space>
        </Col>
      </Row>

      <Modal
        open={!!replacing}
        title={`Замена: ${replacing?.name ?? ""} · ${replacing?.packLabel ?? ""}`}
        okText="Заменить"
        cancelText="Отмена"
        okButtonProps={{ disabled: !replaceWith }}
        onOk={applyReplace}
        onCancel={() => setReplacing(null)}
      >
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Товар и фасовка"
          aria-label="Новый товар"
          style={{ width: "100%" }}
          loading={!products}
          value={replaceWith}
          onChange={setReplaceWith}
          options={packOptions}
        />
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Количество сохранится, цена — по прайсу режима «{MODE[order.mode].label}».
        </Typography.Text>
      </Modal>

      <PrintModal open={print === "sheet"} title="Сборочный лист" onClose={() => setPrint(null)}>
        <AssemblySheet order={order} pickup={settings?.pickupAddress} />
      </PrintModal>
      <PrintModal open={print === "invoice"} title={`Накладная ${invoice?.number ?? ""}`} onClose={() => setPrint(null)}>
        {invoice && <InvoicePrint invoice={invoice} />}
      </PrintModal>
    </Show>
  );
};

const td: React.CSSProperties = { border: "1px solid currentColor", padding: "6px 8px", textAlign: "left" };

const AssemblySheet = ({ order, pickup }: { order: Order; pickup?: string }) => (
  <div className="num" style={{ fontSize: 13 }}>
    <h2 style={{ margin: "0 0 8px" }}>Сборочный лист · заказ № {order.number}</h2>
    <p style={{ margin: "0 0 12px" }}>
      <b>Клиент:</b> {order.customerName}, {order.customerPhone}
      <br />
      {order.fulfilment === "delivery" ? (
        <>
          <b>Адрес:</b> {order.address ?? "—"} · <b>Слот:</b> {order.slot ?? "—"}
        </>
      ) : (
        <>
          <b>Самовывоз:</b> {pickup ?? "—"}
        </>
      )}
      {order.comment && (
        <>
          <br />
          <b>Комментарий:</b> {order.comment}
        </>
      )}
    </p>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={td}>✓</th>
          <th style={td}>Товар</th>
          <th style={td}>Фасовка</th>
          <th style={{ ...td, textAlign: "right" }}>Кол-во</th>
          <th style={td}>Факт. вес</th>
        </tr>
      </thead>
      <tbody>
        {order.items.map((i) => (
          <tr key={i.id}>
            <td style={{ ...td, width: 32 }}>☐</td>
            <td style={td}>
              {i.name}
              {i.preorder && " (предзаказ)"}
            </td>
            <td style={td}>{i.packLabel}</td>
            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{qty(i.qty, i.unit)}</td>
            <td style={{ ...td, width: 100 }}>{i.approximate ? (i.actualQty != null ? qty(i.actualQty, i.unit) : "") : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
