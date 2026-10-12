import { Create, Edit, useForm } from "@refinedev/antd";
import { useCreate, useList, useUpdate, type HttpError } from "@refinedev/core";
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
import type { Category, Pack, Product, Stock } from "../../types";
import { categoryTreeData } from "../categories/tree";
import { UNITS, VISIBILITY, hasRetail, hasWholesale, newProductId, normalizePacks, stockUnit } from "./packs";

type PackValues = Omit<Pack, "id"> & { id?: string };
type Values = Omit<Product, "id" | "packs"> & { packs: PackValues[] };

const MAX_IMAGE_BYTES = 1024 * 1024; // mock keeps data URLs in localStorage; real upload goes to S3 (B5)

const ImageField = ({ value, onChange }: { value?: string | null; onChange?: (v: string | null) => void }) => {
  const { message } = App.useApp();
  return (
    <Space align="start" wrap>
      {value ? (
        <Image src={value} width={96} height={96} style={{ objectFit: "cover" }} alt="Фото товара" />
      ) : null}
      <Space direction="vertical" size={4}>
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            if (file.size > MAX_IMAGE_BYTES) {
              message.error("Файл больше 1 МБ");
              return Upload.LIST_IGNORE;
            }
            const reader = new FileReader();
            reader.onload = () => onChange?.(reader.result as string);
            reader.readAsDataURL(file);
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
        <Typography.Text type="secondary">Квадратное фото 1:1, от 800×800 px, до 1 МБ</Typography.Text>
      </Space>
    </Space>
  );
};

const emptyPack: PackValues = {
  label: "",
  unit: "шт",
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
                <Col xs={12} sm={6} md={3}>
                  <Form.Item label="Ед." name={[name, "unit"]} rules={[{ required: true, message: "Выберите" }]}>
                    <Select options={UNITS.map((u) => ({ value: u, label: u }))} />
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
            <Form.Item label="Срок годности" name="shelfLife" rules={[{ required: true, whitespace: true, message: "Например, «7 суток»" }]}>
              <Input placeholder="7 суток" />
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

const toProduct = (v: Values, id: string): Omit<Product, "id"> => ({
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
  shelfLife: v.isPerishable ? (v.shelfLife?.trim() ?? null) : null,
  preorderAllowed: !!v.preorderAllowed,
  hidden: !!v.hidden,
  packs: normalizePacks(v.packs, id),
});

/** Unique sku/barcode check against the loaded catalog. */
const useDuplicateCheck = (selfId?: string) => {
  const { result } = useList<Product>({ resource: "products", pagination: { mode: "off" } });
  return (v: Values, form: FormInstance<Values>) => {
    const others = result.data.filter((p) => p.id !== selfId);
    const errs: Parameters<typeof form.setFields>[0] = [];
    if (others.some((p) => p.sku === v.sku.trim())) errs.push({ name: "sku", errors: ["Такой артикул уже есть"] });
    if (v.barcode && others.some((p) => p.barcode === v.barcode.trim()))
      errs.push({ name: "barcode", errors: ["Такой штрихкод уже есть"] });
    form.setFields(errs);
    return errs.length === 0;
  };
};

export const ProductCreate = () => {
  const { mutateAsync: createStock } = useCreate<Stock>();
  const { formProps, saveButtonProps, form, onFinish } = useForm<Product, HttpError, Values>({
    action: "create",
    onMutationSuccess: ({ data }) =>
      // Every product has a stock row (id = productId) so A5 and the app stay consistent.
      createStock({
        resource: "stock",
        values: { id: data.id, productId: data.id, productName: data.name, unit: stockUnit(data), quantity: 0, reserved: 0, lowThreshold: 5 },
        successNotification: false,
      }),
  });
  const unique = useDuplicateCheck();
  return (
    <Create saveButtonProps={{ ...saveButtonProps, children: "Сохранить" }} title="Новый товар">
      <ProductForm
        formProps={{
          ...formProps,
          initialValues: { isWeighed: false, isPerishable: false, preorderAllowed: false, hidden: false, packs: [{ ...emptyPack }] },
        }}
        form={form}
        onSubmit={(v) => {
          if (!unique(v, form)) return;
          const id = newProductId();
          onFinish({ id, ...toProduct(v, id) } as Values);
        }}
      />
    </Create>
  );
};

export const ProductEdit = () => {
  const { mutate: updateStock } = useUpdate<Stock>();
  const { formProps, saveButtonProps, form, onFinish, id } = useForm<Product, HttpError, Values>({
    action: "edit",
    onMutationSuccess: ({ data }) =>
      updateStock({
        resource: "stock",
        id: data.id,
        values: { productName: data.name, unit: stockUnit(data) },
        successNotification: false,
        errorNotification: false,
      }),
  });
  const unique = useDuplicateCheck(id ? String(id) : undefined);
  return (
    <Edit saveButtonProps={{ ...saveButtonProps, children: "Сохранить" }} title="Изменить товар">
      <ProductForm
        formProps={formProps}
        form={form}
        onSubmit={(v) => {
          if (!unique(v, form)) return;
          onFinish(toProduct(v, String(id)) as Values);
        }}
      />
    </Edit>
  );
};
