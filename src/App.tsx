import { Authenticated, Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import { ErrorComponent, ThemedLayout, ThemedSider, ThemedTitle, useNotificationProvider } from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";
import routerProvider, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { App as AntdApp, ConfigProvider } from "antd";
import ruRU from "antd/locale/ru_RU";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";

import { Header } from "./components/Header";
import { authProvider } from "./providers/auth";
import { dataProvider } from "./providers/data";
import { i18nProvider } from "./providers/i18n";
import { theme } from "./theme";
import { resources } from "./resources";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/dashboard";
import { OrderList, OrderShow } from "./pages/orders";
import { PaymentList } from "./pages/payments";
import { InvoiceList } from "./pages/invoices";
import { ProductCreate, ProductEdit, ProductList } from "./pages/products";
import { CategoryList } from "./pages/categories";
import { ImportList } from "./pages/imports";
import { StockList } from "./pages/stock";
import { CustomerList, CustomerShow } from "./pages/customers";
import { WholesaleList, WholesaleShow } from "./pages/wholesale";
import { ConditionCreate, ConditionEdit, ConditionList } from "./pages/conditions";
import { DeliveryPage } from "./pages/delivery";
import { CourierList } from "./pages/couriers";
import { AuditList } from "./pages/audit";
import { SettingsPage } from "./pages/settings";
import { ProfilePage } from "./pages/profile";

dayjs.locale("ru");

const Title = ({ collapsed }: { collapsed: boolean }) => <ThemedTitle collapsed={collapsed} text="Tolyq · персонал" />;

export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider theme={theme} locale={ruRU}>
        <AntdApp>
          <RefineKbarProvider>
            <Refine
              dataProvider={dataProvider}
              authProvider={authProvider}
              i18nProvider={i18nProvider}
              routerProvider={routerProvider}
              notificationProvider={useNotificationProvider}
              resources={resources}
              options={{ syncWithLocation: true, warnWhenUnsavedChanges: true, disableTelemetry: true, title: { text: "Tolyq" } }}
            >
              <Routes>
                <Route
                  element={
                    <Authenticated key="app" fallback={<CatchAllNavigate to="/login" />}>
                      <ThemedLayout Header={Header} Title={Title} Sider={(p) => <ThemedSider {...p} Title={Title} fixed />}>
                        <Outlet />
                      </ThemedLayout>
                    </Authenticated>
                  }
                >
                  <Route index element={<Dashboard />} />
                  <Route path="/orders">
                    <Route index element={<OrderList />} />
                    <Route path=":id" element={<OrderShow />} />
                  </Route>
                  <Route path="/payments" element={<PaymentList />} />
                  <Route path="/invoices" element={<InvoiceList />} />
                  <Route path="/products">
                    <Route index element={<ProductList />} />
                    <Route path="create" element={<ProductCreate />} />
                    <Route path=":id/edit" element={<ProductEdit />} />
                  </Route>
                  <Route path="/categories" element={<CategoryList />} />
                  <Route path="/stock" element={<StockList />} />
                  <Route path="/imports" element={<ImportList />} />
                  <Route path="/customers">
                    <Route index element={<CustomerList />} />
                    <Route path=":id" element={<CustomerShow />} />
                  </Route>
                  <Route path="/wholesale">
                    <Route index element={<WholesaleList />} />
                    <Route path=":id" element={<WholesaleShow />} />
                  </Route>
                  <Route path="/conditions">
                    <Route index element={<ConditionList />} />
                    <Route path="create" element={<ConditionCreate />} />
                    <Route path=":id/edit" element={<ConditionEdit />} />
                  </Route>
                  <Route path="/delivery" element={<DeliveryPage />} />
                  <Route path="/couriers" element={<CourierList />} />
                  <Route path="/audit" element={<AuditList />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
                <Route
                  element={
                    <Authenticated key="auth" fallback={<Outlet />}>
                      <NavigateToResource resource="dashboard" />
                    </Authenticated>
                  }
                >
                  <Route path="/login" element={<Login />} />
                </Route>
              </Routes>
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler handler={({ resource }) => `${resource?.meta?.label ?? "Tolyq"} · Tolyq`} />
            </Refine>
          </RefineKbarProvider>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}
