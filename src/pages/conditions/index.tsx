import { useList, useUpdate } from "@refinedev/core";
import { CreateButton, DeleteButton, EditButton, List, useTable } from "@refinedev/antd";
import { Form, Select, Space, Switch, Table, Tag } from "antd";
import { Link } from "react-router";
import type { Category, Condition, Customer, Product } from "../../types";
import { CONDITION_SCOPE, CONDITION_TYPE, MODE, date, options, tenge } from "../../lib/format";
import { Preview } from "./PreviewCard";

export { ConditionCreate, ConditionEdit } from "./ConditionForm";

const PRIORITY = { customer: 1, mode: 2, global: 3 } as const;
type Search = { type?: string; scope?: string; enabled?: string };

const value = (c: Condition) =>
  c.value == null ? "—"
    : c.type === "discount" ? `${c.value} %`
    : c.type === "min_order_volume" ? `${c.value} ед.`
    : tenge(c.value);

const period = (c: Condition) => {
  if (!c.startsAt && !c.endsAt) return "Бессрочно";
  const now = Date.now();
  const tag = c.endsAt && Date.parse(c.endsAt) < now ? <Tag>истекло</Tag>
    : c.startsAt && Date.parse(c.startsAt) > now ? <Tag color="blue">не началось</Tag> : null;
  return <Space size={4} wrap><span>{c.startsAt ? `с ${date(c.startsAt)}` : ""} {c.endsAt ? `до ${date(c.endsAt)}` : ""}</span>{tag}</Space>;
};

export const ConditionList = () => {
  const { tableProps, searchFormProps } = useTable<Condition, never, Search>({
    pagination: { mode: "off" },
    onSearch: (v) => [
      { field: "type", operator: "eq", value: v.type },
      { field: "scope", operator: "eq", value: v.scope },
      { field: "enabled", operator: "eq", value: v.enabled },
    ],
  });
  const { mutate: update, mutation: { isPending, variables } } = useUpdate<Condition>();

  // ponytail: whole lookup tables are loaded — fine for the mock; use getMany by ids once the catalogue is large.
  const all = { pagination: { mode: "off" as const } };
  const { result: cats } = useList<Category>({ resource: "categories", ...all });
  const { result: prods } = useList<Product>({ resource: "products", ...all });
  const { result: custs } = useList<Customer>({ resource: "customers", ...all });
  const { result: conds } = useList<Condition>({ resource: "conditions", ...all });
  const name = <T extends { id: string; name: string }>(rows: T[], id: string | null) => rows.find((r) => r.id === id)?.name ?? "—";

  const rows = [...(tableProps.dataSource ?? [])].sort((a, b) => PRIORITY[a.scope] - PRIORITY[b.scope]);

  return (
    <List headerButtons={<CreateButton>Новое условие</CreateButton>}>
      <Form {...searchFormProps} layout="inline" onValuesChange={() => searchFormProps.form?.submit()} style={{ marginBottom: 16, rowGap: 8 }}>
        <Form.Item name="type" label="Тип">
          <Select allowClear placeholder="Все" options={options(CONDITION_TYPE)} style={{ width: 240 }} />
        </Form.Item>
        <Form.Item name="scope" label="Область">
          <Select allowClear placeholder="Все" options={options(CONDITION_SCOPE)} style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="enabled" label="Статус">
          <Select allowClear placeholder="Все" style={{ width: 140 }}
            options={[{ value: "true", label: "Включены" }, { value: "false", label: "Выключены" }]} />
        </Form.Item>
      </Form>
      <Table {...tableProps} dataSource={rows} rowKey="id" size="small" scroll={{ x: true }} pagination={false}>
        <Table.Column<Condition> dataIndex="scope" title="Приоритет" align="right" render={(s: Condition["scope"]) => PRIORITY[s]} />
        <Table.Column<Condition> dataIndex="name" title="Название" render={(v, c) => <Link to={`/conditions/${c.id}/edit`}>{v}</Link>} />
        <Table.Column<Condition> dataIndex="type" title="Тип" render={(t: Condition["type"]) => CONDITION_TYPE[t]} />
        <Table.Column<Condition> title="Значение" align="right" render={(_, c) => <span style={{ whiteSpace: "nowrap" }}>{value(c)}</span>} />
        <Table.Column<Condition> title="На что" render={(_, c) =>
          c.type !== "discount" ? "—"
            : c.target === "all" ? "Все товары"
            : c.target === "category" ? `Категория: ${name(cats.data, c.targetId)}` : `Товар: ${name(prods.data, c.targetId)}`} />
        <Table.Column<Condition> title="Для кого" render={(_, c) =>
          c.scope === "global" ? "Общее"
            : c.scope === "mode" ? `Режим: ${c.scopeMode ? MODE[c.scopeMode].label : "—"}`
            : <>Клиент: <Link to={`/customers/${c.scopeCustomerId}`}>{name(custs.data, c.scopeCustomerId)}</Link></>} />
        <Table.Column<Condition> title="Период" render={(_, c) => period(c)} />
        <Table.Column<Condition> dataIndex="enabled" title="Включено" render={(v: boolean, c) => (
          <Switch
            size="small"
            checked={v}
            aria-label={`${v ? "Выключить" : "Включить"} «${c.name}»`}
            loading={isPending && variables?.id === c.id}
            onChange={(enabled) => update({ resource: "conditions", id: c.id, values: { enabled } })}
          />
        )} />
        <Table.Column<Condition> title="" render={(_, c) => (
          <Space>
            <EditButton hideText size="small" recordItemId={c.id} aria-label="Изменить" />
            <DeleteButton hideText size="small" recordItemId={c.id} aria-label="Удалить" confirmTitle="Удалить условие?" />
          </Space>
        )} />
      </Table>
      <Preview conditions={conds.data} products={prods.data.filter((p) => !p.hidden)} categories={cats.data} customers={custs.data} />
    </List>
  );
};
