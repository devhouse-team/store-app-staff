import { List, useSelect, useTable } from "@refinedev/antd";
import { useCreate, useUpdate } from "@refinedev/core";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Divider, Drawer, Form, Input, Select, Switch, Table, Tag } from "antd";
import { useState } from "react";
import { useCan } from "../../providers/auth";
import type { Supplier } from "../../types";

type Values = Pick<Supplier, "name" | "phone" | "bin" | "comment" | "active">;

/**
 * Create/edit form. Edit starts from a row we already have: the API has no GET /suppliers/{id},
 * so useDrawerForm (which refetches the record) can't be used. Also opened inline from «Новая приёмка».
 */
export const SupplierDrawer = ({ record, onClose, onSaved }: { record?: Supplier; onClose: () => void; onSaved?: (s: Supplier) => void }) => {
  const [form] = Form.useForm<Values>();
  const { mutateAsync: create, mutation: c } = useCreate<Supplier>();
  const { mutateAsync: update, mutation: u } = useUpdate<Supplier>();
  const save = async (values: Values) => {
    const { data } = record
      ? await update({ resource: "suppliers", id: record.id, values, successNotification: { type: "success", message: "Поставщик сохранён" } })
      : await create({ resource: "suppliers", values, successNotification: { type: "success", message: "Поставщик добавлен" } });
    onSaved?.(data);
    onClose();
  };
  return (
    <Drawer
      open
      title={record ? "Поставщик" : "Новый поставщик"}
      onClose={onClose}
      width={420}
      destroyOnHidden
      extra={
        <Button type="primary" loading={c.isPending || u.isPending} onClick={() => form.submit()}>
          Сохранить
        </Button>
      }
    >
      <Form form={form} layout="vertical" initialValues={record ?? { active: true }} onFinish={save}>
        <Form.Item label="Название" name="name" rules={[{ required: true, whitespace: true, message: "Укажите название" }, { max: 255 }]}>
          <Input autoComplete="off" placeholder="ИП Касымов" />
        </Form.Item>
        <Form.Item label="Телефон" name="phone" rules={[{ max: 20, message: "Не больше 20 символов" }]}>
          <Input inputMode="tel" placeholder="+7 700 123 45 67" />
        </Form.Item>
        <Form.Item label="БИН / ИИН" name="bin" rules={[{ pattern: /^\d{12}$/, message: "12 цифр" }]}>
          <Input inputMode="numeric" maxLength={12} />
        </Form.Item>
        <Form.Item label="Комментарий" name="comment" rules={[{ max: 1000 }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} />
        </Form.Item>
        {record && (
          <Form.Item label="Активен" name="active" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Drawer>
  );
};

type Opt = { value: string; label: string };

/**
 * Active-supplier picker with search and inline «+ Новый поставщик» (the new one is selected at once).
 * `known`: options that may not be on the first result page (last used, the receipt's current supplier).
 */
export const SupplierSelect = ({ known = [], onChange, ...props }: {
  known?: Opt[];
  value?: string;
  onChange?: (id: string) => void;
  id?: string; // from Form.Item
  style?: React.CSSProperties;
  "aria-label"?: string;
}) => {
  const [added, setAdded] = useState<Opt[]>([]);
  const [creating, setCreating] = useState(false);
  const { selectProps } = useSelect<Supplier>({
    resource: "suppliers",
    optionLabel: "name",
    searchField: "name",
    filters: [{ field: "active", operator: "eq", value: true }],
  });
  const options = [...added, ...known, ...((selectProps.options ?? []) as Opt[])].filter(
    (o, i, a) => a.findIndex((x) => x.value === o.value) === i,
  );
  return (
    <>
      <Select<string>
        showSearch
        filterOption={false}
        onSearch={selectProps.onSearch}
        loading={selectProps.loading}
        placeholder="Поиск по названию"
        {...props}
        options={options}
        onChange={(v) => onChange?.(v)}
        popupRender={(menu) => (
          <>
            {menu}
            <Divider style={{ margin: "4px 0" }} />
            <Button type="text" block icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Новый поставщик
            </Button>
          </>
        )}
      />
      {creating && (
        <SupplierDrawer
          onClose={() => setCreating(false)}
          onSaved={(s) => {
            setAdded((a) => [{ value: s.id, label: s.name }, ...a]);
            onChange?.(s.id);
          }}
        />
      )}
    </>
  );
};

export const SupplierList = () => {
  const { tableProps, setFilters } = useTable<Supplier>({ resource: "suppliers", syncWithLocation: false });
  const { mutate: update } = useUpdate<Supplier>();
  const canWrite = useCan("stock.write");
  const [drawer, setDrawer] = useState<{ record?: Supplier } | null>(null);

  return (
    <List
      headerButtons={
        canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawer({})}>
            Добавить поставщика
          </Button>
        )
      }
    >
      <Input.Search
        aria-label="Поиск поставщика"
        placeholder="Название"
        allowClear
        onSearch={(v) => setFilters([{ field: "name", operator: "contains", value: v.trim() }], "replace")}
        style={{ width: 260, maxWidth: "100%", marginBottom: 12 }}
      />
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }}>
        <Table.Column<Supplier> dataIndex="name" title="Название" />
        <Table.Column<Supplier> dataIndex="phone" title="Телефон" render={(v: string) => (v ? <a href={`tel:${v.replace(/\s/g, "")}`}>{v}</a> : "—")} />
        <Table.Column<Supplier> dataIndex="bin" title="БИН" render={(v: string) => v || "—"} />
        <Table.Column<Supplier>
          dataIndex="active"
          title="Активен"
          render={(v: boolean, r) =>
            canWrite ? (
              <Switch size="small" checked={v} aria-label={`Активен: ${r.name}`} onChange={(active) => update({ resource: "suppliers", id: r.id, values: { active } })} />
            ) : (
              <Tag color={v ? "green" : "default"}>{v ? "Да" : "Нет"}</Tag>
            )
          }
        />
        {canWrite && (
          <Table.Column<Supplier>
            key="actions"
            render={(_, r) => (
              <Button size="small" onClick={() => setDrawer({ record: r })}>
                Изменить
              </Button>
            )}
          />
        )}
      </Table>
      {drawer && <SupplierDrawer record={drawer.record} onClose={() => setDrawer(null)} />}
    </List>
  );
};
