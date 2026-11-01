// Thin fetch client for the Tolyq backend (staff side): session cookie + X-CSRF-Token on unsafe methods.
// Dev: VITE_API_URL is empty, requests go to relative /api through the Vite proxy (same origin).
// Prod (Vercel): also empty; vercel.json rewrites /api to https://api.tolyq-store.kz, so the session cookie is first-party.
import type { HttpError } from "@refinedev/core";

export const API_URL = `${import.meta.env?.VITE_API_URL ?? ""}/api/v1`; // env is undefined under node (data.check.ts)

const CSRF_KEY = "tolyq-staff-csrf";
let csrf: string | null = (() => {
  try {
    return sessionStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
})();

export const setCsrf = (token: string | null) => {
  csrf = token;
  try {
    if (token) sessionStorage.setItem(CSRF_KEY, token);
    else sessionStorage.removeItem(CSRF_KEY);
  } catch {
    /* private mode — memory only */
  }
};
export const hasCsrf = () => !!csrf;

/** New CSRF token for the current session cookie (e.g. a new tab lost sessionStorage). */
export const refreshCsrf = async () => {
  const res = await fetch(`${API_URL}/admin/auth/refresh-csrf`, { method: "POST", credentials: "include" });
  if (!res.ok) return false;
  setCsrf(((await res.json()) as { csrf_token: string }).csrf_token);
  return true;
};

export type Query = Record<string, string | number | boolean | null | undefined>;
type Opts = { query?: Query; body?: unknown };

const buildUrl = (path: string, query?: Query) => {
  const url = new URL(API_URL + path, globalThis.location?.origin ?? "http://localhost");
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== "") url.searchParams.set(k, String(v));
  return url;
};

const send = (method: string, path: string, { query, body }: Opts) => {
  const raw = body instanceof FormData || body instanceof URLSearchParams;
  const headers: Record<string, string> = {};
  if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrf) headers["X-CSRF-Token"] = csrf;
  return fetch(buildUrl(path, query), {
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
  });
};

const toError = async (res: Response): Promise<HttpError> => {
  const j = await res.json().catch(() => null);
  const e = j?.error;
  const message = e?.message ?? (typeof j?.detail === "string" ? j.detail : null) ?? (res.statusText || "Ошибка сервера");
  return { message, statusCode: res.status, errors: e?.details };
};

/** JSON request; throws Refine HttpError ({ message, statusCode }) built from the {"error": {...}} envelope. */
export async function api<T = unknown>(method: string, path: string, opts: Opts = {}): Promise<T> {
  let res = await send(method, path, opts);
  // Stale CSRF token (rotated server-side or lost) → refresh once and retry.
  // The X-CSRF-Error header isn't CORS-exposed in prod, so the message is checked too.
  if (res.status === 403 && method !== "GET") {
    const csrfFail = res.headers.has("X-CSRF-Error") || /csrf/i.test((await toError(res.clone())).message);
    if (csrfFail && (await refreshCsrf())) res = await send(method, path, opts);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return null as T;
  return (res.headers.get("content-type")?.includes("json") ? res.json() : res.text()) as Promise<T>;
}

/** Downloads an authenticated file (CSV/XLSX/PDF) through fetch so the session cookie is sent. */
export const download = async (path: string, fileName: string, query?: Query) => {
  const res = await send("GET", path, { query });
  if (!res.ok) throw await toError(res);
  const url = URL.createObjectURL(await res.blob());
  Object.assign(document.createElement("a"), { href: url, download: fileName }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
