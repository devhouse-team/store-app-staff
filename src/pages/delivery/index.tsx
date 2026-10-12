import { CreateButton, useForm, useModalForm, useTable } from "@refinedev/antd";
import { useUpdate } from "@refinedev/core";
import { Button, Card, Checkbox, Form, Input, InputNumber, Modal, Switch, Table, Tabs, Tag, TimePicker, Typography } from "antd";
import dayjs from "dayjs";
import { tenge } from "../../lib/format";
import type { DeliverySlot, DeliveryZone, Settings } from "../../types";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, i) => ({ label, value: i + 1 }));
const money = { min: 0, step: 100, style: { width: "100%" }, addonAfter: "₸" } as const;

const ActiveSwitch = ({ resource, id, active, label }: { resource: string; id: string; active: boolean; label: string }) => {
  const { mutate } = useUpdate();
  return (
    <Switch size="small" checked={active} aria-label={`Активна: ${label}`} onChange={(v) => mutate({ resource, id, values: { active: v } })} />
  );
};

const Zones = () => {
  const resource = "delivery_zones";
  const { tableProps } = useTable<DeliveryZone>({ resource, syncWithLocation: false, pagination: { mode: "off" }, sorters: { initial: [{ field: "settlement", order: "asc" }] } });
  const create = useModalForm<DeliveryZone>({ resource, action: "create", syncWithLocation: false });
  const edit = useModalForm<DeliveryZone>({ resource, action: "edit", syncWithLocation: false });
  const fields = (
    <>
      <Form.Item label="Населённый пункт" name="settlement" rules={[{ required: true, whitespace: true, message: "Укажите населённый пункт" }]}>
        <Input />
      </Form.Item>
      <Form.Item label="Стоимость доставки" name="fee" rules={[{ required: true, message: "Укажите стоимость" }]}>
        <InputNumber {...money} />
      </Form.Item>
      <Form.Item label="Бесплатно от суммы" name="freeFrom" extra="Пусто — бесплатной доставки нет">
        <InputNumber {...money} />
      </Form.Item>
      <Form.Item label="Мин. заказ (розница)" name="minOrderRetail" rules={[{ required: true, message: "Укажите сумму" }]}>
        <InputNumber {...money} />
      </Form.Item>
      <Form.Item label="Мин. заказ (опт)" name="minOrderWholesale" rules={[{ required: true, message: "Укажите сумму" }]}>
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
        <Table.Column<DeliveryZone> dataIndex="settlement" title="Населённый пункт" />
        <Table.Column<DeliveryZone> dataIndex="fee" title="Доставка" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="freeFrom" title="Бесплатно от" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="minOrderRetail" title="Мин. розница" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="minOrderWholesale" title="Мин. опт" align="right" render={(v) => tenge(v)} />
        <Table.Column<DeliveryZone> dataIndex="active" title="Активна" render={(v, r) => <ActiveSwitch resource={resource} id={r.id} active={v} label={r.settlement} />} />
        <Table.Column<DeliveryZone> title="" render={(_, r) => <Button size="small" onClick={() => edit.show(r.id)}>Изменить</Button>} />
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

// Slots are stored as 'HH:mm' strings; TimePicker works with dayjs.
const timeProps = {
  getValueProps: (v?: string) => ({ value: v ? dayjs(`2000-01-01T${v}`) : undefined }),
  normalize: (v?: dayjs.Dayjs | null) => v?.format("HH:mm"),
};

const Slots = () => {
  const resource = "delivery_slots";
  const { tableProps } = useTable<DeliverySlot>({ resource, syncWithLocation: false, pagination: { mode: "off" }, sorters: { initial: [{ field: "from", order: "asc" }] } });
  const create = useModalForm<DeliverySlot>({ resource, action: "create", syncWithLocation: false });
  const edit = useModalForm<DeliverySlot>({ resource, action: "edit", syncWithLocation: false });
  const fields = (
    <>
      <Form.Item label="Дни недели" name="days" rules={[{ required: true, type: "array", min: 1, message: "Выберите хотя бы один день" }]} initialValue={[1, 2, 3, 4, 5, 6, 7]}>
        <Checkbox.Group options={DAYS} />
      </Form.Item>
      <Form.Item label="С" name="from" rules={[{ required: true, message: "Укажите начало" }]} {...timeProps}>
        <TimePicker format="HH:mm" minuteStep={15} needConfirm={false} />
      </Form.Item>
      <Form.Item
        label="До"
        name="to"
        dependencies={["from"]}
        {...timeProps}
        rules={[
          { required: true, message: "Укажите окончание" },
          ({ getFieldValue }) => ({
            validator: (_, v?: string) => (!v || !getFieldValue("from") || v > getFieldValue("from") ? Promise.resolve() : Promise.reject(new Error("Окончание должно быть позже начала"))),
          }),
        ]}
      >
        <TimePicker format="HH:mm" minuteStep={15} needConfirm={false} />
      </Form.Item>
      <Form.Item label="Лимит заказов на слот" name="limit" rules={[{ required: true, message: "Укажите лимит" }]} initialValue={10}>
        <InputNumber min={1} precision={0} />
      </Form.Item>
      <Form.Item label="Активен" name="active" valuePropName="checked" initialValue>
        <Switch />
      </Form.Item>
    </>
  );
  return (
    <>
      <Typography.Paragraph type="secondary">Слоты сразу видны клиентам в приложении — выпуск новой версии не нужен.</Typography.Paragraph>
      <CreateButton style={{ marginBottom: 12 }} onClick={() => create.show()}>Добавить слот</CreateButton>
      <Table {...tableProps} rowKey="id" size="small" scroll={{ x: true }} pagination={false}>
        <Table.Column<DeliverySlot> title="Время" render={(_, r) => `${r.from}–${r.to}`} />
        <Table.Column<DeliverySlot>
          dataIndex="days"
          title="Дни"
          render={(d: number[]) => (d.length === 7 ? "Ежедневно" : DAYS.filter((x) => d.includes(x.value)).map((x) => <Tag key={x.value}>{x.label}</Tag>))}
        />
        <Table.Column<DeliverySlot> dataIndex="limit" title="Лимит" align="right" />
        <Table.Column<DeliverySlot> dataIndex="active" title="Активен" render={(v, r) => <ActiveSwitch resource={resource} id={r.id} active={v} label={`${r.from}–${r.to}`} />} />
        <Table.Column<DeliverySlot> title="" render={(_, r) => <Button size="small" onClick={() => edit.show(r.id)}>Изменить</Button>} />
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
