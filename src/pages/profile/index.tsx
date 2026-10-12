import { LockOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useGetIdentity, useInvalidateAuthStore, useList, useLogout, useNotification, useUpdatePassword } from "@refinedev/core";
import { Avatar, Button, Card, Col, Descriptions, Form, Input, List, Row, Space, Tag, Typography, theme } from "antd";
import { useState } from "react";
import { Link } from "react-router";
import { dateTime } from "../../lib/format";
import { saveStaffProfile } from "../../providers/auth";
import { resources } from "../../resources";
import type { AuditEntry } from "../../types";

type Identity = { name: string; email: string; role: string; phone: string | null };
const ROLE: Record<string, string> = { admin: "Администратор" };
const ACTION = { create: "создал(а)", update: "изменил(а)", delete: "удалил(а)" } as const;
const sectionLabel = (name: string) => resources.find((r) => r.name === name)?.meta?.label ?? name;
const PHONE = /^\+7 \d{3} \d{3} \d{2} \d{2}$/;

export const ProfilePage = () => {
  const { data: me } = useGetIdentity<Identity>();
  const { token } = theme.useToken();
  const invalidateAuth = useInvalidateAuthStore();
  const { open } = useNotification();
  const { mutate: logout } = useLogout();
  const { mutate: updatePassword, isPending: passPending } = useUpdatePassword<{ currentPassword: string; password: string }>();
  const [passForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const { result: mine, query } = useList<AuditEntry>({
    resource: "audit_log",
    filters: [{ field: "staff", operator: "eq", value: me?.name }],
    sorters: [{ field: "createdAt", order: "desc" }],
    pagination: { pageSize: 8 },
    queryOptions: { enabled: !!me?.name },
  });

  if (!me) return <Card loading />;

  const saveProfile = async (v: { name: string; phone?: string }) => {
    setSaving(true);
    saveStaffProfile({ name: v.name.trim(), phone: v.phone?.trim() || null });
    await invalidateAuth();
    setSaving(false);
    open?.({ type: "success", message: "Профиль сохранён" });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space size={16} align="center" wrap>
          <Avatar size={56} icon={<UserOutlined />} style={{ background: token.colorPrimary }} aria-hidden />
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>{me.name}</Typography.Title>
            <Space size={8} wrap>
              <Typography.Text type="secondary">{me.email}</Typography.Text>
              <Tag color="green">{ROLE[me.role] ?? me.role}</Tag>
            </Space>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Личные данные">
            <Form layout="vertical" requiredMark={false} initialValues={{ name: me.name, phone: me.phone ?? "" }} onFinish={saveProfile}>
              <Form.Item label="Имя" name="name" rules={[{ required: true, whitespace: true, message: "Введите имя" }]} extra="Так вас видят коллеги в журнале действий.">
                <Input autoComplete="name" />
              </Form.Item>
              <Form.Item label="Почта для входа">
                <Input value={me.email} disabled />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Сменить почту может владелец магазина.</Typography.Text>
              </Form.Item>
              <Form.Item label="Телефон" name="phone" rules={[{ pattern: PHONE, message: "Формат: +7 700 000 00 00" }]}>
                <Input autoComplete="tel" placeholder="+7 700 000 00 00" inputMode="tel" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>Сохранить</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><LockOutlined />Смена пароля</Space>}>
            <Form
              form={passForm}
              layout="vertical"
              requiredMark={false}
              onFinish={(v) =>
                updatePassword({ currentPassword: v.currentPassword, password: v.password }, { onSuccess: (r) => r.success && passForm.resetFields() })
              }
            >
              <Form.Item label="Текущий пароль" name="currentPassword" rules={[{ required: true, message: "Введите текущий пароль" }]}>
                <Input.Password autoComplete="current-password" />
              </Form.Item>
              <Form.Item
                label="Новый пароль"
                name="password"
                rules={[{ required: true, message: "Введите новый пароль" }, { min: 8, message: "Минимум 8 символов" }]}
                extra="Не короче 8 символов."
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                label="Повторите новый пароль"
                name="confirm"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Повторите пароль" },
                  ({ getFieldValue }) => ({
                    validator: (_, v) => (!v || v === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("Пароли не совпадают"))),
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button htmlType="submit" loading={passPending}>Изменить пароль</Button>
            </Form>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Мои последние действия" extra={<Link to="/audit">Весь журнал</Link>}>
        <List
          loading={query.isLoading}
          dataSource={mine?.data ?? []}
          locale={{ emptyText: "Пока нет действий" }}
          renderItem={(a) => (
            <List.Item>
              <span>
                {ACTION[a.action]} · {sectionLabel(a.resource)} · <Typography.Text code>{a.recordId}</Typography.Text>
              </span>
              <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>{dateTime(a.createdAt)}</Typography.Text>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small">
        <Descriptions size="small" column={1} items={[{ label: "Роль", children: `${ROLE[me.role] ?? me.role} — полный доступ ко всем разделам` }]} />
        <Button danger icon={<LogoutOutlined />} onClick={() => logout()} style={{ marginTop: 8 }}>Выйти из аккаунта</Button>
      </Card>
    </Space>
  );
};
