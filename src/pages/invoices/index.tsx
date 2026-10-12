import { PrinterOutlined } from "@ant-design/icons";
import { List, useTable } from "@refinedev/antd";
import { Button, Table, Tooltip } from "antd";
import { useState } from "react";
import { Link } from "react-router";
import { dateTime, tenge } from "../../lib/format";
import type { Invoice } from "../../types";
import { PrintModal } from "../orders/PrintModal";
import { InvoicePrint } from "./InvoicePrint";

export { InvoicePrint };

export const InvoiceList = () => {
  const { tableProps } = useTable<Invoice>({ sorters: { initial: [{ field: "createdAt", order: "desc" }] }, syncWithLocation: false });
  const [printing, setPrinting] = useState<Invoice | null>(null);

  return (
    <List>
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }}>
        <Table.Column<Invoice> dataIndex="number" title="Номер" />
        <Table.Column<Invoice> dataIndex="orderNumber" title="Заказ" render={(n, r) => <Link to={`/orders/${r.orderId}`}>№ {n}</Link>} />
        <Table.Column<Invoice> dataIndex="customerName" title="Покупатель" />
        <Table.Column<Invoice> dataIndex="bin" title="БИН" render={(v) => v ?? "—"} />
        <Table.Column<Invoice> dataIndex="total" title="Сумма" align="right" render={(v) => tenge(v)} />
        <Table.Column<Invoice> dataIndex="vat" title="НДС" align="right" render={(v) => tenge(v)} />
        <Table.Column<Invoice> dataIndex="createdAt" title="Дата" render={dateTime} />
        <Table.Column<Invoice>
          key="print"
          render={(_, r) => (
            <Tooltip title="Печать">
              <Button size="small" icon={<PrinterOutlined />} aria-label={`Печать накладной ${r.number}`} onClick={() => setPrinting(r)} />
            </Tooltip>
          )}
        />
      </Table>
      <PrintModal open={!!printing} title={`Накладная ${printing?.number ?? ""}`} onClose={() => setPrinting(null)}>
        {printing && <InvoicePrint invoice={printing} />}
      </PrintModal>
    </List>
  );
};
