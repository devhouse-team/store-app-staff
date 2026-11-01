import { List, useTable } from "@refinedev/antd";
import { useCustomMutation, useInvalidate, useNotification, useOne } from "@refinedev/core";
import { CheckCircleOutlined, DownloadOutlined, ExportOutlined, InboxOutlined, SyncOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Typography, Upload } from "antd";
import { useState } from "react";
import type { ImportJob } from "../../types";
import { dateTime } from "../../lib/format";
import { download } from "../../providers/api";

// The backend parses and validates the file (.xlsx or .csv by its template) — B12.
type Result = {
  id: number; status: ImportJob["status"]; dry_run: boolean; total_rows: number; ok_rows: number; error_rows: number;
  summary: Record<string, number | string>; errors?: { row_number: number | null; level: string; message: string }[];
};

const STATUS: Record<ImportJob["status"], { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "В очереди", color: "default", icon: <SyncOutlined /> },
  running: { label: "Выполняется", color: "blue", icon: <SyncOutlined spin /> },
  completed: { label: "Готово", color: "green", icon: <CheckCircleOutlined /> },
  failed: { label: "Ошибка", color: "red", icon: <WarningOutlined /> },
};
const STATS: Record<string, string> = {
  products_created: "товаров создано", products_updated: "товаров обновлено", packs_created: "фасовок создано",
  packs_updated: "фасовок обновлено", stock_changed: "остатков изменено", categories_created: "категорий создано",
};
const statsLine = (s: Record<string, unknown>) =>
  typeof s.error === "string" ? s.error : Object.entries(STATS).map(([k, l]) => `${l}: ${s[k] ?? 0}`).join(" · ");

const ErrorTable = ({ errors }: { errors: { row: number | null; message: string }[] }) => (
  <Table
    dataSource={errors}
    rowKey={(e) => `${e.row}-${e.message}`}
    size="small"
    scroll={{ x: true }}
    pagination={errors.length > 20 ? { pageSize: 20 } : false}
    columns={[
      { title: "Строка", dataIndex: "row", width: 80, render: (v) => v ?? "—" },
      { title: "Ошибка", dataIndex: "message" },
    ]}
  />
);

const JobErrors = ({ id }: { id: string }) => {
  const { result, query } = useOne<ImportJob>({ resource: "imports", id });
  if (query.isLoading) return <Typography.Text type="secondary">Загрузка…</Typography.Text>;
  return <ErrorTable errors={result?.errors ?? []} />;
};

export const ImportList = () => {
  const { open } = useNotification();
  const invalidate = useInvalidate();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<Result | null>(null);
  const { mutateAsync: upload, mutation } = useCustomMutation<Result>();
  const { tableProps, tableQuery } = useTable<ImportJob>({ resource: "imports", syncWithLocation: false });

  const send = async (dryRun: boolean) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("dry_run", String(dryRun));
    const { data } = await upload({ url: "/admin/import/upload", method: "post", values: form as never, successNotification: false });
    await tableQuery.refetch();
    if (dryRun) return setChecked(data);
    open?.({
      type: data.status === "failed" ? "error" : "success",
      message: data.status === "pending" ? "Файл большой — импорт выполняется в фоне" : `Импорт: ${STATUS[data.status].label.toLowerCase()}`,
      description: statsLine(data.summary),
    });
    setFile(null);
    setChecked(null);
    for (const resource of ["products", "stock", "categories"]) await invalidate({ resource, invalidates: ["list", "many", "detail"] });
  };
  const fail = (e: Error) => open?.({ type: "error", message: "Не удалось скачать файл", description: e.message });

  return (
    <List
      headerButtons={
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => download("/admin/import/template", "tolyq_import_template.xlsx", { examples: true }).catch(fail)}>
            Скачать шаблон
          </Button>
          <Button icon={<ExportOutlined />} onClick={() => download("/admin/import/export", `catalog_${new Date().toISOString().slice(0, 10)}.xlsx`).catch(fail)}>
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
              setFile(f);
              setChecked(null);
              return false;
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">{file ? file.name : "Перетащите файл или нажмите, чтобы выбрать"}</p>
            <p className="ant-upload-hint">Excel (.xlsx) или CSV по шаблону. Сначала проверьте файл без сохранения.</p>
          </Upload.Dragger>
          {file && (
            <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>
              {checked &&
                (checked.error_rows ? (
                  <Alert type="error" showIcon message={`Строк с ошибками: ${checked.error_rows} из ${checked.total_rows}. Исправьте файл и загрузите снова.`} />
                ) : (
                  <Alert type="success" showIcon message={`Ошибок не найдено. Строк: ${checked.total_rows}.`} description={statsLine(checked.summary)} />
                ))}
              <Space wrap>
                <Button onClick={() => send(true)} loading={mutation.isPending}>Проверить без сохранения</Button>
                <Popconfirm title="Применить импорт?" description="Товары, фасовки и остатки обновятся по файлу." okText="Применить" cancelText="Отмена"
                  onConfirm={() => send(false)} disabled={!checked || !!checked.error_rows}>
                  <Button type="primary" loading={mutation.isPending} disabled={!checked || !!checked.error_rows}>Применить</Button>
                </Popconfirm>
              </Space>
              {!!checked?.errors?.length && <ErrorTable errors={checked.errors.map((e) => ({ row: e.row_number, message: e.message }))} />}
            </Space>
          )}
        </Card>

        <Card size="small" title="История импортов">
          <Table
            {...tableProps}
            rowKey="id"
            size="small"
            scroll={{ x: true }}
            locale={{ emptyText: "Импортов ещё не было" }}
            expandable={{ rowExpandable: (j) => j.errorRows > 0, expandedRowRender: (j) => <JobErrors id={j.id} /> }}
            columns={[
              { title: "Файл", dataIndex: "fileName", render: (v) => v ?? "—" },
              { title: "Дата", dataIndex: "createdAt", render: dateTime },
              { title: "Режим", dataIndex: "dryRun", render: (v) => (v ? "Проверка" : "Применение") },
              { title: "Строк", dataIndex: "rows", align: "right" },
              { title: "С ошибками", dataIndex: "errorRows", align: "right" },
              { title: "Итог", dataIndex: "summary", render: (s: ImportJob["summary"]) => <Typography.Text type="secondary">{statsLine(s)}</Typography.Text> },
              {
                title: "Статус",
                dataIndex: "status",
                render: (s: ImportJob["status"]) => <Tag color={STATUS[s].color} icon={STATUS[s].icon}>{STATUS[s].label}</Tag>,
              },
            ]}
          />
        </Card>
      </Space>
    </List>
  );
};
