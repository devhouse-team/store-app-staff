// In-memory DataProvider over the mock seed, persisted to localStorage.
// ponytail: swap for @refinedev/simple-rest (or an OpenAPI-based provider) once B2 lands;
// pages only use standard Refine hooks, so nothing else changes.
import type { BaseRecord, CrudFilter, CrudSort, DataProvider, LogicalFilter } from "@refinedev/core";
import { seed, type ResourceName } from "../mock/seed";

const KEY = "tolyq-staff-db-v1";
type Db = Record<ResourceName, BaseRecord[]>;

const load = (): Db => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode / corrupt — fall back to seed */
  }
  return structuredClone(seed) as unknown as Db;
};
let db = load();
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
};
export const resetMockDb = () => {
  db = structuredClone(seed) as unknown as Db;
  save();
};

const table = (resource: string) => {
  const t = db[resource as ResourceName];
  if (!t) throw new Error(`Unknown resource: ${resource}`);
  return t;
};

const get = (rec: BaseRecord, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], rec);

const match = (rec: BaseRecord, f: CrudFilter): boolean => {
  if (f.operator === "or") return f.value.some((x) => match(rec, x));
  if (f.operator === "and") return f.value.every((x) => match(rec, x));
  const { field, operator, value } = f as LogicalFilter;
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return true;
  const v = get(rec, field);
  const s = (x: unknown) => String(x ?? "").toLowerCase();
  switch (operator) {
    case "eq": return v === value || String(v) === String(value);
    case "ne": return String(v) !== String(value);
    case "in": return (value as unknown[]).map(String).includes(String(v));
    case "nin": return !(value as unknown[]).map(String).includes(String(v));
    case "contains": return s(v).includes(s(value));
    case "ncontains": return !s(v).includes(s(value));
    case "gt": return (v as number) > value;
    case "gte": return (v as number) >= value;
    case "lt": return (v as number) < value;
    case "lte": return (v as number) <= value;
    case "between": return (v as number) >= value[0] && (v as number) <= value[1];
    case "null": return v == null;
    case "nnull": return v != null;
    default: return true;
  }
};

const sortBy = (rows: BaseRecord[], sorters: CrudSort[] = []) =>
  [...rows].sort((a, b) => {
    for (const { field, order } of sorters) {
      const x = get(a, field) as string | number, y = get(b, field) as string | number;
      if (x === y) continue;
      const r = x > y ? 1 : -1;
      return order === "asc" ? r : -r;
    }
    return 0;
  });

const audit = (resource: string, recordId: string, action: "create" | "update" | "delete", before: unknown, after: unknown) => {
  if (resource === "audit_log") return;
  db.audit_log.unshift({
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    staff: currentStaffName(), resource, recordId, action, before, after, createdAt: new Date().toISOString(),
  });
};
const currentStaffName = () => {
  try {
    return JSON.parse(localStorage.getItem("tolyq-staff-auth") ?? "{}").name ?? "—";
  } catch {
    return "—";
  }
};

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 150));

export const dataProvider: DataProvider = {
  getApiUrl: () => "mock://",
  getList: async ({ resource, pagination, filters = [], sorters }) => {
    const rows = sortBy(table(resource).filter((r) => filters.every((f) => match(r, f))), sorters);
    const { currentPage = 1, pageSize = 10, mode = "server" } = pagination ?? {};
    const data = mode === "off" ? rows : rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return delay({ data: data as never[], total: rows.length });
  },
  getMany: async ({ resource, ids }) =>
    delay({ data: table(resource).filter((r) => ids.map(String).includes(String(r.id))) as never[] }),
  getOne: async ({ resource, id }) => {
    const rec = table(resource).find((r) => String(r.id) === String(id));
    if (!rec) throw { message: "Запись не найдена", statusCode: 404 };
    return delay({ data: rec as never });
  },
  create: async ({ resource, variables }) => {
    const rec = { id: `${resource.slice(0, 2)}-${Date.now().toString(36)}`, ...(variables as object) };
    table(resource).unshift(rec);
    audit(resource, String(rec.id), "create", null, rec);
    save();
    return delay({ data: rec as never });
  },
  update: async ({ resource, id, variables }) => {
    const t = table(resource);
    const i = t.findIndex((r) => String(r.id) === String(id));
    if (i < 0) throw { message: "Запись не найдена", statusCode: 404 };
    const before = t[i];
    const changed = Object.fromEntries(
      Object.entries(variables as object).filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v)),
    );
    t[i] = { ...before, ...(variables as object) };
    if (Object.keys(changed).length)
      audit(resource, String(id), "update", Object.fromEntries(Object.keys(changed).map((k) => [k, before[k]])), changed);
    save();
    return delay({ data: t[i] as never });
  },
  deleteOne: async ({ resource, id }) => {
    const t = table(resource);
    const i = t.findIndex((r) => String(r.id) === String(id));
    if (i < 0) throw { message: "Запись не найдена", statusCode: 404 };
    const [rec] = t.splice(i, 1);
    audit(resource, String(id), "delete", rec, null);
    save();
    return delay({ data: rec as never });
  },
};
