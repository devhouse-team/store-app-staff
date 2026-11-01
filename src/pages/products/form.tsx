import { Create, Edit, useForm } from "@refinedev/antd";
import { useList, type HttpError } from "@refinedev/core";
import { DeleteOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Form,
  Image,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Tooltip,
  TreeSelect,
  Typography,
  Upload,
} from "antd";
import type { FormInstance, FormProps } from "antd";
import { useEffect, useState } from "react";
import type { Category, Pack, Product } from "../../types";
import { categoryTreeData } from "../categories/tree";
import { UNITS, VISIBILITY, hasRetail, hasWholesale, normalizePacks } from "./packs";

type PackValues = Omit<Pack, "id"> & { id?: string };
// imageUrl: existing photo URL, a newly picked File (uploaded by the data provider after save) or null (remove).
type Values = Omit<Product, "id" | "packs" | "imageUrl" | "imageKeys"> & { packs: PackValues[]; imageUrl: string | File | null };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ImageField = ({ value, onChange }: { value?: string | File | null; onChange?: (v: File | null) => void }) => {
  const { message } = App.useApp();
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!(value instanceof File)) return setSrc(value ?? undefined);
    const url = URL.createObjectURL(value);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);
  return (
    <Space align="start" wrap>
      {src ? <Image src={src} width={96} height={96} style={{ objectFit: "cover" }} alt="Фото товара" /> : null}
      <Space direction="vertical" size={4}>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            if (file.size > MAX_IMAGE_BYTES) {
              message.error("Файл больше 5 МБ");
              return Upload.LIST_IGNORE;
            }
            onChange?.(file);
            return false;
          }}
        >
          <Button icon={<UploadOutlined />}>{value ? "Заменить фото" : "Загрузить фото"}</Button>
        </Upload>
        {value ? (
          <Button size="small" type="link" danger onClick={() => onChange?.(null)} style={{ padding: 0 }}>
            Удалить фото
          </Button>
        ) : null}
        <Typography.Text type="secondary">Квадратное фото 1:1, от 800×800 px, до 5 МБ. Сохраняется вместе с товаром.</Typography.Text>
      </Space>
    </Space>
  );
};

const emptyPack: PackValues = {
  label: "",
  baseQty: 1,
  retailPrice: null,
  wholesalePrice: null,
  visibility: "both",
  step: 1,
  minQty: 1,
};

const PacksField = ({ form }: { form: FormInstance<Values> }) => (
  <Form.List
    name="packs"
    rules={[
      {
        validator: async (_, packs?: PackValues[]) => {
          if (!packs?.length) throw new Error("Добавьте хотя бы одну фасовку");
        },
      },
    ]}
  >
    {(fields, { add, remove }, { errors }) => (
      <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map(({ key, name }, i) => {
          const at = (f: keyof PackValues) => ["packs", name, f] as never;
          const vis = () => form.getFieldValue(at("visibility")) as Pack["visibility"];
          return (
            <Card
              key={key}
              size="small"
              title={`Фасовка ${i + 1}`}
              extra={
                <Tooltip title="Удалить фасовку">
                  <Button size="small" danger icon={<DeleteOutlined />} aria-label="Удалить фасовку" onClick={() => remove(name)} />
                </Tooltip>
              }
            >
              <Form.Item name={[name, "id"]} hidden>
                <Input />
              </Form.Item>
              <Row gutter={12}>
                <Col xs={24} sm={12} md={6}>
                  <Form.Item label="Название фасовки" name={[name, "label"]} rules={[{ required: true, whitespace: true, message: "Например, «10 кг»" }]}>
                    <Input placeholder="10 кг" />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6} md={4}>
                  <Form.Item
                    label="В базовой ед."
                    tooltip="Сколько базовых единиц в фасовке, например 10 для «10 кг»"
                    name={[name, "baseQty"]}
                    rules={[{ required: true, message: "Укажите" }, { type: "number", min: 0.001, message: "Больше 0" }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} md={5}>
                  <Form.Item label="Видимость" name={[name, "visibility"]} rules={[{ required: true, message: "Выберите" }]}>
                    <Select options={Object.entries(VISIBILITY).map(([value, label]) => ({ value, label }))} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6} md={3}>
                  <Form.Item
                    label="Шаг"
                    name={[name, "step"]}
                    rules={[{ required: true, message: "Укажите" }, { type: "number", min: 0.001, message: "Больше 0" }]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={12} sm={6} md={3}>
                  <Form.Item
                    label="Минимум"
                    name={[name, "minQty"]}
                    dependencies={[at("step")]}
                    rules={[
                      { required: true, message: "Укажите" },
                      {
                        validator: async (_, v?: number) => {
                          const step = form.getFieldValue(at("step"));
                          if (v != null && step != null && v < step) throw new Error("Не меньше шага");
                        },
                      },
                    ]}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Form.Item noStyle dependencies={[at("visibility")]}>
                  {() => (
                    <>
                      <Col xs={12} sm={12} md={6}>
                        <Form.Item
                          label="Розничная цена, ₸"
                          name={[name, "retailPrice"]}
                          dependencies={[at("visibility")]}
                          rules={[{ required: hasRetail(vis()), message: "Укажите розничную цену" }]}
                        >
                          <InputNumber min={0} precision={0} disabled={!hasRetail(vis())} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={12} md={6}>
                        <Form.Item
                          label="Оптовая цена, ₸"
                          name={[name, "wholesalePrice"]}
                          dependencies={[at("visibility")]}
                          rules={[{ required: hasWholesale(vis()), message: "Укажите оптовую цену" }]}
                        >
                          <InputNumber min={0} precision={0} disabled={!hasWholesale(vis())} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                    </>
                  )}
                </Form.Item>
              </Row>
            </Card>
          );
        })}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ ...emptyPack })} block>
          Добавить фасовку
        </Button>
        <Form.ErrorList errors={errors} />
      </Space>
    )}
  </Form.List>
);

