// CSV in the P2 template: one row = one pack; rows sharing an Артикул are one product.
// Pure (type-only imports) — checked by csv.check.ts. Real Excel parsing is B12's job.
import type { Category, Pack, PackVisibility, Product } from "../../types";

export const COLUMNS = [
  "Артикул", "Штрихкод", "Название", "Категория", "Бренд", "Фасовка", "Ед.", "Кол-во в базовой ед.",
  "Розничная цена", "Оптовая цена", "Видимость", "Шаг", "Минимум", "Весовой", "Скоропорт",
  "Срок годности", "Предзаказ", "Остаток",
] as const;
type Col = (typeof COLUMNS)[number];

/** RFC 4180-ish: quotes, "" escapes, CRLF/LF, UTF-8 BOM; separator auto-detected from the header (';' or ','). */
export const parseCsv = (text: string): string[][] => {
  const src = text.replace(/^﻿/, "");
  const head = src.slice(0, src.search(/\r?\n|$/));
  const sep = head.split(";").length >= head.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
};

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** BOM + ';' so Excel (ru locale) opens it with the right encoding and columns. */
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";

export const downloadCsv = (fileName: string, rows: (string | number | null | undefined)[][]) => {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  URL.revokeObjectURL(url);
};

const VIS: Record<string, PackVisibility> = {
  розница: "retail", опт: "wholesale", оба: "both", retail: "retail", wholesale: "wholesale", both: "both",
};
const VIS_LABEL: Record<PackVisibility, string> = { retail: "Розница", wholesale: "Опт", both: "Оба" };
const yes = (s: string) => ["да", "1", "yes", "true", "+"].includes(s.trim().toLowerCase());
const num = (s: string) => (s.trim() === "" ? null : Number(s.trim().replace(/\s/g, "").replace(",", ".")));
const fmt = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const flag = (b: boolean) => (b ? "да" : "нет");

export const TEMPLATE_EXAMPLE: string[][] = [
  ["A-2001", "4870000002001", "Мука пшеничная в/с", "Мука и крупы", "Цесна", "2 кг", "шт", "2", "540", "", "Розница", "1", "1", "нет", "нет", "", "нет", "100"],
  ["A-2001", "4870000002001", "Мука пшеничная в/с", "Мука и крупы", "Цесна", "50 кг", "шт", "50", "", "11500", "Опт", "1", "1", "нет", "нет", "", "нет", ""],
];

export const exportRows = (products: Product[], cats: Category[], stockQty: Map<string, number>) => {
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return products.flatMap((p) =>
    p.packs.map((k, i) => [
      p.sku, p.barcode, p.name, catName.get(p.categoryId) ?? "", p.brand ?? "", k.label, k.unit, fmt(k.baseQty),
      fmt(k.retailPrice), fmt(k.wholesalePrice), VIS_LABEL[k.visibility], fmt(k.step), fmt(k.minQty),
      flag(p.isWeighed), flag(p.isPerishable), p.shelfLife ?? "", flag(p.preorderAllowed),
      i === 0 ? fmt(stockQty.get(p.id)) : "",
    ]),
  );
};

export type ImportError = { row: number; field: string; message: string };
export type Draft = {
  sku: string;
  existingId: string | null;
  product: Omit<Product, "id" | "packs" | "imageUrl" | "description" | "hidden">;
  packs: Omit<Pack, "id">[];
  stock: number | null;
};

