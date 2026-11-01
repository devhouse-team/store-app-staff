import { CreateButton, DeleteButton, useForm, useModalForm, useTable } from "@refinedev/antd";
import { useUpdate } from "@refinedev/core";
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Typography } from "antd";
import { tenge } from "../../lib/format";
import type { DeliverySlot, DeliveryZone, Settings } from "../../types";

// Backend weekday: 0 = Monday … 6 = Sunday.
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, value) => ({ label, value }));
const money = { min: 0, step: 100, style: { width: "100%" }, addonAfter: "₸" } as const;

const ActiveSwitch = ({ resource, id, active, label }: { resource: string; id: string; active: boolean; label: string }) => {
  const { mutate } = useUpdate();
  return (
    <Switch size="small" checked={active} aria-label={`Активна: ${label}`} onChange={(v) => mutate({ resource, id, values: { active: v } })} />
  );
};

const Zones = () => {
  const resource = "delivery_zones";
  const { tableProps } = useTable<DeliveryZone>({ resource, syncWithLocation: false, pagination: { mode: "off" } });
  const create = useModalForm<DeliveryZone>({ resource, action: "create", syncWithLocation: false });
  const edit = useModalForm<DeliveryZone>({ resource, action: "edit", syncWithLocation: false });
  const fields = (
    <>
      <Form.Item label="Название зоны" name="name" rules={[{ required: true, whitespace: true, message: "Укажите название" }]}>
        <Input />
      </Form.Item>
      <Form.Item label="Населённые пункты" name="localities" extra="Введите название и нажмите Enter" initialValue={[]}>
        <Select mode="tags" open={false} tokenSeparators={[","]} />
      </Form.Item>
      <Form.Item label="Стоимость доставки" name="fee" rules={[{ required: true, message: "Укажите стоимость" }]}>
        <InputNumber {...money} />
      </Form.Item>
      <Form.Item label="Бесплатно от суммы" name="freeFrom" extra="Пусто — бесплатной доставки нет">
        <InputNumber {...money} />
      </Form.Item>
      <Form.Item label="Минимальный заказ" name="minOrder" extra="Пусто — без минимума. Отдельный минимум для опта задаётся в «Условиях».">
        <InputNumber {...money} />
      </Form.Item>
      <Form.Item label="Активна" name="active" valuePropName="checked" initialValue>
        <Switch />
      </Form.Item>
    </>
  );
  return (
    <>
      <CreateButton style={{ marginBottom: 12 }} onClick={() => create.show()}>Добавить зону</CreateButton>
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }} pagination={false}>
        <Table.Column<DeliveryZone> dataIndex="name" title="Зона" />
        <Table.Column<DeliveryZone> dataIndex="localities" title="Населённые пункты" render={(v: string[]) => v.join(", ") || "—"} />
        <Table.Column<DeliveryZone> dataIndex="fee" title="Доставка" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="freeFrom" title="Бесплатно от" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="minOrder" title="Мин. заказ" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="active" title="Активна" render={(v, r) => <ActiveSwitch resource={resource} id={r.id} active={v} label={r.name} />} />
        <Table.Column<DeliveryZone> title="" render={(_, r) => (
          <Space>
            <Button size="small" onClick={() => edit.show(r.id)}>Изменить</Button>
            <DeleteButton size="small" resource={resource} recordItemId={r.id} hideText confirmTitle={`Удалить зону «${r.name}»?`} confirmOkText="Удалить" confirmCancelText="Отмена" />
          </Space>
        )} />
      </Table>
      <Modal {...create.modalProps} title="Новая зона">
        <Form {...create.formProps} layout="vertical">{fields}</Form>
      </Modal>
      <Modal {...edit.modalProps} title="Зона доставки">
        <Form {...edit.formProps} layout="vertical">{fields}</Form>
      </Modal>
    </>
  );
};

// Slots are "HH:mm" strings — the native time input produces exactly that.
const timeRule = { pattern: /^\d{2}:\d{2}$/, message: "Формат ЧЧ:ММ" };

