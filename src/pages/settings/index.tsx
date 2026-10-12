import { useForm } from "@refinedev/antd";
import { Alert, Button, Card, Col, Form, Input, InputNumber, Popconfirm, Row, Space, Switch, Typography } from "antd";
import { resetMockDb } from "../../providers/data";
import type { Settings } from "../../types";
import { PHONE_RULE } from "../couriers";

const req = (message: string) => ({ required: true, whitespace: true, message });

export const SettingsPage = () => {
  const { formProps, saveButtonProps } = useForm<Settings>({ resource: "settings", id: "main", action: "edit", redirect: false });
  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Form {...formProps} layout="vertical">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card size="small" title="Реквизиты">
              <Form.Item label="Наименование" name="legalName" rules={[req("Укажите наименование")]}><Input /></Form.Item>
              <Form.Item label="БИН / ИИН" name="bin" rules={[{ required: true, message: "Укажите БИН" }, { pattern: /^\d{12}$/, message: "12 цифр" }]}>
                <Input inputMode="numeric" maxLength={12} />
              </Form.Item>
              <Form.Item label="Юридический адрес" name="legalAddress" rules={[req("Укажите адрес")]}><Input /></Form.Item>
              <Form.Item label="Банк" name="bank" rules={[req("Укажите банк")]}><Input /></Form.Item>
              <Form.Item label="IBAN" name="iban" rules={[req("Укажите IBAN")]}><Input /></Form.Item>
              <Form.Item label="НДС, %" name="vatRate" rules={[{ required: true, message: "Укажите ставку" }]}>
                <InputNumber min={0} max={100} precision={0} />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card size="small" title="Оплата переводом">
              <Form.Item label="Получатель" name="transferRecipient" rules={[req("Укажите получателя")]}><Input /></Form.Item>
              <Form.Item label="Телефон Kaspi" name="kaspiPhone" rules={[{ required: true, message: "Укажите телефон" }, PHONE_RULE]}>
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item label="Номер карты" name="card"><Input /></Form.Item>
              <Form.Item label="Онлайн-оплата" name="onlinePaymentEnabled" valuePropName="checked" extra="Эквайринг ещё не подключён — включение пока ни на что не влияет.">
                <Switch />
              </Form.Item>
            </Card>
            <Card size="small" title="Контакты и оповещения" style={{ marginTop: 16 }}>
              <Form.Item label="Телефон поддержки" name="supportPhone" rules={[{ required: true, message: "Укажите телефон" }, PHONE_RULE]}>
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item label="WhatsApp поддержки" name="supportWhatsapp" rules={[PHONE_RULE]}>
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item label="Telegram-группа для оповещений персонала" name="telegramGroup" extra="Новые заказы, заявки на опт, переводы">
                <Input placeholder="@group" />
              </Form.Item>
            </Card>
          </Col>
        </Row>
        <Button type="primary" {...saveButtonProps} style={{ marginTop: 16 }}>Сохранить</Button>
      </Form>

      <Card size="small" title="Мок-данные">
        <Alert type="warning" showIcon message="Сбрасывает все изменения в демо-данных (заказы, товары, журнал) к исходному набору." style={{ marginBottom: 12 }} />
        <Popconfirm title="Сбросить мок-данные?" okText="Сбросить" cancelText="Отмена" okButtonProps={{ danger: true }} onConfirm={() => { resetMockDb(); location.reload(); }}>
          <Button danger>Сбросить мок-данные</Button>
        </Popconfirm>
        <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>Только для демо, пока не подключён бэкенд.</Typography.Paragraph>
      </Card>
    </Space>
  );
};
