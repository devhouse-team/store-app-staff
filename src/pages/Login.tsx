import { useForgotPassword, useLogin } from "@refinedev/core";
import { Button, Card, Checkbox, Form, Input, Typography } from "antd";

type Values = { email: string; password: string; remember?: boolean };

export const Login = () => {
  const { mutate: login, isPending } = useLogin<Values>();
  const { mutate: forgot, isPending: sending } = useForgotPassword<{ email: string }>();
  const [form] = Form.useForm<Values>();
  const resetPassword = () =>
    form.validateFields(["email"]).then(({ email }) => forgot({ email: email.trim() })).catch(() => undefined);

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Tolyq — вход для персонала
        </Typography.Title>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => login(v)}>
          <Form.Item label="Почта" name="email" rules={[{ required: true, whitespace: true, message: "Введите почту" }]}>
            <Input autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true, message: "Введите пароль" }]}>
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>Запомнить меня</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={isPending}>
            Войти
          </Button>
          <Button type="link" block loading={sending} onClick={resetPassword} style={{ marginTop: 8 }}>
            Забыли пароль? Отправить ссылку на почту
          </Button>
        </Form>
      </Card>
    </div>
  );
};
