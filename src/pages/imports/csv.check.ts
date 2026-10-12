// Self-check for the CSV parser/validator: `node --experimental-strip-types src/pages/imports/csv.check.ts`
import assert from "node:assert/strict";
import { COLUMNS, TEMPLATE_EXAMPLE, exportRows, parseCsv, toCsv, validate } from "./csv.ts";

const cats = [{ id: "c-flour", name: "Мука и крупы", parentId: null }];
const ok = validate(parseCsv(toCsv([[...COLUMNS], ...TEMPLATE_EXAMPLE])), { categories: cats, products: [] });
assert.deepEqual(ok.errors, []);
assert.equal(ok.drafts.length, 1);
assert.equal(ok.drafts[0].packs.length, 2);
assert.equal(ok.drafts[0].packs[1].retailPrice, null);
assert.equal(ok.drafts[0].stock, 100);

// ',' separator, quoted cell with separator and escaped quote, round-trip through export.
assert.deepEqual(parseCsv('a,b\n"x, ""y""",2\n'), [["a", "b"], ['x, "y"', "2"]]);
const exported = exportRows([{ ...ok.drafts[0].product, id: "p1", imageUrl: null, description: null, hidden: false,
  packs: ok.drafts[0].packs.map((p, i) => ({ ...p, id: `p1-${i}` })) }], cats, new Map([["p1", 100]]));
assert.deepEqual(exported, TEMPLATE_EXAMPLE);

const bad = TEMPLATE_EXAMPLE.map((r) => [...r]);
bad[0][3] = "Сладости"; // unknown category
bad[1][1] = "4870000009999"; // same sku, different barcode → fine; other sku with existing barcode below
bad[1][0] = "A-2002"; bad[1][1] = "4870000002001"; // duplicate barcode within file
bad[1][9] = "abc"; // not a number
const res = validate([[...COLUMNS], ...bad], { categories: cats, products: [] });
assert.deepEqual(res.errors.map((e) => [e.row, e.field]), [[2, "Категория"], [3, "Штрихкод"], [3, "Оптовая цена"]]);
console.log("csv.check ok");
