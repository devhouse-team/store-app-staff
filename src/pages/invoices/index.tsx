import { FilePdfOutlined, ReloadOutlined } from "@ant-design/icons";
import { List, useTable } from "@refinedev/antd";
import { useCustomMutation, useDataProvider, useNotification } from "@refinedev/core";
import { Button, Popconfirm, Space, Table, Tooltip } from "antd";
import { useState } from "react";
import { Link } from "react-router";
import { dateTime, tenge } from "../../lib/format";
import type { Invoice } from "../../types";

/** Opens the server-generated PDF. The list has no links, so the detail call returns a fresh signed URL. */
export const useOpenInvoice = () => {
  const dp = useDataProvider();
  const { open } = useNotification();
  const [busy, setBusy] = useState<string>();
  const openPdf = async (id: string) => {
    const tab = window.open("", "_blank"); // open synchronously so popup blockers allow it
    setBusy(id);
    try {
      const { data } = await dp().getOne<Invoice>({ resource: "invoices", id });
      if (!data.url) throw new Error("Файл накладной ещё не готов");
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
    } catch (e) {
      tab?.close();
      open?.({ type: "error", message: "Не удалось открыть накладную", description: (e as Error).message });
    } finally {
      setBusy(undefined);
    }
  };
  return { openPdf, busy };
};

export const InvoiceList = () => {
  const { tableProps, tableQuery } = useTable<Invoice>({ syncWithLocation: false });
  const { openPdf, busy } = useOpenInvoice();
  const { mutate: regenerate, mutation } = useCustomMutation();

  return (
    <List>
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }}>
        <Table.Column<Invoice> dataIndex="number" title="Номер" />
        <Table.Column<Invoice> dataIndex="orderId" title="Заказ" render={(id) => <Link to={`/orders/${id}`}>Открыть заказ</Link>} />
        <Table.Column<Invoice> dataIndex="total" title="Сумма" align="right" render={(v) => tenge(v)} />
        <Table.Column<Invoice> dataIndex="vat" title="НДС" align="right" render={(v, r) => <Tooltip title={`${r.vatRate}%`}>{tenge(v)}</Tooltip>} />
        <Table.Column<Invoice> dataIndex="createdAt" title="Дата" render={dateTime} />
        <Table.Column<Invoice>
          key="actions"
          render={(_, r) => (
            <Space>
              <Tooltip title="Открыть PDF">
                <Button size="small" icon={<FilePdfOutlined />} loading={busy === r.id} aria-label={`PDF накладной ${r.number}`} onClick={() => openPdf(r.id)} />
              </Tooltip>
              <Popconfirm
                title="Переформировать накладную?"
                description="PDF соберётся заново по текущему составу заказа и реквизитам."
                okText="Переформировать"
                cancelText="Отмена"
                onConfirm={() =>
                  regenerate(
                    {
                      url: `/admin/invoices/${r.id}/regenerate`,
                      method: "post",
                      values: {},
                      successNotification: { type: "success", message: `Накладная ${r.number} переформирована` },
                    },
                    { onSuccess: () => tableQuery.refetch() },
                  )
                }
              >
                <Tooltip title="Переформировать">
                  <Button size="small" icon={<ReloadOutlined />} loading={mutation.isPending} aria-label={`Переформировать ${r.number}`} />
                </Tooltip>
              </Popconfirm>
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
