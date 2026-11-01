import { LockOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useForgotPassword, useGetIdentity, useInvalidateAuthStore, useList, useLogout, useNotification } from "@refinedev/core";
import { Avatar, Button, Card, Col, Descriptions, Form, Input, List, Row, Space, Tag, Typography, theme } from "antd";
import { useState } from "react";
import { Link } from "react-router";
import { dateTime } from "../../lib/format";
import { saveStaffProfile, type StaffIdentity } from "../../providers/auth";
import type { AuditEntry } from "../../types";
import { ENTITY, actionTag } from "../audit";

const ROLE: Record<string, string> = { admin: "Администратор", staff: "Сотрудник" };

export const ProfilePage = () => {
  const { data: me } = useGetIdentity<StaffIdentity>();
  const { token } = theme.useToken();
  const invalidateAuth = useInvalidateAuthStore();
  const { open } = useNotification();
  const { mutate: logout } = useLogout();
  const { mutate: forgot, isPending: sending } = useForgotPassword<{ email: string }>();
  const [saving, setSaving] = useState(false);

  const { result: mine, query } = useList<AuditEntry>({
    resource: "audit_log",
    filters: [{ field: "staffId", operator: "eq", value: me?.id }],
    pagination: { pageSize: 8 },
    queryOptions: { enabled: !!me?.id },
  });

  if (!me) return <Card loading />;

  const saveProfile = async (v: { name: string }) => {
    setSaving(true);
    try {
      await saveStaffProfile(me.username, v.name.trim());
      await invalidateAuth();
      open?.({ type: "success", message: "Профиль сохранён" });
    } catch (e) {
      open?.({ type: "error", message: "Не удалось сохранить", description: (e as Error).message });
    } finally {
      setSaving(false);
    }
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
              <Tag color="green">{ROLE[me.role]}</Tag>
            </Space>
          </div>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Личные данные">
            <Form layout="vertical" requiredMark={false} initialValues={{ name: me.name }} onFinish={saveProfile}>
              <Form.Item label="Имя" name="name" rules={[{ required: true, whitespace: true, message: "Введите имя" }]} extra="Так вас видят коллеги в журнале действий.">
                <Input autoComplete="name" />
              </Form.Item>
              <Form.Item label="Почта для входа">
                <Input value={me.email} disabled />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Сменить почту может владелец магазина.</Typography.Text>
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={saving}>Сохранить</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card size="small" title={<Space><LockOutlined />Смена пароля</Space>}>
            <Typography.Paragraph>
              Пароль меняется по ссылке из письма: мы отправим её на {me.email}.
            </Typography.Paragraph>
            <Button loading={sending} onClick={() => forgot({ email: me.email })}>Отправить ссылку для смены пароля</Button>
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
              <Space size={4} wrap>
                {actionTag(a.action)} {ENTITY[a.resource] ?? a.resource} · <Typography.Text code>{a.recordId}</Typography.Text>
              </Space>
              <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>{dateTime(a.createdAt)}</Typography.Text>
            </List.Item>
          )}
        />
      </Card>

      <Card size="small">
        <Descriptions size="small" column={1} items={[{ label: "Роль", children: ROLE[me.role] }]} />
        <Button danger icon={<LogoutOutlined />} onClick={() => logout()} style={{ marginTop: 8 }}>Выйти из аккаунта</Button>
      </Card>
    </Space>
  );
};
