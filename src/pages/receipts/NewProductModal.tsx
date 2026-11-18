// Unknown barcode during receiving: quick product create (one pack) or, without catalog.write, a hint for the admin.
import { useCreate, type HttpError } from "@refinedev/core";
import { Alert, Form, Input, InputNumber, Modal, Select, Typography, type InputRef } from "antd";
import { useRef, useState } from "react";
import { useCan } from "../../providers/auth";
import type { Product, Unit } from "../../types";
import { UNITS, emptyPack } from "../products/packs";

type Values = { name: string; baseUnit: Unit; label: string; baseQty: number; retailPrice?: number };
type Props = { code: string; onClose: () => void; onCreated: (p: Product) => void };

const CreateForm = ({ code, onClose, onCreated }: Props) => {
  const [form] = Form.useForm<Values>();
  const { mutateAsync: create, mutation } = useCreate<Product>();
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<InputRef>(null);

  const save = async (v: Values) => {
    setError(null);
    try {
      const { data } = await create({
        resource: "products",
        values: {
          name: v.name.trim(), sku: code, barcode: code, baseUnit: v.baseUnit,
          isWeighed: false, isPerishable: false, preorderAllowed: false, hidden: true, // goes live once photo and category are set
          packs: [{ ...emptyPack, label: v.label.trim(), baseQty: v.baseQty, retailPrice: v.retailPrice ?? null, visibility: "retail" }],
        },
        successNotification: { type: "success", message: "Товар создан" },
        errorNotification: false,
      });
      onCreated(data);
      onClose();
    } catch (e) {
      setError((e as HttpError).message); // e.g. 409 duplicate: «Артикул, штрихкод или внешний код уже заняты»
    }
  };

  return (
    <Modal open title="Новый товар" okText="Создать и добавить" cancelText="Отмена" onCancel={onClose} onOk={() => form.submit()} okButtonProps={{ loading: mutation.isPending }} afterOpenChange={(o) => o && nameRef.current?.focus()} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ baseUnit: "шт", label: "шт", baseQty: 1 }} onFinish={save}>
        <Alert type="info" showIcon message="Товар будет скрыт с витрины, пока его не включат в каталоге" style={{ marginBottom: 16 }} />
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        <Form.Item label="Штрихкод (он же артикул)">
          <Input value={code} readOnly />
        </Form.Item>
        <Form.Item label="Название" name="name" rules={[{ required: true, whitespace: true, message: "Укажите название" }, { max: 200 }]}>
          <Input ref={nameRef} autoComplete="off" />
        </Form.Item>
        <Form.Item label="Единица учёта" name="baseUnit">
          <Select options={UNITS.map((u) => ({ value: u, label: u }))} />
        </Form.Item>
        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item label="Фасовка" name="label" rules={[{ required: true, whitespace: true, message: "Укажите фасовку" }]} style={{ flex: 1 }}>
            <Input />
          </Form.Item>
          <Form.Item label="В базовой ед." name="baseQty" rules={[{ required: true, message: "Укажите количество" }]} style={{ flex: 1 }}>
            <InputNumber min={0.001} step={1} precision={3} inputMode="decimal" style={{ width: "100%" }} />
          </Form.Item>
        </div>
        <Form.Item label="Розничная цена, ₸" name="retailPrice">
          <InputNumber min={0} precision={0} inputMode="numeric" style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export const NewProductModal = (props: Props) =>
  useCan("catalog.write") ? (
    <CreateForm {...props} />
  ) : (
    <Modal open title="Товар не найден" okText="Понятно" onOk={props.onClose} onCancel={props.onClose} cancelButtonProps={{ style: { display: "none" } }}>
      <Typography.Paragraph>Товар не найден. Попросите администратора добавить его.</Typography.Paragraph>
      <Typography.Text copyable code>
        {props.code}
      </Typography.Text>
    </Modal>
  );