/** Validates parsed rows (first row = header) against the catalog. Row numbers are 1-based like in Excel. */
export const validate = (rows: string[][], ctx: { categories: Category[]; products: Product[] }) => {
  const errors: ImportError[] = [];
  const [header = [], ...data] = rows;
  const idx = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = COLUMNS.filter((c) => !idx.has(c));
  if (missing.length) {
    errors.push({ row: 1, field: missing.join(", "), message: "Нет колонок шаблона. Скачайте шаблон и перенесите данные." });
    return { errors, drafts: [] as Draft[], rows: data.length };
  }
  const catByName = new Map(ctx.categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const bySku = new Map(ctx.products.map((p) => [p.sku, p]));
  const barcodeOwner = new Map<string, string>(ctx.products.filter((p) => p.barcode).map((p) => [p.barcode, p.sku]));
  const fileBarcode = new Map<string, string>();
  const drafts = new Map<string, Draft>();

  data.forEach((r, i) => {
    const row = i + 2;
    const get = (c: Col) => (r[idx.get(c)!] ?? "").trim();
    const err = (field: Col, message: string) => errors.push({ row, field, message });
    const number = (c: Col, opts: { required?: boolean; positive?: boolean; int?: boolean } = {}) => {
      const v = num(get(c));
      if (v == null) return opts.required ? (err(c, "Обязательное поле"), null) : null;
      if (!Number.isFinite(v)) return err(c, `Не число: «${get(c)}»`), null;
      if (opts.positive ? v <= 0 : v < 0) return err(c, opts.positive ? "Должно быть больше 0" : "Не может быть отрицательным"), null;
      if (opts.int && !Number.isInteger(v)) return err(c, "Должно быть целым"), null;
      return v;
    };

    for (const c of ["Артикул", "Название", "Категория", "Фасовка", "Ед.", "Видимость"] as const)
      if (!get(c)) err(c, "Обязательное поле");
    const sku = get("Артикул");
    const barcode = get("Штрихкод");
    if (barcode && !/^\d{8,14}$/.test(barcode)) err("Штрихкод", "Ожидается 8–14 цифр");
    if (barcode) {
      const inFile = fileBarcode.get(barcode);
      const inDb = barcodeOwner.get(barcode);
      if (inFile && inFile !== sku) err("Штрихкод", `Дубликат ${barcode} в файле (артикул ${inFile})`);
      else if (inDb && inDb !== sku) err("Штрихкод", `Дубликат ${barcode}: уже у товара ${inDb}`);
      else fileBarcode.set(barcode, sku);
    }
    const catRaw = get("Категория");
    // Accept a path "Продукты / Бакалея / Мука и крупы" — the last segment is the category.
    const categoryId = catByName.get(catRaw.split(/[/>]/).pop()!.trim().toLowerCase());
    if (catRaw && !categoryId) err("Категория", `Не найдена «${catRaw}»`);
    const unit = get("Ед.") as Pack["unit"];
    if (unit && !["шт", "кг", "л"].includes(unit)) err("Ед.", "Допустимо: шт, кг, л");
    const visibility = VIS[get("Видимость").toLowerCase()];
    if (get("Видимость") && !visibility) err("Видимость", "Допустимо: Розница, Опт, Оба");
    const baseQty = number("Кол-во в базовой ед.", { required: true, positive: true });
    const retailPrice = number("Розничная цена", { int: true, required: !!visibility && visibility !== "wholesale" });
    const wholesalePrice = number("Оптовая цена", { int: true, required: !!visibility && visibility !== "retail" });
    const step = number("Шаг", { required: true, positive: true });
    const minQty = number("Минимум", { required: true, positive: true });
    if (step != null && minQty != null && minQty < step) err("Минимум", "Не может быть меньше шага");
    const stock = number("Остаток");
    if (!sku) return;

    let d = drafts.get(sku);
    if (!d) {
      const isWeighed = yes(get("Весовой"));
      const isPerishable = yes(get("Скоропорт"));
      if (isPerishable && !get("Срок годности")) err("Срок годности", "Укажите для скоропорта");
      d = {
        sku,
        existingId: bySku.get(sku)?.id ?? null,
        product: {
          sku, barcode, name: get("Название"), brand: get("Бренд") || null, categoryId: categoryId ?? "",
          isWeighed, weightStep: isWeighed ? step : null, isPerishable,
          shelfLife: isPerishable ? get("Срок годности") || null : null, preorderAllowed: yes(get("Предзаказ")),
        },
        packs: [],
        stock,
      };
      drafts.set(sku, d);
    } else if (stock != null && d.stock == null) d.stock = stock;
    if (d.packs.some((p) => p.label === get("Фасовка"))) err("Фасовка", `Повтор фасовки «${get("Фасовка")}» у ${sku}`);
    d.packs.push({
      label: get("Фасовка"), unit, baseQty: baseQty ?? 0, visibility: visibility ?? "both",
      retailPrice: visibility === "wholesale" ? null : retailPrice,
      wholesalePrice: visibility === "retail" ? null : wholesalePrice,
      step: step ?? 1, minQty: minQty ?? 1,
    });
  });

  return { errors, drafts: [...drafts.values()], rows: data.length };
};
