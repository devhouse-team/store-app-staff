import { useForm } from "@refinedev/antd";
import { Button, Card, Col, Form, Input, InputNumber, Row } from "antd";
import type { Settings } from "../../types";
import { PHONE_RULE } from "../couriers";

const req = (message: string) => ({ required: true, whitespace: true, message });

export const SettingsPage = () => {
  const { formProps, saveButtonProps } = useForm<Settings>({ resource: "settings", id: "main", action: "edit", redirect: false });
  return (
    <Form {...formProps} layout="vertical">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Реквизиты (для накладных)">
            <Form.Item label="Наименование" name="legalName" rules={[req("Укажите наименование")]}><Input /></Form.Item>
            <Form.Item label="БИН / ИИН" name="bin" rules={[{ required: true, message: "Укажите БИН" }, { pattern: /^\d{12}$/, message: "12 цифр" }]}>
              <Input inputMode="numeric" maxLength={12} />
            </Form.Item>
            <Form.Item label="Юридический адрес" name="legalAddress" rules={[req("Укажите адрес")]}><Input /></Form.Item>
            <Form.Item label="Банк" name="bank" rules={[req("Укажите банк")]}><Input /></Form.Item>
            <Form.Item label="ИИК (IBAN)" name="iban" rules={[req("Укажите ИИК")]}><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={12}><Form.Item label="БИК" name="bik"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="КБе" name="kbe"><Input /></Form.Item></Col>
            </Row>
            <Form.Item label="НДС, %" name="vatRate" rules={[{ required: true, message: "Укажите ставку" }]}>
              <InputNumber min={0} max={100} precision={2} />
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
          </Card>
          <Card size="small" title="Контакты поддержки (видны клиентам)" style={{ marginTop: 16 }}>
            <Form.Item label="Телефон" name="supportPhone" rules={[{ required: true, message: "Укажите телефон" }, PHONE_RULE]}>
              <Input inputMode="tel" />
            </Form.Item>
            <Form.Item label="Email" name="supportEmail" rules={[{ type: "email", message: "Неверный email" }]}>
              <Input inputMode="email" />
            </Form.Item>
            <Form.Item label="Telegram" name="supportTelegram">
              <Input placeholder="@tolyq_support" />
            </Form.Item>
          </Card>
        </Col>
      </Row>
      <Button type="primary" {...saveButtonProps} style={{ marginTop: 16 }}>Сохранить</Button>
    </Form>
  );
};
