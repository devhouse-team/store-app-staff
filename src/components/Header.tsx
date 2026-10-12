import type { RefineThemedLayoutHeaderProps } from "@refinedev/antd";
import { UserOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@refinedev/core";
import { useLocation, useNavigate } from "react-router";
import { Button, Divider, Grid, Layout, Space, Tooltip, theme } from "antd";
import { AttentionCounters } from "../pages/dashboard";

export const Header: React.FC<RefineThemedLayoutHeaderProps> = () => {
  const { token } = theme.useToken();
  const { data: user } = useGetIdentity<{ name: string }>();
  const wide = !!Grid.useBreakpoint().md;
  const navigate = useNavigate();
  const onProfile = useLocation().pathname === "/profile";
  return (
    <Layout.Header
      style={{
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0 16px",
        height: 64,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <Space size={0} split={wide ? <Divider type="vertical" style={{ height: 24, marginInline: 16 }} /> : null}>
        <AttentionCounters />
        <Tooltip title={wide ? undefined : "Профиль"}>
          <Button
            type={onProfile ? "primary" : "text"}
            icon={<UserOutlined />}
            onClick={() => navigate("/profile")}
            aria-label={`Профиль${user?.name ? `: ${user.name}` : ""}`}
            aria-current={onProfile ? "page" : undefined}
            style={{ height: 40, minWidth: 44, fontWeight: 600, marginLeft: wide ? 0 : 8 }}
          >
            {wide && user?.name}
          </Button>
        </Tooltip>
      </Space>
    </Layout.Header>
  );
};