const Slots = () => {
  const resource = "delivery_slots";
  const { tableProps } = useTable<DeliverySlot>({ resource, syncWithLocation: false, pagination: { mode: "off" } });
  const create = useModalForm<DeliverySlot>({ resource, action: "create", syncWithLocation: false });
  const edit = useModalForm<DeliverySlot>({ resource, action: "edit", syncWithLocation: false });
  const rows = [...(tableProps.dataSource ?? [])].sort((a, b) => a.weekday - b.weekday || a.from.localeCompare(b.from));
  const fields = (
    <>
      <Form.Item label="День недели" name="weekday" rules={[{ required: true, message: "Выберите день" }]}>
        <Select options={DAYS} style={{ width: 120 }} />
      </Form.Item>
      <Space>
        <Form.Item label="С" name="from" rules={[{ required: true, message: "Укажите начало" }, timeRule]}>
          <Input type="time" />
        </Form.Item>
        <Form.Item
          label="До"
          name="to"
          dependencies={["from"]}
          rules={[
            { required: true, message: "Укажите окончание" },
            timeRule,
            ({ getFieldValue }) => ({
              validator: (_, v?: string) => (!v || !getFieldValue("from") || v > getFieldValue("from") ? Promise.resolve() : Promise.reject(new Error("Позже начала"))),
            }),
          ]}
        >
          <Input type="time" />
        </Form.Item>
      </Space>
      <Form.Item label="Лимит заказов на слот" name="limit" extra="Пусто — без лимита">
        <InputNumber min={1} precision={0} />
      </Form.Item>
      <Form.Item label="Активен" name="active" valuePropName="checked" initialValue>
        <Switch />
      </Form.Item>
    </>
  );
  return (
    <>
      <Typography.Paragraph type="secondary">Слоты сразу видны клиентам в приложении — выпуск новой версии не нужен. Один слот — один день недели.</Typography.Paragraph>
      <CreateButton style={{ marginBottom: 12 }} onClick={() => create.show()}>Добавить слот</CreateButton>
      <Table {...tableProps} dataSource={rows} rowKey="id" size="small" scroll={{ x: true }} pagination={false}>
        <Table.Column<DeliverySlot> dataIndex="weekday" title="День" render={(d: number) => DAYS[d]?.label ?? d} />
        <Table.Column<DeliverySlot> title="Время" render={(_, r) => `${r.from}–${r.to}`} />
        <Table.Column<DeliverySlot> dataIndex="limit" title="Лимит" align="right" render={(v) => v ?? "—"} />
        <Table.Column<DeliverySlot> dataIndex="active" title="Активен" render={(v, r) => <ActiveSwitch resource={resource} id={r.id} active={v} label={`${DAYS[r.weekday]?.label} ${r.from}–${r.to}`} />} />
        <Table.Column<DeliverySlot> title="" render={(_, r) => (
          <Space>
            <Button size="small" onClick={() => edit.show(r.id)}>Изменить</Button>
            <DeleteButton size="small" resource={resource} recordItemId={r.id} hideText confirmTitle="Удалить слот?" confirmOkText="Удалить" confirmCancelText="Отмена" />
          </Space>
        )} />
      </Table>
      <Modal {...create.modalProps} title="Новый слот">
        <Form {...create.formProps} layout="vertical">{fields}</Form>
      </Modal>
      <Modal {...edit.modalProps} title="Слот доставки">
        <Form {...edit.formProps} layout="vertical">{fields}</Form>
      </Modal>
    </>
  );
};

const Pickup = () => {
  const { formProps, saveButtonProps } = useForm<Settings>({ resource: "settings", id: "main", action: "edit", redirect: false });
  return (
    <Form {...formProps} layout="vertical" style={{ maxWidth: 480 }}>
      <Form.Item label="Адрес самовывоза" name="pickupAddress" rules={[{ required: true, whitespace: true, message: "Укажите адрес" }]}>
        <Input />
      </Form.Item>
      <Form.Item label="Часы работы" name="pickupHours" rules={[{ required: true, whitespace: true, message: "Укажите часы" }]}>
        <Input placeholder="Ежедневно 08:00–22:00" />
      </Form.Item>
      <Button type="primary" {...saveButtonProps}>Сохранить</Button>
    </Form>
  );
};

export const DeliveryPage = () => (
  <Card title="Доставка">
    <Tabs
      destroyOnHidden
      items={[
        { key: "zones", label: "Зоны", children: <Zones /> },
        { key: "slots", label: "Слоты", children: <Slots /> },
        { key: "pickup", label: "Самовывоз", children: <Pickup /> },
      ]}
    />
  </Card>
);
