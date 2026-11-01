// Staff auth (B19): session cookie from POST /admin/auth/login, CSRF token kept by ./api.
import type { AuthProvider } from "@refinedev/core";
import { api, hasCsrf, refreshCsrf, setCsrf } from "./api";

export type StaffIdentity = {
  id: number;
  name: string;
  username: string;
  email: string;
  is_superuser: boolean;
  permissions: string[];
  role: "admin" | "staff";
};

const me = async (): Promise<StaffIdentity> => {
  const m = await api<Omit<StaffIdentity, "role">>("GET", "/admin/staff/me");
  return { ...m, role: m.is_superuser ? "admin" : "staff" };
};

const LOGIN_ERRORS: Record<number, string> = {
  401: "Неверная почта или пароль",
  403: "Вход отклонён",
  429: "Слишком много попыток. Попробуйте позже.",
};

export const authProvider: AuthProvider = {
  login: async ({ email, password, remember }) => {
    try {
      const body = new URLSearchParams({ username: String(email ?? "").trim(), password: String(password ?? "") });
      if (remember) body.set("remember_me", "true");
      const res = await api<{ csrf_token: string }>("POST", "/admin/auth/login", { body });
      setCsrf(res.csrf_token);
      await me(); // a non-staff account gets a session too, but /admin/staff/me answers 403
      return { success: true, redirectTo: "/" };
    } catch (e) {
      const { statusCode, message } = e as { statusCode?: number; message?: string };
      if (statusCode === 403) await api("POST", "/admin/auth/logout").catch(() => undefined);
      const name = LOGIN_ERRORS[statusCode ?? 0];
      return { success: false, error: { name: name ?? "Не удалось войти", message: name ? "" : (message ?? "") } };
    }
  },
  logout: async () => {
    await api("POST", "/admin/auth/logout").catch(() => undefined);
    setCsrf(null);
    return { success: true, redirectTo: "/login" };
  },
  check: async () => {
    try {
      await me();
      if (!hasCsrf()) await refreshCsrf();
      return { authenticated: true };
    } catch {
      setCsrf(null);
      return { authenticated: false, logout: true, redirectTo: "/login" };
    }
  },
  getIdentity: async () => me().catch(() => null),
  getPermissions: async () => (await me().catch(() => null))?.permissions ?? null,
  forgotPassword: async ({ email }) => {
    try {
      await api("POST", "/staff/password-reset", { body: { email } });
      return { success: true, successNotification: { message: "Если такая почта есть, на неё придёт ссылка для сброса пароля" } };
    } catch (e) {
      return { success: false, error: { name: "Не удалось отправить ссылку", message: (e as Error).message } };
    }
  },
  onError: async (error) => (error?.statusCode === 401 ? { logout: true, redirectTo: "/login" } : {}),
};

/** Own display name: PATCH /users/{username} (self-update is allowed for every user). */
export const saveStaffProfile = (username: string, name: string) =>
  api("PATCH", `/users/${encodeURIComponent(username)}`, { body: { name } });
