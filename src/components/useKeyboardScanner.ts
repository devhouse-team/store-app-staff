import { App } from "antd";
import { useEffect, useRef } from "react";

// ponytail: fixed thresholds tuned for USB/Bluetooth scanners (they type a code in a few ms per key);
// make them settings if some scanner or a very fast typist trips them.
const SCAN_GAP_MS = 35;
const RUN_GAP_MS = 300; // a pause this long starts a new typing run (new field snapshot)
const SCAN_MIN_LEN = 6;

/** EAN-8 / UPC-A / EAN-13 must pass the GS1 mod-10 check digit; any other code (Code128 etc.) passes as is. */
export const validCode = (code: string) => {
  if (!/^(\d{8}|\d{12}|\d{13})$/.test(code)) return true;
  const d = [...code].map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
};

/**
 * `run`: a typing run is in progress (its field snapshot is taken). `broken`: its burst restarted mid-run.
 * `long`: the run already had a burst of ≥ 6 printable keys (a scan attempt).
 */
export type ScanState = { buf: string; lastAt: number; run: boolean; broken: boolean; long: boolean };
export const SCAN_IDLE: ScanState = { buf: "", lastAt: -Infinity, run: false, broken: false, long: false };

/**
 * One key of the burst detector (pure, see useKeyboardScanner.check.ts). `key` is a printable char, "Enter",
 * or anything else (resets). `t` is the event's own timestamp, so slow re-renders between handlers don't
 * stretch the gaps. `start`: first key of a typing run (after a ≥ 300 ms pause or a reset) → snapshot the
 * field now; a shorter mid-code pause restarts the burst but keeps the snapshot. `code`: a complete scan.
 * `misread`: a scan attempt that isn't a valid scan: bad EAN/UPC check digit, or a restarted/slow run (truncated
 * code, pause before Enter). Enter ≥ 300 ms after the last key is a new run → passes through as usual.
 */
export const scanStep = (s: ScanState, key: string, t: number) => {
  const gap = t - s.lastAt;
  const idle = { ...SCAN_IDLE, lastAt: t };
  if (key === "Enter") {
    const scan = s.buf.length >= SCAN_MIN_LEN && gap < SCAN_GAP_MS;
    const ok = scan && !s.broken && validCode(s.buf);
    const attempt = scan || (s.long && gap < RUN_GAP_MS);
    return { state: idle, start: false, code: ok ? s.buf : null, misread: attempt && !ok };
  }
  if (key.length !== 1) return { state: idle, start: false, code: null, misread: false };
  const start = !s.run || gap >= RUN_GAP_MS;
  const cont = s.buf !== "" && gap < SCAN_GAP_MS;
  // ponytail: a human typing then scanning < 300 ms later makes one run → that scan is a misread; re-scan works.
  const broken = !start && (s.broken || (s.buf !== "" && !cont)); // 35–300 ms pause inside the run
  const buf = cont ? s.buf + key : key;
  const long = (!start && s.long) || buf.length >= SCAN_MIN_LEN;
  return { state: { buf, lastAt: t, run: true, broken, long }, start, code: null, misread: false };
};

const overlayOpen = () =>
  !!document.querySelector(".ant-drawer-open") ||
  [...document.querySelectorAll(".ant-modal-wrap")].some((el) => getComputedStyle(el).display !== "none");

/**
 * Hardware (keyboard-wedge) scanner anywhere on the page: a burst of ≥ 6 printable keys < 35 ms apart, ending
 * with Enter, is a scan. Keys always reach the focused field (fast human typing must never lose characters);
 * on a scan only the Enter is stopped, the field gets back the value it had before the typing run, and onScan
 * gets the code. A misread (bad EAN/UPC check digit, or a restarted/slow run) is handled the same, but warns
 * instead of calling onScan.
 * Ignored while a modal or drawer is open.
 */
export const useKeyboardScanner = (onScan: (code: string) => void, enabled: boolean) => {
  const { message } = App.useApp();
  const cb = useRef(onScan);
  const msg = useRef(message);
  useEffect(() => {
    cb.current = onScan;
    msg.current = message;
  });
  useEffect(() => {
    if (!enabled) return;
    let s = SCAN_IDLE;
    let field: { el: HTMLInputElement | HTMLTextAreaElement; value: string } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" || overlayOpen()) return; // scanners send Shift for capitals
      // "Unidentified" (Android soft keyboards), shortcuts, held keys: not a scanner → reset
      const key = e.ctrlKey || e.metaKey || e.altKey || e.repeat ? "" : e.key;
      const step = scanStep(s, key, e.timeStamp);
      s = step.state;
      if (step.start) {
        const a = document.activeElement; // value before this key lands
        field = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement ? { el: a, value: a.value } : null;
      }
      if (!step.code && !step.misread) return;
      e.preventDefault();
      e.stopPropagation(); // the search field's / price field's own Enter handlers must not see it
      if (field) {
        // native setter + input event, so React/antd controlled inputs take the old value back
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field.el), "value")?.set?.call(field.el, field.value);
        field.el.dispatchEvent(new Event("input", { bubbles: true }));
        field = null;
      }
      if (step.code) cb.current(step.code);
      else msg.current.warning("Штрихкод не распознан, отсканируйте ещё раз");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled]);
};
