// Ant Design tokens from mobile/DESIGN.md §3 (one brand across app and staff panel).
import type { ThemeConfig } from "antd";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: "#176B50",
    colorLink: "#176B50",
    colorSuccess: "#237A45",
    colorWarning: "#A25B0A",
    colorError: "#BD3535",
    colorInfo: "#176B50",
    colorText: "#20352B",
    colorTextSecondary: "#63766B",
    colorTextDisabled: "#A6B3AA",
    colorBgLayout: "#FAFAF6",
    colorPrimaryBg: "#E8F5EC", // primarySoft (antd's derived tint came out grey)
    colorPrimaryBgHover: "#D4EDDC",
    colorPrimaryBorder: "#B9DCC5",
    colorPrimaryText: "#104B39", // primaryDark, 8.9:1 on primarySoft
    colorSuccessBg: "#E8F5EC", // primarySoft
    colorSuccessBorder: "#B9DCC5",
    colorInfoBg: "#E8F5EC",
    colorInfoBorder: "#B9DCC5",
    colorWarningBg: "#FFF4E2", // accentSoft
    colorWarningBorder: "#FFD99A",
    colorErrorBg: "#FDECEC", // errorSoft
    colorErrorBorder: "#F3B8B8",
    colorBgContainer: "#FFFFFF",
    colorBorder: "#7C8C82", // input boundaries (3.5:1)
    colorBorderSecondary: "#E1E8E1", // decorative dividers
    fontFamily: "'Inter Variable', 'Noto Sans', system-ui, sans-serif",
    fontSize: 14,
    borderRadius: 8,
    controlHeight: 36,
  },
  components: {
    Layout: { siderBg: "#FFFFFF", headerBg: "#FFFFFF" },
    Menu: { itemSelectedBg: "#E8F5EC", itemSelectedColor: "#104B39" },
    Table: { headerBg: "#F3F6F2", cellPaddingBlockSM: 6 },
  },
};
