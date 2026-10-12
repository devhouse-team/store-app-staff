import { List, useTable } from "@refinedev/antd";
import { useCreate, useDataProvider, useGetIdentity, useInvalidate, useList } from "@refinedev/core";
import { CheckCircleOutlined, DownloadOutlined, ExportOutlined, InboxOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Popconfirm, Space, Table, Tag, Typography, Upload } from "antd";
import { useState } from "react";
import type { Category, ImportJob, Product, Stock } from "../../types";
import { dateTime } from "../../lib/format";
import { newProductId, normalizePacks, stockUnit } from "../products/packs";
import { COLUMNS, TEMPLATE_EXAMPLE, downloadCsv, exportRows, parseCsv, validate, type ImportError } from "./csv";

type Parsed = { fileName: string } & ReturnType<typeof validate>;

const STATUS: Record<ImportJob["status"], { label: string; color: string; icon: React.ReactNode }> = {
  ok: { label: "Без ошибок", color: "blue", icon: <CheckCircleOutlined /> },
  errors: { label: "Есть ошибки", color: "red", icon: <WarningOutlined /> },
  applied: { label: "Применён", color: "green", icon: <CheckCircleOutlined /> },
};

const ErrorTable = ({ errors }: { errors: ImportError[] }) => (
  <Table
    dataSource={errors}
    rowKey={(e) => `${e.row}-${e.field}-${e.message}`}
    size="small"
    scroll={{ x: true }}
    pagination={errors.length > 20 ? { pageSize: 20 } : false}
    columns={[
      { title: "Строка", dataIndex: "row", width: 80 },
      { title: "Поле", dataIndex: "field" },
      { title: "Ошибка", dataIndex: "message" },
    ]}
  />
);