const ProductForm = ({
  formProps,
  form,
  onSubmit,
}: {
  formProps: FormProps<Values>;
  form: FormInstance<Values>;
  onSubmit: (v: Values) => void;
}) => {
  const { result } = useList<Category>({ resource: "categories", pagination: { mode: "off" } });
  const isWeighed = Form.useWatch("isWeighed", form);
  const isPerishable = Form.useWatch("isPerishable", form);
  return (
    <Form {...formProps} layout="vertical" onFinish={onSubmit} scrollToFirstError>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Название" name="name" rules={[{ required: true, whitespace: true, message: "Введите название" }]}>
            <Input maxLength={200} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item label="Артикул" name="sku" rules={[{ required: true, whitespace: true, message: "Введите артикул" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item label="Штрихкод" name="barcode" rules={[{ pattern: /^\d{8,14}$/, message: "8–14 цифр" }]}>
            <Input inputMode="numeric" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item label="Бренд" name="brand">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={12} sm={6} md={3}>
          <Form.Item label="Базовая ед." name="baseUnit" rules={[{ required: true, message: "Выберите" }]} tooltip="В ней считаются остаток и «кол-во в базовой ед.» фасовок">
            <Select options={UNITS.map((u) => ({ value: u, label: u }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item label="Категория" name="categoryId" rules={[{ required: true, message: "Выберите категорию" }]}>
            <TreeSelect treeData={categoryTreeData(result.data)} treeDefaultExpandAll showSearch treeNodeFilterProp="title" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Фото" name="imageUrl">
            <ImageField />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item label="Описание" name="description">
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Col>
      </Row>

      <Typography.Title level={5}>Признаки</Typography.Title>
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="isWeighed" valuePropName="checked">
            <Checkbox>Весовой товар</Checkbox>
          </Form.Item>
          {isWeighed ? (
            <Form.Item
              label="Шаг веса, кг"
              name="weightStep"
              rules={[{ required: true, message: "Укажите шаг" }, { type: "number", min: 0.001, message: "Больше 0" }]}
            >
              <InputNumber min={0} step={0.1} style={{ width: "100%" }} />
            </Form.Item>
          ) : null}
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="isPerishable" valuePropName="checked">
            <Checkbox>Скоропортящийся</Checkbox>
          </Form.Item>
          {isPerishable ? (
            <Form.Item label="Срок годности, дней" name="shelfLifeDays" rules={[{ required: true, message: "Укажите срок" }]}>
              <InputNumber min={1} precision={0} style={{ width: "100%" }} />
            </Form.Item>
          ) : null}
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="preorderAllowed" valuePropName="checked">
            <Checkbox>Предзаказ разрешён</Checkbox>
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Form.Item name="hidden" valuePropName="checked">
            <Checkbox>Скрыт из приложения</Checkbox>
          </Form.Item>
        </Col>
      </Row>

      <Typography.Title level={5}>Фасовки и цены</Typography.Title>
      <PacksField form={form} />
    </Form>
  );
};

const toProduct = (v: Values): Values => ({
  ...v,
  name: v.name.trim(),
  sku: v.sku.trim(),
  barcode: v.barcode?.trim() ?? "",
  brand: v.brand?.trim() || null,
  description: v.description?.trim() || null,
  imageUrl: v.imageUrl ?? null,
  isWeighed: !!v.isWeighed,
  weightStep: v.isWeighed ? (v.weightStep ?? null) : null,
  isPerishable: !!v.isPerishable,
  shelfLifeDays: v.isPerishable ? (v.shelfLifeDays ?? null) : null,
  preorderAllowed: !!v.preorderAllowed,
  hidden: !!v.hidden,
  packs: normalizePacks(v.packs),
});

// Duplicate sku / barcode are rejected by the server (409) and shown as a notification.
export const ProductCreate = () => {
  const { formProps, saveButtonProps, form, onFinish } = useForm<Product, HttpError, Values>({ action: "create" });
  return (
    <Create saveButtonProps={{ ...saveButtonProps, children: "Сохранить" }} title="Новый товар">
      <ProductForm
        formProps={{
          ...formProps,
          initialValues: { baseUnit: "шт", isWeighed: false, isPerishable: false, preorderAllowed: false, hidden: false, packs: [{ ...emptyPack }] },
        }}
        form={form}
        onSubmit={(v) => onFinish(toProduct(v))}
      />
    </Create>
  );
};

export const ProductEdit = () => {
  const { formProps, saveButtonProps, form, onFinish } = useForm<Product, HttpError, Values>({ action: "edit" });
  return (
    <Edit saveButtonProps={{ ...saveButtonProps, children: "Сохранить" }} title="Изменить товар">
      <ProductForm formProps={formProps} form={form} onSubmit={(v) => onFinish(toProduct(v))} />
    </Edit>
  );
};
