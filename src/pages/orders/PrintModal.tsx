import { PrinterOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";

// While open, only .print-area is printed (the modal lives in a portal, so the page behind would print too).
const css = `@media print {
  body * { visibility: hidden !important; }
  .print-area, .print-area * { visibility: visible !important; }
  .print-area { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; }
  @page { size: A4; margin: 12mm; }
}`;

export const PrintModal = ({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) => (
  <Modal
    open={open}
    title={title}
    onCancel={onClose}
    width={860}
    destroyOnHidden
    footer={[
      <Button key="close" onClick={onClose}>Закрыть</Button>,
      <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>Печать</Button>,
    ]}
  >
    {open && <style>{css}</style>}
    <div className="print-area">{children}</div>
  </Modal>
);
