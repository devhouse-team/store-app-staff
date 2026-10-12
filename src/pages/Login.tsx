import { useLogin } from "@refinedev/core";
import { Button, Card, Form, Input, Typography } from "antd";
import { MOCK_STAFF } from "../providers/auth";

export const Login = () => {
  const { mutate: login, isPending } = useLogin<{ email: string; password: string }>();
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 380 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Tolyq — вход для персонала
        </Typography.Title>
        <Form layout="vertical" requiredMark={false} onFinish={(v) => login(v)} initialValues={import.meta.env.DEV ? MOCK_STAFF : undefined}>
          <Form.Item label="Почта" name="email" rules={[{ required: true, type: "email", message: "Введите почту" }]}>
            <Input autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item label="Пароль" name="password" rules={[{ required: true, message: "Введите пароль" }]}>
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={isPending}>
            Войти
          </Button>
        </Form>
        {import.meta.env.DEV && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
            Мок: {MOCK_STAFF.email} / {MOCK_STAFF.password}
          </Typography.Paragraph>
        )}
      </Card>
    </div>
  );
};