export const ImportList = () => {
  const { message } = App.useApp();
  const { data: me } = useGetIdentity<{ name: string }>();
  const { result: cats } = useList<Category>({ resource: "categories", pagination: { mode: "off" } });
  const { result: prods } = useList<Product>({ resource: "products", pagination: { mode: "off" } });
  const { result: stock } = useList<Stock>({ resource: "stock", pagination: { mode: "off" } });
  const { mutateAsync: createJob } = useCreate<ImportJob>();
  const dataProvider = useDataProvider();
  const invalidate = useInvalidate();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const { tableProps } = useTable<ImportJob>({
    resource: "imports",
    syncWithLocation: false,
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
  });

  const staff = me?.name ?? "—";
  const toCreate = parsed?.drafts.filter((d) => !d.existingId).length ?? 0;
  const toUpdate = (parsed?.drafts.length ?? 0) - toCreate;

  const job = (p: Partial<ImportJob>) =>
    createJob({
      resource: "imports",
      values: { fileName: parsed?.fileName, dryRun: true, status: "ok", rows: 0, created: 0, updated: 0, errors: [], staff, createdAt: new Date().toISOString(), ...p },
      successNotification: false,
    });

  const onFile = async (file: File) => {
    if (/\.xlsx?$/i.test(file.name)) {
      setParsed(null);
      // ponytail: Excel is parsed by the backend (B12); the mock only records the job.
      await job({ fileName: file.name });
      message.info("Файл Excel принят: разбор выполняется на сервере. В мок-режиме создана задача без строк — для проверки здесь загрузите CSV.");
      return;
    }
    const res = validate(parseCsv(await file.text()), { categories: cats.data, products: prods.data });
    setParsed({ fileName: file.name, ...res });
  };

  const dryRun = async () => {
    if (!parsed) return;
    await job({ dryRun: true, status: parsed.errors.length ? "errors" : "ok", rows: parsed.rows, created: toCreate, updated: toUpdate, errors: parsed.errors });
    message.success("Проверка сохранена в истории. Данные каталога не изменены.");
  };

  const apply = async () => {
    if (!parsed || parsed.errors.length) return;
    setBusy(true);
    const dp = dataProvider();
    const now = new Date().toISOString();
    const reason = `Импорт: ${parsed.fileName}`;
    try {
      for (const [i, d] of parsed.drafts.entries()) {
        const existing = prods.data.find((p) => p.id === d.existingId);
        const id = existing?.id ?? `${newProductId()}${i}`;
        // Keep pack ids by label so existing orders keep pointing at the same pack.
        const packs = normalizePacks(
          d.packs.map((k) => ({ ...k, id: existing?.packs.find((e) => e.label === k.label)?.id })),
          id,
        );
        if (existing) await dp.update({ resource: "products", id, variables: { ...d.product, packs } });
        else
          await dp.create({
            resource: "products",
            variables: { id, ...d.product, imageUrl: null, description: null, hidden: false, packs },
          });

        const s = stock.data.find((x) => x.id === id);
        const qty = d.stock ?? s?.quantity ?? 0;
        const delta = qty - (s?.quantity ?? 0);
        const stockVars = { productName: d.product.name, unit: stockUnit(d.product), quantity: qty };
        if (s) await dp.update({ resource: "stock", id, variables: stockVars });
        else await dp.create({ resource: "stock", variables: { id, productId: id, reserved: 0, lowThreshold: 5, ...stockVars } });
        if (delta)
          await dp.create({
            resource: "stock_movements",
            variables: { productId: id, productName: d.product.name, delta, reason, staff, createdAt: now },
          });
      }
      await job({ dryRun: false, status: "applied", rows: parsed.rows, created: toCreate, updated: toUpdate });
      message.success(`Импорт применён: создано ${toCreate}, обновлено ${toUpdate}`);
      setParsed(null);
    } catch (e) {
      message.error(`Импорт прерван: ${(e as Error)?.message ?? "ошибка"}. Часть строк могла сохраниться — повторите импорт.`);
    } finally {
      await invalidate({ resource: "products", invalidates: ["list", "many", "detail"] });
      await invalidate({ resource: "stock", invalidates: ["list", "many", "detail"] });
      await invalidate({ resource: "stock_movements", invalidates: ["list"] });
      setBusy(false);
    }
  };

  const exportCatalog = () => {
    const qty = new Map(stock.data.map((s) => [s.id, s.quantity]));
    downloadCsv(`catalog_${new Date().toISOString().slice(0, 10)}.csv`, [[...COLUMNS], ...exportRows(prods.data, cats.data, qty)]);
  };

  return (
    <List
      headerButtons={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => downloadCsv("tolyq_import_template.csv", [[...COLUMNS], ...TEMPLATE_EXAMPLE])}>
            Скачать шаблон
          </Button>
          <Button icon={<ExportOutlined />} onClick={exportCatalog} disabled={!prods.data.length}>
            Экспорт каталога
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Card size="small" title="Загрузка файла">
          <Upload.Dragger
            accept=".csv,.xlsx"
            multiple={false}
            showUploadList={false}
            beforeUpload={(f) => {
              onFile(f);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Перетащите файл или нажмите, чтобы выбрать</p>
            <p className="ant-upload-hint">CSV по шаблону (разделитель «;» или «,», UTF-8). Excel (.xlsx) разбирается на сервере.</p>
          </Upload.Dragger>
        </Card>

        {parsed && (
          <Card size="small" title={`Файл: ${parsed.fileName}`}>
            <Space direction="vertical" style={{ width: "100%" }}>
              {parsed.errors.length ? (
                <Alert
                  type="error"
                  showIcon
                  message={`Найдено ошибок: ${parsed.errors.length}. Исправьте файл и загрузите снова — применить можно только файл без ошибок.`}
                />
              ) : (
                <Alert type="success" showIcon message="Ошибок не найдено" />
              )}
              <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>
                Строк: {parsed.rows} · товаров: {parsed.drafts.length} · будет создано: {toCreate} · будет обновлено: {toUpdate}
              </Typography.Text>
              <Space wrap>
                <Button onClick={dryRun} disabled={busy}>
                  Проверить без сохранения
                </Button>
                <Popconfirm
                  title="Применить импорт?"
                  description={`Создать ${toCreate} и обновить ${toUpdate} товаров, обновить остатки.`}
                  okText="Применить"
                  cancelText="Отмена"
                  onConfirm={apply}
                  disabled={!!parsed.errors.length || !parsed.drafts.length}
                >
                  <Button type="primary" loading={busy} disabled={!!parsed.errors.length || !parsed.drafts.length}>
                    Применить
                  </Button>
                </Popconfirm>
              </Space>
              {parsed.errors.length > 0 && <ErrorTable errors={parsed.errors} />}
            </Space>
          </Card>
        )}

        <Card size="small" title="История импортов">
          <Table
            {...tableProps}
            rowKey="id"
            size="small"
            scroll={{ x: true }}
            locale={{ emptyText: "Импортов ещё не было" }}
            expandable={{
              rowExpandable: (j) => j.errors.length > 0,
              expandedRowRender: (j) => <ErrorTable errors={j.errors} />,
            }}
            columns={[
              { title: "Файл", dataIndex: "fileName" },
              { title: "Дата", dataIndex: "createdAt", render: dateTime, sorter: true },
              { title: "Сотрудник", dataIndex: "staff" },
              { title: "Режим", dataIndex: "dryRun", render: (v) => (v ? "Проверка" : "Применение") },
              { title: "Строк", dataIndex: "rows", align: "right" },
              {
                title: "Создано / обновлено",
                key: "cu",
                align: "right",
                render: (_, j) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{j.created} / {j.updated}</span>,
              },
              {
                title: "Статус",
                dataIndex: "status",
                render: (s: ImportJob["status"], j) => (
                  <Tag color={STATUS[s].color} icon={STATUS[s].icon}>
                    {STATUS[s].label}
                    {j.errors.length ? ` (${j.errors.length})` : ""}
                  </Tag>
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </List>
  );
};
