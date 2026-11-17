// Burst detector check: `npx tsx src/components/useKeyboardScanner.check.ts`
import assert from "node:assert/strict";
import { SCAN_IDLE, scanStep, validCode } from "./useKeyboardScanner.ts";

/** Feeds keys at the given gap; returns scanned codes, misreads, and the key indexes where a run started (snapshots). */
const feed = (keys: string[], gap: (i: number) => number) => {
  let s = SCAN_IDLE, t = 1000, misreads = 0;
  const codes: string[] = [], starts: number[] = [];
  keys.forEach((k, i) => {
    t += gap(i);
    const r = scanStep(s, k, t);
    s = r.state;
    if (r.start) starts.push(i);
    if (r.code) codes.push(r.code);
    if (r.misread) misreads++;
  });
  return { codes, misreads, starts };
};
const EAN = "4870001112226"; // valid EAN-13 (check digit 6)
const ean = [...EAN];

// check digit helper
assert.equal(validCode(EAN), true);
assert.equal(validCode("4870001112223"), false);
assert.equal(validCode("96385074"), true); // EAN-8
assert.equal(validCode("036000291452"), true); // UPC-A
assert.equal(validCode("A1B2C3D"), true); // Code128: as is

// scanner: 13 keys 10 ms apart + Enter → one scan, one snapshot (taken at the first key only)
assert.deepEqual(feed([...ean, "Enter"], () => 10), { codes: [EAN], misreads: 0, starts: [0] });
// wrong check digit → misread, no code
assert.deepEqual(feed([..."4870001112223", "Enter"], () => 10), { codes: [], misreads: 1, starts: [0] });
// EAN-8, UPC-A, Code128-like accepted
assert.deepEqual(feed([..."96385074", "Enter"], () => 10).codes, ["96385074"]);
assert.deepEqual(feed([..."036000291452", "Enter"], () => 10).codes, ["036000291452"]);
assert.deepEqual(feed([..."A1B2C3D", "Enter"], () => 10).codes, ["A1B2C3D"]);
// human: 120 ms gaps → no scan, no misread (Enter goes to the field as usual)
assert.deepEqual(feed([...ean, "Enter"], () => 120), { codes: [], misreads: 0, starts: [0] });
// fast human burst without Enter, then a pause → no scan; keys are never prevented (only a scan's Enter is)
assert.deepEqual(feed([..."1725"], () => 15).codes, []);
assert.deepEqual(feed([..."1725", "Enter"], () => 120), { codes: [], misreads: 0, starts: [0] });
assert.deepEqual(feed([..."1725", "Enter"], (i) => (i === 4 ? 500 : 15)), { codes: [], misreads: 0, starts: [0] });
// too short for a code
assert.deepEqual(feed([..."12345", "Enter"], () => 10).codes, []);
// a non-printable key mid-burst (Android "Unidentified") breaks it; the next key starts a new run
assert.deepEqual(feed([..."487000", "Unidentified", ..."1112223", "Enter"], () => 10).codes, ["1112223"]);
// slow scanner: 60 ms pause before key 8 → one snapshot for the whole run (before key 0), 5-char tail → misread
assert.deepEqual(feed([...ean, "Enter"], (i) => (i === 8 ? 60 : 10)), { codes: [], misreads: 1, starts: [0] });
// slow scanner: full valid EAN, 50 ms pause before Enter → misread (Enter must not reach the price field)
assert.deepEqual(feed([...ean, "Enter"], (i) => (i === 13 ? 50 : 10)), { codes: [], misreads: 1, starts: [0] });
// slow scanner: 60 ms pause before key 6 leaves a 7-digit tail → misread, no code
assert.deepEqual(feed([...ean, "Enter"], (i) => (i === 6 ? 60 : 10)), { codes: [], misreads: 1, starts: [0] });
// a ≥ 300 ms pause starts a new run (new snapshot)
assert.deepEqual(feed([..."12", ...ean, "Enter"], (i) => (i === 2 ? 400 : 10)), { codes: [EAN], misreads: 0, starts: [0, 2] });

console.log("useKeyboardScanner.check: ok");
