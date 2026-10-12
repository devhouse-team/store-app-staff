import {
  AppstoreOutlined,
  AuditOutlined,
  CarOutlined,
  DashboardOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from "@ant-design/icons";

// Menu groups are label-only parent resources.
const group = (name: string, label: string, icon: React.ReactNode) => ({ name, meta: { label, icon } });

export const resources = [
  { name: "dashboard", list: "/", meta: { label: "Дашборд", icon: <DashboardOutlined /> } },
  group("sales", "Продажи", <ShoppingCartOutlined />),
  { name: "orders", list: "/orders", show: "/orders/:id", meta: { label: "Заказы", parent: "sales" } },
  { name: "orders", identifier: "payments", list: "/payments", meta: { label: "Переводы", parent: "sales" } },
  { name: "invoices", list: "/invoices", meta: { label: "Накладные", parent: "sales" } },
  group("catalog", "Каталог", <AppstoreOutlined />),
  { name: "products", list: "/products", create: "/products/create", edit: "/products/:id/edit", meta: { label: "Товары", parent: "catalog", canDelete: true } },
  { name: "categories", list: "/categories", meta: { label: "Категории", parent: "catalog", canDelete: true } },
  { name: "stock", list: "/stock", meta: { label: "Остатки", parent: "catalog" } },
  { name: "imports", list: "/imports", meta: { label: "Импорт / экспорт", parent: "catalog" } },
  { name: "stock_movements", meta: { hide: true } },
  group("clients", "Покупатели", <TeamOutlined />),
  { name: "customers", list: "/customers", show: "/customers/:id", meta: { label: "Клиенты", parent: "clients" } },
  { name: "wholesale_requests", list: "/wholesale", show: "/wholesale/:id", meta: { label: "Заявки на опт", parent: "clients" } },
  { name: "conditions", list: "/conditions", create: "/conditions/create", edit: "/conditions/:id/edit", meta: { label: "Условия", parent: "clients", canDelete: true } },
  group("logistics", "Доставка", <CarOutlined />),
  { name: "delivery_zones", list: "/delivery", meta: { label: "Зоны и слоты", parent: "logistics" } },
  { name: "delivery_slots", meta: { hide: true } },
  { name: "couriers", list: "/couriers", meta: { label: "Курьеры", parent: "logistics", canDelete: true } },
  { name: "audit_log", list: "/audit", meta: { label: "Журнал действий", icon: <AuditOutlined /> } },
  { name: "profile", list: "/profile", meta: { label: "Профиль", hide: true } },
  { name: "settings", list: "/settings", meta: { label: "Настройки", icon: <SettingOutlined /> } },
];

