// zxing-wasm decoder (iPhone Safari has no BarcodeDetector). Loaded only through import() from BarcodeScanner,
// so the library and its wasm stay out of the main bundle; the wasm is self-hosted (library default is a CDN).
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

prepareZXingModule({ overrides: { locateFile: (p: string, prefix: string) => (p.endsWith(".wasm") ? wasmUrl : prefix + p) } });

export const read = async (img: ImageData) =>
  (await readBarcodes(img, { formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128"], tryHarder: true, maxNumberOfSymbols: 1 }))[0]?.text || null;
