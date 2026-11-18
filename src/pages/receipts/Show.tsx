import { Show } from "@refinedev/antd";
import { useGetIdentity, useNavigation, useSelect, type HttpError } from "@refinedev/core";
import { DeleteOutlined, LoadingOutlined, MinusOutlined, PlusOutlined, ScanOutlined } from "@ant-design/icons";
import { App, Button, Card, DatePicker, Grid, Input, InputNumber, Popconfirm, Result, Select, Space, Table, Tag, Typography, theme, type RefSelectProps } from "antd";
import { useEffect, useRef, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { useParams } from "react-router";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { useKeyboardScanner } from "../../components/useKeyboardScanner";
import { RECEIPT_STATUS, date, dateTime, plural, qty, tenge } from "../../lib/format";
import { useCan, type StaffIdentity } from "../../providers/auth";
import { receiptApi } from "../../providers/data";
import type { Pack, Product } from "../../types";
import { SupplierSelect } from "../suppliers";
import { NewProductModal } from "./NewProductModal";
import { round3, useReceipt } from "./useReceipt";

const BARCODE = /^\d{8,14}$/;

/** One line on screen: a saved item with pending edits applied. */
type Row = {
  key: string;
  itemId: string;
  productId: string;
  name: string;
  sku: string;
  baseUnit: string;
  packId: string | null;
  packName: string | null;
  packs: Pack[] | null; // null = not loaded → pack select locked to the current pack
  packQty: number | null;
  unitCost: number | null;
  lineTotal: number | null;
  baseQty: number | null;
};

// Remount per receipt so state never leaks from one receipt to the next.
export const ReceiptShow = () => {
  const { id = "" } = useParams();
  return <ReceiptScreen key={id} id={id} />;
};

const ReceiptScreen = ({ id }: { id: string }) => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const wide = !!Grid.useBreakpoint().md;
  const canWrite = useCan("stock.write");
  const canCatalogRead = useCan("catalog.read");
  const { data: me } = useGetIdentity<StaffIdentity>();
  const { list } = useNavigation();
  const rc = useReceipt(id, canCatalogRead);
  const { receipt, pendingView, saving, errorItemId, fieldErrors, lastCost, priceCheck, focusId } = rc;
  const readOnly = !receipt || receipt.status === "posted" || !canWrite;

  const [scanning, setScanning] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<RefSelectProps>(null);
  const audio = useRef<AudioContext | null>(null);
  const confirming = useRef(false);
  const [headerKey, setHeaderKey] = useState(0); // bumped when a header save fails → inputs show the server value
  useEffect(() => () => void audio.current?.close().catch(() => undefined), []);
  const startScan = () => {
    // iOS only lets audio start from a tap, so the scanner's beep context is created here
    try {
      audio.current ??= new AudioContext();
      audio.current.resume().catch(() => undefined);
    } catch {
      /* no Web Audio */
    }
    setScanning(true);
  };
  const { options: productOptions, onSearch, query: productQuery } = useSelect<Product>({
    resource: "products",
    optionLabel: (p) => `${p.name} · ${p.sku}`,
    searchField: "name",
    // no hidden filter: inactive products (e.g. just created from a scan) can be received
    queryOptions: { enabled: canCatalogRead && !readOnly },
  });

  useEffect(() => {
    const el = errorItemId && document.getElementById(`line-${errorItemId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const price = el.querySelector<HTMLInputElement>('input[aria-label^="Цена"]');
    if (price && !price.value) price.focus({ preventScroll: true }); // e.g. item_no_price on «Провести»
  }, [errorItemId]);

  /** Camera hit or hardware-scanner Enter. Resolves to the product name for the scanner flash. */
  const lookup = async (code: string) => {
    try {
      const p = await receiptApi.byBarcode(code);
      return (await rc.addProduct(p)) ? p.name : null;
    } catch (e) {
      const err = e as HttpError;
      if (err.code === "product_not_found") {
        setScanning(false); // releases the camera
        setNewCode(code);
      } else message.error(err.message);
      return null;
    }
  };

  useKeyboardScanner((code) => void lookup(code), !readOnly);

  if (rc.notFound) return <Result status="404" title="Приёмка не найдена" />;
  if (!receipt) return <Show isLoading title="Приёмка" />;

  const rows: Row[] = [
    ...[...receipt.items].reverse().map((i): Row => {
      const pv = pendingView[i.id] ?? {};
      const packs = rc.packs[i.productId] ?? null;
      const packId = "packId" in pv ? (pv.packId ?? i.packId) : i.packId;
      return {
        key: i.id, itemId: i.id, productId: i.productId, name: i.productName, sku: i.sku, baseUnit: i.baseUnit,
        packId, packName: packs?.find((k) => k.id === packId)?.label ?? i.packName, packs,
        packQty: "packQty" in pv ? (pv.packQty ?? null) : i.packQty,
        unitCost: "unitCost" in pv ? (pv.unitCost ?? null) : i.unitCost,
        lineTotal: i.lineTotal, baseQty: i.baseQty,
      };
    }),
  ];

  const setQty = (r: Row, v: number | null) => rc.setField(r.itemId, "packQty", v);
  const commitPrice = (r: Row) => {
    rc.checkPrice(r.itemId, false); // leaving the price field confirms it
    rc.commit(r.itemId);
  };

  /** Controls for one row, shared by the phone cards and the desktop table. */
  const ctl = (r: Row) => {
    const err = fieldErrors[r.itemId];
    const lc = lastCost[r.productId];
    const hint =
      lc && lc.packId === r.packId && r.unitCost != null && Math.abs(r.unitCost - lc.unitCost) >= 1 ? (
        <Typography.Text type={r.unitCost > lc.unitCost ? "warning" : "success"} style={{ fontSize: 12 }}>
          {r.unitCost > lc.unitCost ? "↑" : "↓"} было {tenge(lc.unitCost)} → {tenge(r.unitCost)} ({r.unitCost > lc.unitCost ? "+" : "−"}
          {tenge(Math.abs(r.unitCost - lc.unitCost))})
        </Typography.Text>
      ) : null;
    const total = r.lineTotal == null ? (
      <Typography.Text type="warning">Укажите цену</Typography.Text>
    ) : (
      <span className="num" style={{ fontWeight: 600 }}>{tenge(r.lineTotal)}</span>
    );
    const base = r.baseQty != null ? <Typography.Text type="secondary" className="num">= {qty(r.baseQty, r.baseUnit)}</Typography.Text> : null;
    if (readOnly)
      return {
        pack: r.packName ?? "—",
        qty: <span className="num">{r.packQty}</span>,
        price: <span className="num">{tenge(r.unitCost)}</span>,
        hint: null, total, base, remove: null,
      };
    return {
      pack: (
        <Select
          aria-label={`Фасовка: ${r.name}`}
          value={r.packId}
          disabled={!r.packs}
          options={(r.packs ?? [{ id: r.packId ?? "", label: r.packName ?? "—" }]).map((k) => ({ value: k.id, label: k.label }))}
          status={err?.packId ? "error" : undefined}
          onChange={(v) => rc.changePack(r.itemId, r.productId, v)}
          style={{ width: "100%", minWidth: wide ? 110 : undefined }}
        />
      ),
      qty: (
        <Space.Compact style={{ width: "100%" }}>
          <Button icon={<MinusOutlined />} aria-label="Меньше" disabled={(r.packQty ?? 0) <= 1} onClick={() => setQty(r, round3((r.packQty ?? 1) - 1))} />
          <InputNumber
            aria-label={`Количество: ${r.name}`}
            value={r.packQty}
            min={0.001}
            precision={3}
            step={1}
            controls={false}
            inputMode="decimal"
            status={err?.packQty ? "error" : undefined}
            onChange={(v) => setQty(r, v)}
            onBlur={() => rc.commit(r.itemId)}
            onPressEnter={() => rc.commit(r.itemId)}
            style={{ flex: 1, minWidth: wide ? 64 : 0 }}
          />
          <Button icon={<PlusOutlined />} aria-label="Больше" onClick={() => setQty(r, round3((r.packQty ?? 0) + 1))} />
        </Space.Compact>
      ),
      price: (
        <InputNumber
          aria-label={`Цена за фасовку: ${r.name}`}
          value={r.unitCost}
          min={0}
          precision={2}
          addonAfter="₸"
          inputMode="decimal"
          placeholder="Укажите цену"
          autoFocus={!scanning && r.itemId === focusId}
          status={
            err?.unitCost || (r.itemId === errorItemId && r.unitCost == null)
              ? "error"
              : priceCheck[r.itemId] || r.unitCost == null
                ? "warning"
                : undefined
          }
          onChange={(v) => rc.setField(r.itemId, "unitCost", v)}
          onBlur={() => commitPrice(r)}
          onPressEnter={() => commitPrice(r)}
          style={{ width: "100%", minWidth: wide ? 120 : undefined }}
        />
      ),
      hint: priceCheck[r.itemId] ? (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          Проверьте цену за новую фасовку
        </Typography.Text>
      ) : (
        hint
      ),
      total, base,
      remove: (
        <Popconfirm title="Удалить позицию?" okText="Удалить" cancelText="Отмена" onConfirm={() => rc.remove(r.itemId)}>
          <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Удалить: ${r.name}`} />
        </Popconfirm>
      ),
    };
  };
  const errorStyle = (r: Row) => (r.itemId === errorItemId ? { outline: `2px solid ${token.colorError}`, outlineOffset: -2 } : undefined);
  const spin = (r: Row) => (saving[r.itemId] ? <LoadingOutlined aria-label="Сохраняется" /> : null);

  const n = receipt.items.length;
  const actions = canWrite && receipt.status === "draft";
  const unpriced = receipt.items.filter((i) => i.unitCost == null).length;
  // No "saving" disable: the tap itself blurs an input and starts a save; settle() waits for it instead.
  const confirmPost = async () => {
    if (confirming.current) return; // one modal per tap burst
    confirming.current = true;
    const r = await rc.settle(); // pending edits saved first: the confirm shows the total that gets posted
    const first = r.items.find((i) => i.unitCost == null);
    if (r.status !== "draft" || !r.items.length || first) {
      confirming.current = false;
      if (first) {
        message.warning("Укажите цену");
        rc.markError(first.id);
      }
      return;
    }
    modal.confirm({
      title: `Провести приёмку на ${tenge(r.total)}?`,
      content: "Остатки увеличатся, изменить её будет нельзя.",
      okText: "Провести",
      cancelText: "Отмена",
      onOk: () => rc.post(),
      afterClose: () => (confirming.current = false),
    });
  };

  const saveHeader = (v: Parameters<typeof rc.updateHeader>[0]) =>
    rc.updateHeader(v).then((ok) => ok || setHeaderKey((k) => k + 1));

  const staff = receipt.staffId && me && String(me.id) === receipt.staffId ? me.name : receipt.staffId ? `сотрудник #${receipt.staffId}` : null;
  const lineCell = (r: Row, node: ReactNode) => (
    <div key={r.key} id={`line-${r.key}`}>
      {node}
    </div>
  );

  return (
    <Show title={`Приёмка #${receipt.id}`} headerButtons={() => null}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {readOnly ? (
          <Card size="small">
            <Space direction="vertical" size={2}>
              <Space wrap size={8}>
                <Typography.Text strong style={{ fontSize: 16 }}>{receipt.supplierName}</Typography.Text>
                <Tag color={RECEIPT_STATUS[receipt.status].color}>{RECEIPT_STATUS[receipt.status].label}</Tag>
              </Space>
              <Typography.Text type="secondary">
                {date(receipt.docDate)}
                {receipt.docNumber && ` · накладная № ${receipt.docNumber}`}
              </Typography.Text>
              {receipt.postedAt && (
                <Typography.Text type="secondary">
                  Проведена {dateTime(receipt.postedAt)}
                  {staff && ` · ${staff}`}
                </Typography.Text>
              )}
              {receipt.comment && <Typography.Text>{receipt.comment}</Typography.Text>}
            </Space>
          </Card>
        ) : (
          // Editable draft header (PATCH /receipts/{id}): selects save on change, text fields on blur.
          <Card size="small">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <SupplierSelect
                  aria-label="Поставщик"
                  value={receipt.supplierId}
                  known={[{ value: receipt.supplierId, label: receipt.supplierName }]}
                  onChange={(supplierId) => supplierId !== receipt.supplierId && saveHeader({ supplierId })}
                  style={{ width: "100%" }}
                />
              </div>
              <Input
                key={`n-${headerKey}-${receipt.docNumber}`}
                aria-label="№ накладной"
                placeholder="№ накладной"
                defaultValue={receipt.docNumber ?? ""}
                maxLength={64}
                onBlur={(e) => e.target.value.trim() !== (receipt.docNumber ?? "") && saveHeader({ docNumber: e.target.value })}
              />
              <DatePicker
                aria-label="Дата накладной"
                format="DD.MM.YYYY"
                inputReadOnly
                allowClear={false}
                value={dayjs(receipt.docDate)}
                onChange={(d) => d && saveHeader({ docDate: d.format("YYYY-MM-DD") })}
                style={{ width: "100%" }}
              />
              <Input
                key={`c-${headerKey}-${receipt.comment}`}
                aria-label="Комментарий"
                placeholder="Комментарий"
                defaultValue={receipt.comment ?? ""}
                maxLength={1000}
                onBlur={(e) => e.target.value.trim() !== (receipt.comment ?? "") && saveHeader({ comment: e.target.value })}
                style={{ gridColumn: "1 / -1" }}
              />
            </div>
          </Card>
        )}

        {!readOnly && (
          // Capture phase: a hardware scanner types digits + Enter; take it before the Select picks an option.
          <div
            onKeyDownCapture={(e) => {
              if (e.key !== "Enter" || !BARCODE.test(search.trim())) return;
              e.preventDefault();
              e.stopPropagation();
              lookup(search.trim());
              setSearch("");
            }}
          >
            <Select
              ref={searchRef}
              showSearch
              value={null}
              searchValue={search}
              filterOption={false}
              autoFocus={wide}
              aria-label="Добавить товар"
              placeholder={canCatalogRead ? "Название, артикул или штрихкод" : "Штрихкод (сканером или вручную)"}
              options={canCatalogRead ? productOptions : []}
              loading={productQuery.isFetching}
              notFoundContent={canCatalogRead && search ? "Ничего не найдено" : null}
              onSearch={(v) => {
                setSearch(v);
                if (canCatalogRead) onSearch(v);
              }}
              onSelect={(v) => {
                const p = productQuery.data?.data.find((x) => x.id === v);
                if (p) rc.addProduct(p);
                setSearch("");
              }}
              style={{ width: "100%" }}
              size="large"
            />
          </div>
        )}

        {rows.length === 0 ? (
          <Typography.Text type="secondary">
            {readOnly ? "Позиций нет" : "Позиций пока нет. Отсканируйте товар или найдите его по названию."}
          </Typography.Text>
        ) : wide ? (
          <Table<Row>
            dataSource={rows}
            rowKey="key"
            size="small"
            pagination={false}
            scroll={{ x: true }}
            onRow={(r) => ({ id: `line-${r.key}`, style: errorStyle(r) })}
            columns={[
              {
                title: "Товар",
                key: "name",
                render: (_, r) => (
                  <Space direction="vertical" size={0}>
                    <Space size={6}>
                      <Typography.Text strong>{r.name}</Typography.Text>
                      {spin(r)}
                    </Space>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.sku}</Typography.Text>
                  </Space>
                ),
              },
              { title: "Фасовка", key: "pack", width: 160, render: (_, r) => ctl(r).pack },
              { title: "Количество", key: "qty", width: 170, render: (_, r) => ctl(r).qty },
              {
                title: "Цена за фасовку",
                key: "price",
                width: 200,
                render: (_, r) => {
                  const c = ctl(r);
                  return (
                    <Space direction="vertical" size={0} style={{ width: "100%" }}>
                      {c.price}
                      {c.hint}
                    </Space>
                  );
                },
              },
              {
                title: "Сумма",
                key: "total",
                align: "right",
                render: (_, r) => {
                  const c = ctl(r);
                  return (
                    <Space direction="vertical" size={0} align="end">
                      {c.total}
                      {c.base}
                    </Space>
                  );
                },
              },
              ...(readOnly ? [] : [{ key: "remove", width: 48, render: (_: unknown, r: Row) => ctl(r).remove }]),
            ]}
          />
        ) : (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {rows.map((r) => {
              const c = ctl(r);
              return lineCell(
                r,
                <Card size="small" style={errorStyle(r)}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text strong>{r.name}</Typography.Text> {spin(r)}
                      <div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.sku}</Typography.Text>
                      </div>
                    </div>
                    {c.remove}
                  </div>
                  {readOnly ? (
                    <Typography.Text className="num">
                      {c.pack} × {c.qty} по {c.price}
                    </Typography.Text>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8, marginTop: 8 }}>
                      <div style={{ gridColumn: "1 / -1" }}>{c.pack}</div>
                      {c.qty}
                      {c.price}
                    </div>
                  )}
                  {c.hint && <div style={{ marginTop: 4 }}>{c.hint}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                    {c.base ?? <span />}
                    {c.total}
                  </div>
                </Card>,
              );
            })}
          </Space>
        )}
      </Space>

      <div
        style={{
          position: "sticky", bottom: 0, zIndex: 10, margin: "12px -4px 0", padding: "10px 4px calc(10px + env(safe-area-inset-bottom))",
          background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <Typography.Text className="num" strong>
            {n} {plural(n, "позиция", "позиции", "позиций")} · {tenge(receipt.total)}
          </Typography.Text>
          {unpriced > 0 && <Typography.Text type="warning">Укажите цену: {unpriced}</Typography.Text>}
        </div>
        {actions && (
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="primary" size="large" icon={<ScanOutlined />} onClick={startScan} style={{ flex: 1 }}>
              Сканировать
            </Button>
            <Button size="large" disabled={!n} onClick={confirmPost}>
              Провести
            </Button>
          </div>
        )}
        {!actions && (
          <Button type="primary" size="large" block onClick={() => list("receipts")}>
            К списку приёмок
          </Button>
        )}
      </div>

      {scanning && (
        <BarcodeScanner
          audio={audio.current}
          onDetected={lookup}
          onClose={() => {
            setScanning(false);
            searchRef.current?.focus();
          }}
        />
      )}
      {newCode && <NewProductModal code={newCode} onClose={() => setNewCode(null)} onCreated={(p) => rc.addProduct(p)} />}
    </Show>
  );
};
