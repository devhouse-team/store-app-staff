import { useOne } from "@refinedev/core";
import { Spin } from "antd";
import { date, qty, tenge } from "../../lib/format";
import type { Invoice, Order, Settings } from "../../types";

const cell: React.CSSProperties = { border: "1px solid currentColor", padding: "4px 6px", textAlign: "left" };
const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };

/** A4 invoice (накладная) body. Rendered inside PrintModal. */
export const InvoicePrint = ({ invoice }: { invoice: Invoice }) => {
  const { result: order, query: oq } = useOne<Order>({ resource: "orders", id: invoice.orderId });
  const { result: s, query: sq } = useOne<Settings>({ resource: "settings", id: "main" });
  if (oq.isLoading || sq.isLoading) return <Spin />;

  return (
    <div className="num" style={{ fontSize: 12, lineHeight: 1.45 }}>
      <h2 style={{ textAlign: "center", margin: "0 0 12px" }}>
        Накладная № {invoice.number} от {date(invoice.createdAt)}
      </h2>
      <p style={{ margin: "0 0 4px" }}>
        <b>Поставщик:</b> {s?.legalName}, БИН {s?.bin}, {s?.legalAddress}
        <br />
        Банк: {s?.bank}, IBAN {s?.iban}
      </p>
      <p style={{ margin: "0 0 12px" }}>
        <b>Покупатель:</b> {invoice.customerName}
        {invoice.bin ? `, БИН ${invoice.bin}` : ""}
        <br />
        Основание: заказ № {invoice.orderNumber}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cell}>№</th>
            <th style={cell}>Наименование</th>
            <th style={cell}>Фасовка</th>
            <th style={num}>Кол-во</th>
            <th style={num}>Цена</th>
            <th style={num}>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {order?.items.map((i, n) => (
            <tr key={i.id}>
              <td style={cell}>{n + 1}</td>
              <td style={cell}>{i.name}</td>
              <td style={cell}>{i.packLabel}</td>
              <td style={num}>{qty(i.actualQty ?? i.qty, i.unit)}</td>
              <td style={num}>{tenge(i.unitPrice)}</td>
              <td style={num}>{tenge(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ marginLeft: "auto", marginTop: 8 }}>
        <tbody>
          {!!order?.discount && <tr><td>Скидка:</td><td style={num}>−{tenge(order.discount)}</td></tr>}
          {!!order?.deliveryFee && <tr><td>Доставка:</td><td style={num}>{tenge(order.deliveryFee)}</td></tr>}
          <tr><td><b>Итого:</b></td><td style={num}><b>{tenge(invoice.total)}</b></td></tr>
          <tr><td>в т.ч. НДС {s?.vatRate ?? 12}%:</td><td style={num}>{tenge(invoice.vat)}</td></tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40 }}>
        <span>Отпустил: ____________________</span>
        <span>Получил: ____________________</span>
      </div>
    </div>
  );
};
