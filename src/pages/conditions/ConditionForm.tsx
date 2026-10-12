import { useList } from "@refinedev/core";
import { Create, Edit, useForm, useSelect } from "@refinedev/antd";
import { DatePicker, Form, Input, InputNumber, Radio, Select, Switch, TreeSelect } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useSearchParams } from "react-router";
import type { Category, Condition, ConditionType, Customer, Product } from "../../types";
import { CONDITION_SCOPE, CONDITION_TYPE, MODE, options } from "../../lib/format";

type Values = Omit<Condition, "id" | "startsAt" | "endsAt"> & { period?: [Dayjs | null, Dayjs | null] | null };

const MONEY: ConditionType[] = ["free_delivery_from", "min_order_amount", "custom_delivery_price"];

type TreeNode = { value: string; title: string; children: TreeNode[] };
const categoryTree = (cats: Category[], parentId: string | null = null): TreeNode[] =>
  cats.filter((c) => c.parentId === parentId).map((c) => ({ value: c.id, title: c.name, children: categoryTree(cats, c.id) }));

const toForm = (c: Partial<Condition>): Partial<Values> => ({
  ...c,
  period: c.startsAt || c.endsAt ? [c.startsAt ? dayjs(c.startsAt) : null, c.endsAt ? dayjs(c.endsAt) : null] : null,
});

const fromForm = ({ period, ...v }: Values): Omit<Condition, "id"> => {
  const isDiscount = v.type === "discount";
  return {
    ...v,
    value: v.type === "preorder_allowed" ? null : (v.value ?? null),
    target: isDiscount ? v.target : "all",
    targetId: isDiscount && v.target !== "all" ? (v.targetId ?? null) : null,
    scopeMode: v.scope === "mode" ? v.scopeMode : null,
    scopeCustomerId: v.scope === "customer" ? v.scopeCustomerId : null,
    startsAt: period?.[0]?.startOf("day").toISOString() ?? null,
    endsAt: period?.[1]?.endOf("day").toISOString() ?? null,
    enabled: !!v.enabled,
  };
};

const ConditionForm = ({ action }: { action: "create" | "edit" }) => {
  const [params] = useSearchParams();
  const customerId = params.get("customerId");
  const { formProps, saveButtonProps, query } = useForm<Condition>({ action, redirect: "list" });
  const form = formProps.form!;
  const type = Form.useWatch("type", form) as ConditionType | undefined;
  const target = Form.useWatch("target", form);
  const scope = Form.useWatch("scope", form);

  const defaults: Partial<Condition> = {
    type: "discount", target: "all", enabled: true,
    scope: customerId ? "customer" : "global", scopeCustomerId: customerId, scopeMode: "retail",
  };
  const record = action === "edit" ? (formProps.initialValues as Condition | undefined) : undefined;

  const { result: cats } = useList<Category>({ resource: "categories", pagination: { mode: "off" } });
  const { result: prods } = useList<Product>({ resource: "products", pagination: { mode: "off" }, sorters: [{ field: "name", order: "asc" }] });
  const { selectProps: customerSelect } = useSelect<Customer>({
    resource: "customers",
    optionLabel: (c) => `${c.name} · ${c.phone}`,
    searchField: "name",
    defaultValue: record?.scopeCustomerId ?? customerId ?? undefined,
  });

  const Wrapper = action === "create" ? Create : Edit;
  return (
    <Wrapper saveButtonProps={saveButtonProps} isLoading={query?.isLoading} title={action === "create" ? "Новое условие" : "Изменить условие"}>
      <Form
        {...formProps}
        layout="vertical"
        style={{ maxWidth: 640 }}
        initialValues={toForm(record ?? defaults)}
        onFinish={(v) => formProps.onFinish?.(fromForm(v as Values) as never)}
      >
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true, message: "Введите название" }]}
          extra="Видно только персоналу, например «Скидка 5% для ИП Сапаров».">
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="type" label="Тип условия" rules={[{ required: true }]}>
          <Select options={options(CONDITION_TYPE)} />
        </Form.Item>

        {type === "discount" && (
          <Form.Item name="value" label="Скидка, %" rules={[{ required: true, type: "integer", min: 1, max: 99, message: "Целое число от 1 до 99" }]}>
            <InputNumber min={1} max={99} precision={0} addonAfter="%" style={{ width: 160 }} />
          </Form.Item>
        )}
        {type && MONEY.includes(type) && (
          <Form.Item name="value" label={type === "free_delivery_from" ? "Порог суммы заказа" : type === "min_order_amount" ? "Минимальная сумма" : "Стоимость доставки"}
            rules={[{ required: true, type: "number", min: type === "custom_delivery_price" ? 0 : 1, message: "Укажите сумму в тенге" }]}>
            <InputNumber min={0} step={500} precision={0} addonAfter="₸" style={{ width: 200 }} />
          </Form.Item>
        )}
        {type === "min_order_volume" && (
          <Form.Item name="value" label="Минимальный объём" extra="В базовых единицах фасовок (кг, л, шт)."
            rules={[{ required: true, type: "number", min: 0.01, message: "Укажите объём больше нуля" }]}>
            <InputNumber min={0} step={10} style={{ width: 200 }} />
          </Form.Item>
        )}

        {type === "discount" && (
          <>
            <Form.Item name="target" label="На что действует скидка">
              <Radio.Group optionType="button" options={[
                { value: "all", label: "Все товары" }, { value: "category", label: "Категория" }, { value: "product", label: "Товар" },
              ]} onChange={() => form.setFieldValue("targetId", null)} />
            </Form.Item>
            {target === "category" && (
              <Form.Item name="targetId" label="Категория" rules={[{ required: true, message: "Выберите категорию" }]}
                extra="Скидка действует и на подкатегории.">
                <TreeSelect treeData={categoryTree(cats.data)} treeDefaultExpandAll showSearch treeNodeFilterProp="title" />
              </Form.Item>
            )}
            {target === "product" && (
              <Form.Item name="targetId" label="Товар" rules={[{ required: true, message: "Выберите товар" }]}>
                <Select showSearch optionFilterProp="label" options={prods.data.map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))} />
              </Form.Item>
            )}
          </>
        )}

        <Form.Item name="scope" label="Для кого" extra="Приоритет: клиент → режим → общее. Условие того же типа с более высокой областью заменяет остальные.">
          <Radio.Group optionType="button" options={options(CONDITION_SCOPE)} />
        </Form.Item>
        {scope === "mode" && (
          <Form.Item name="scopeMode" label="Режим" rules={[{ required: true, message: "Выберите режим" }]}>
            <Select options={options(MODE)} style={{ width: 200 }} />
          </Form.Item>
        )}
        {scope === "customer" && (
          <Form.Item name="scopeCustomerId" label="Клиент" rules={[{ required: true, message: "Выберите клиента" }]}>
            <Select {...customerSelect} placeholder="Имя клиента" />
          </Form.Item>
        )}

        <Form.Item name="period" label="Период действия" extra="Оставьте пустым — условие действует бессрочно.">
          <DatePicker.RangePicker allowEmpty={[true, true]} format="DD.MM.YYYY" placeholder={["С", "По (бессрочно)"]} />
        </Form.Item>
        <Form.Item name="enabled" label="Включено" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Wrapper>
  );
};

export const ConditionCreate = () => <ConditionForm action="create" />;
export const ConditionEdit = () => <ConditionForm action="edit" />;
