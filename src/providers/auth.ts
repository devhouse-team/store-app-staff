// Mock staff auth (B19): email + password, lockout after 5 failed attempts.
// ponytail: credentials are client-side mock only — real check, sessions and reset live in B19.
import type { AuthProvider } from "@refinedev/core";

const KEY = "tolyq-staff-auth";
const FAILS = "tolyq-staff-fails";
const PASS = "tolyq-staff-pass"; // mock: password changed on the profile page
export const MOCK_STAFF = { email: "admin@tolyq.kz", password: "admin123", name: "Айдана", role: "admin" };

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const fails = Number(read(FAILS) ?? 0);
    if (fails >= 5)
      return { success: false, error: { name: "Вход заблокирован", message: "5 неудачных попыток. Обратитесь к владельцу." } };
    if (email?.trim().toLowerCase() === MOCK_STAFF.email && password === (read(PASS) ?? MOCK_STAFF.password)) {
      write(FAILS, null);
      const saved = read(KEY + "-profile");
      write(KEY, saved ?? JSON.stringify({ email: MOCK_STAFF.email, name: MOCK_STAFF.name, role: MOCK_STAFF.role, phone: null }));
      return { success: true, redirectTo: "/" };
    }
    write(FAILS, String(fails + 1));
    return { success: false, error: { name: "Неверная почта или пароль", message: `Осталось попыток: ${4 - fails}` } };
  },
  logout: async () => {
    write(KEY, null);
    return { success: true, redirectTo: "/login" };
  },
  check: async () => (read(KEY) ? { authenticated: true } : { authenticated: false, redirectTo: "/login" }),
  getIdentity: async () => {
    const raw = read(KEY);
    return raw ? { id: 1, ...JSON.parse(raw) } : null;
  },
  getPermissions: async () => (read(KEY) ? "admin" : null),
  updatePassword: async ({ currentPassword, password }) => {
    if (currentPassword !== (read(PASS) ?? MOCK_STAFF.password))
      return { success: false, error: { name: "Неверный текущий пароль", message: "Проверьте и попробуйте ещё раз" } };
    write(PASS, password);
    return { success: true, successNotification: { message: "Используйте новый пароль при следующем входе", description: "Пароль изменён" } };
  },
  forgotPassword: async () => ({ success: true, successNotification: { message: "Ссылка для сброса отправлена (мок)" } }),
  onError: async (error) => (error?.statusCode === 401 ? { logout: true } : {}),
};

/** Mock profile save (name, phone). Real endpoint: B19 staff profile. */
export const saveStaffProfile = (patch: { name: string; phone: string | null }) => {
  const next = JSON.stringify({ ...JSON.parse(read(KEY) ?? "{}"), ...patch });
  write(KEY, next);
  write(KEY + "-profile", next);
};
