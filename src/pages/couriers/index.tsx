import { CreateButton, DeleteButton, List, useModalForm, useTable } from "@refinedev/antd";
import { useUpdate } from "@refinedev/core";
import { Button, Form, Input, Modal, Space, Switch, Table } from "antd";
import type { Courier } from "../../types";

export const PHONE_RULE = { pattern: /^\+7 \d{3} \d{3} \d{2} \d{2}$/, message: "Формат: +7 700 123 45 67" };

export const CourierList = () => {
  const { tableProps } = useTable<Courier>({ syncWithLocation: false, pagination: { mode: "off" } });
  const { mutate: update } = useUpdate();
  const create = useModalForm<Courier>({ action: "create", syncWithLocation: false });
  const edit = useModalForm<Courier>({ action: "edit", syncWithLocation: false });

  const fields = (
    <>
      <Form.Item label="Имя" name="name" rules={[{ required: true, whitespace: true, message: "Укажите имя" }]}>
        <Input autoComplete="off" />
      </Form.Item>
      <Form.Item label="Телефон" name="phone" rules={[{ required: true, message: "Укажите телефон" }, PHONE_RULE]}>
        <Input inputMode="tel" placeholder="+7 700 123 45 67" />
      </Form.Item>
      <Form.Item label="Активен" name="active" valuePropName="checked" initialValue>
        <Switch />
      </Form.Item>
    </>
  );

  return (
    <List headerButtons={<CreateButton onClick={() => create.show()}>Добавить курьера</CreateButton>}>
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }} pagination={false}>
        <Table.Column<Courier> dataIndex="name" title="Имя" />
        <Table.Column<Courier> dataIndex="phone" title="Телефон" render={(v: string) => <a href={`tel:${v.replace(/\s/g, "")}`}>{v}</a>} />
        <Table.Column<Courier>
          dataIndex="active"
          title="Активен"
          render={(v: boolean, r) => (
            <Switch
              size="small"
              checked={v}
              aria-label={`Активен: ${r.name}`}
              onChange={(active) => update({ resource: "couriers", id: r.id, values: { active } })}
            />
          )}
        />
        <Table.Column<Courier>
          title="Действия"
          render={(_, r) => (
            <Space>
              <Button size="small" onClick={() => edit.show(r.id)}>Изменить</Button>
              <DeleteButton size="small" recordItemId={r.id} confirmTitle={`Удалить курьера «${r.name}»?`} confirmOkText="Удалить" confirmCancelText="Отмена">
                Удалить
              </DeleteButton>
            </Space>
          )}
        />
      </Table>
      <Modal {...create.modalProps} title="Новый курьер">
        <Form {...create.formProps} layout="vertical">{fields}</Form>
      </Modal>
      <Modal {...edit.modalProps} title="Курьер">
        <Form {...edit.formProps} layout="vertical">{fields}</Form>
      </Modal>
    </List>
  );
};
