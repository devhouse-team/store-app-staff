// Full-screen camera barcode scanner (continuous). Native BarcodeDetector when it reads EAN-13 (Chrome Android),
// otherwise zxing-wasm (./barcodeWasm) loaded on demand (iPhone Safari) — dynamic import only, so it stays out of the main bundle.
import { BulbFilled, BulbOutlined, CloseOutlined } from "@ant-design/icons";
import { Button, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats: () => Promise<string[]> };
const NativeDetector = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

let zx: Promise<typeof import("./barcodeWasm")> | null = null;
const loadZxing = () =>
  (zx ??= import("./barcodeWasm").catch((e) => {
    zx = null; // allow a retry on the next open
    throw e;
  }));

const SAME_CODE_MS = 1500; // the same code within this sliding window is one scan

type Props = {
  /** Called once per scan; resolves to the product name to flash, or null. */
  onDetected: (code: string) => Promise<string | null>;
  onClose: () => void;
  /** Created by the caller in the tap that opened the scanner (iOS blocks audio started without a gesture). */
  audio?: AudioContext | null;
};

export const BarcodeScanner = ({ onDetected, onClose, audio }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const cb = useRef({ onDetected, onClose, audio });
  const [error, setError] = useState<string | null>(null);
  const [hit, setHit] = useState<string | null>(null);
  const [torch, setTorch] = useState<boolean | null>(null); // null = not supported

  useEffect(() => {
    cb.current = { onDetected, onClose, audio };
  });

  useEffect(() => {
    const video = videoRef.current!;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hitTimer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Map<string, number>(); // code → last sighting; several codes may be in the frame

    const beep = () => {
      const audio = cb.current.audio;
      if (!audio) return;
      try {
        const o = audio.createOscillator();
        const g = audio.createGain();
        g.gain.value = 0.1;
        o.frequency.value = 880;
        o.connect(g).connect(audio.destination);
        o.start();
        o.stop(audio.currentTime + 0.08);
      } catch {
        /* no audio — vibration and the name flash remain */
      }
    };

    // Not awaited by the frame loop: frames keep being read during a slow lookup, so every code in view keeps
    // refreshing its sighting time (the receipt queue keeps the adds in order).
    const handle = (code: string) => {
      const now = Date.now();
      const prev = seen.get(code);
      seen.set(code, now); // sliding window: every sighting extends it
      if (prev != null && now - prev < SAME_CODE_MS) return;
      navigator.vibrate?.(50);
      beep();
      cb.current.onDetected(code).then((name) => {
        if (cancelled || !name) return;
        setHit(name);
        clearTimeout(hitTimer);
        hitTimer = setTimeout(() => setHit(null), 1000);
      });
    };

    const onVisibility = () => document.visibilityState === "hidden" && cb.current.onClose();
    document.addEventListener("visibilitychange", onVisibility);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError("Камера доступна только по HTTPS. Введите штрихкод в поле поиска.");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (cancelled) return;
        return setError(
          (e as Error).name === "NotAllowedError"
            ? "Нет доступа к камере. Разрешите доступ в настройках браузера или введите штрихкод в поле поиска."
            : "Камера не найдена. Введите штрихкод в поле поиска.",
        );
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      if ((track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) setTorch(false);

      let decode: () => Promise<string | null>;
      const formats: string[] = (await NativeDetector?.getSupportedFormats().catch(() => [])) ?? [];
      if (NativeDetector && formats.includes("ean_13")) {
        const d = new NativeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"].filter((f) => formats.includes(f)) });
        decode = async () => (await d.detect(video))[0]?.rawValue ?? null;
      } else {
        let read: (img: ImageData) => Promise<string | null>;
        try {
          read = (await loadZxing()).read;
        } catch {
          stream.getTracks().forEach((t) => t.stop()); // no decoder → release the camera
          video.srcObject = null;
          if (!cancelled) setError("Не удалось запустить распознавание. Введите штрихкод в поле поиска.");
          return;
        }
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        decode = () => {
          // the frame guide region (≈80% × 40% of the frame) — smaller image, faster decode
          const w = Math.round(video.videoWidth * 0.8), h = Math.round(video.videoHeight * 0.4);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, (video.videoWidth - w) / 2, (video.videoHeight - h) / 2, w, h, 0, 0, w, h);
          return read(ctx.getImageData(0, 0, w, h));
        };
      }
      // Sequential ticks: the next frame is read only after the previous one was decoded.
      const tick = async () => {
        if (cancelled) return;
        try {
          if (video.readyState >= 2 && video.videoWidth) {
            const code = await decode();
            if (code && !cancelled) handle(code);
          }
        } catch {
          /* a frame that can't be read */
        }
        if (!cancelled) timer = setTimeout(tick, 120);
      };
      tick();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(hitTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      trackRef.current = null;
    };
  }, []);

  const toggleTorch = () => {
    const next = !torch;
    trackRef.current
      ?.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorch(next))
      .catch(() => setTorch(null));
  };

  const iconBtn = { color: "#fff", background: "rgba(0,0,0,.45)" };
  return (
    <div role="dialog" aria-label="Сканер штрихкодов" style={{ position: "fixed", inset: 0, zIndex: 1100, background: "#000" }}>
      <video ref={videoRef} playsInline muted autoPlay style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {!error && (
        <div
          aria-hidden
          style={{
            position: "absolute", left: "10%", top: "30%", width: "80%", height: "40%", borderRadius: 12,
            border: "2px solid rgba(255,255,255,.9)", boxShadow: "0 0 0 100vmax rgba(0,0,0,.45)",
          }}
        />
      )}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", padding: "max(12px, env(safe-area-inset-top)) 12px 12px" }}>
        <Button shape="circle" size="large" type="text" icon={<CloseOutlined />} aria-label="Закрыть" onClick={onClose} style={iconBtn} />
        {torch !== null && (
          <Button
            shape="circle"
            size="large"
            type="text"
            icon={torch ? <BulbFilled /> : <BulbOutlined />}
            aria-label={torch ? "Выключить фонарик" : "Включить фонарик"}
            aria-pressed={torch}
            onClick={toggleTorch}
            style={iconBtn}
          />
        )}
      </div>
      {error ? (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <Typography.Text style={{ color: "#fff", fontSize: 16 }}>{error}</Typography.Text>
          <Button size="large" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      ) : (
        <div aria-live="polite" style={{ position: "absolute", left: 16, right: 16, bottom: "max(24px, env(safe-area-inset-bottom))", textAlign: "center" }}>
          {hit && (
            <div style={{ display: "inline-block", marginBottom: 12, padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,.95)", fontWeight: 600 }}>
              ✓ {hit}
            </div>
          )}
          <Typography.Text style={{ display: "block", color: "rgba(255,255,255,.85)" }}>Наведите камеру на штрихкод</Typography.Text>
        </div>
      )}
    </div>
  );
};
