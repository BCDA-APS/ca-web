import { useEffect, useRef, useState } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";
import { ChanRbvBox, ChanSpBox } from "./EpicsWidgets";
import { pvwsWriter } from "../lib/pvwsWriter";

export interface CameraViewerProps {
  /** Title shown above the image, e.g. "Cam 29ID". */
  title: string;
  /** Live MJPEG stream URL (preferred). If absent, falls back to 2D waveform render. */
  mjpegUrl?: string;
  /** AreaDetector PV prefix (e.g. "29idc_cam1:cam1:"). Used for Acquire/Exposure/Gain controls. */
  adPrefix?: string;
  /** PV for 2D image waveform (when mjpegUrl is absent). */
  imagePv?: string;
  /** Image width / height for the canvas fallback. */
  imageW?: number;
  imageH?: number;
  /** Display size (px). */
  width?: number;
  height?: number;
  /** Optional crosshair toggle (default true). */
  crosshair?: boolean;
}

// ── WaveformCanvas (fallback) ─────────────────────────────────────────────────

function WaveformCanvas({ imagePv, imageW, imageH, displayW, displayH }: {
  imagePv: string;
  imageW: number;
  imageH: number;
  displayW: number;
  displayH: number;
}) {
  const [, , , raw] = useConnection(`cam-${imagePv}`, `ca://${imagePv}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const val = (raw as { value?: { arrayValue?: unknown } })?.value?.arrayValue;
    if (!val) {
      ctx.fillStyle = "#0f2035";
      ctx.fillRect(0, 0, imageW, imageH);
      ctx.fillStyle = "#5c7a99";
      ctx.font = "11px sans-serif";
      ctx.fillText("Waiting for image…", 8, 18);
      return;
    }
    // Extract array (object form or typed array)
    const n = imageW * imageH;
    const arr: number[] = new Array(n);
    const asAny = val as { length?: number; [k: number]: number };
    if (typeof asAny.length === "number") {
      for (let i = 0; i < n; i++) arr[i] = asAny[i] ?? 0;
    } else {
      const obj = val as Record<string, number>;
      const keys = Object.keys(obj).map(Number).sort((a, b) => a - b);
      for (let i = 0; i < n; i++) arr[i] = obj[keys[i]] ?? 0;
    }
    // Find max for gray-scaling
    let max = 1;
    for (const v of arr) if (v > max) max = v;
    const img = ctx.createImageData(imageW, imageH);
    for (let i = 0; i < n; i++) {
      const g = Math.min(255, Math.round((arr[i] / max) * 255));
      img.data[i * 4 + 0] = g;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [raw, imageW, imageH]);

  return (
    <canvas
      ref={canvasRef}
      width={imageW}
      height={imageH}
      onContextMenu={e => pvCtx(imagePv, raw, e)}
      style={{
        width: displayW, height: displayH, background: "#0f2035",
        borderRadius: 3, imageRendering: "pixelated", cursor: "context-menu",
      }}
    />
  );
}

// ── MjpegImg ──────────────────────────────────────────────────────────────────

function MjpegImg({ url, width, height }: { url: string; width: number; height: number }) {
  return (
    <img
      src={url}
      alt="Live camera stream"
      width={width}
      height={height}
      style={{ background: "#0f2035", borderRadius: 3, display: "block", objectFit: "contain" }}
    />
  );
}

// ── Crosshair overlay ─────────────────────────────────────────────────────────

function Crosshair({ width, height }: { width: number; height: number }) {
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke="rgba(255,224,0,0.6)" strokeWidth={1} />
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,224,0,0.6)" strokeWidth={1} />
    </svg>
  );
}

// ── AD controls ───────────────────────────────────────────────────────────────

function AcquireBtn({ pv }: { pv: string }) {
  const [, , , raw] = useConnection(`cam-acq-${pv}`, `ca://${pv}`);
  const acquiring = toDouble(raw) === 1;
  return (
    <button
      onClick={() => pvwsWriter.write(pv, acquiring ? 0 : 1)}
      onContextMenu={e => pvCtx(pv, raw, e)}
      style={{
        padding: "4px 12px", borderRadius: 3, border: "none", cursor: "pointer",
        fontSize: fontSize.label, fontFamily: "sans-serif", fontWeight: 700, color: "#fff",
        background: acquiring ? colors.statusError : colors.statusOk,
      }}
    >{acquiring ? "Stop" : "Acquire"}</button>
  );
}

function SpRow({ label, pv, prec = 3, unit }: { label: string; pv: string; prec?: number; unit?: string }) {
  const [, conn, , raw] = useConnection(`cam-sp-${pv}`, `ca://${pv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 70, fontSize: fontSize.label, color: colors.label }}>{label}</span>
      <ChanSpBox raw={raw} width={70} fallbackPrec={prec}
        disabled={!conn}
        onCommit={n => pvwsWriter.write(pv, n)}
        onContextMenu={e => pvCtx(pv, raw, e)} />
      {unit && <span style={{ fontSize: fontSize.label, color: colors.unit }}>{unit}</span>}
    </div>
  );
}

function RbvRow({ label, pv, prec = 0 }: { label: string; pv: string; prec?: number }) {
  const [, , , raw] = useConnection(`cam-rbv-${pv}`, `ca://${pv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 70, fontSize: fontSize.label, color: colors.label }}>{label}</span>
      <ChanRbvBox raw={raw} width={70} fallbackPrec={prec}
        onContextMenu={e => pvCtx(pv, raw, e)} />
    </div>
  );
}

// ── CameraViewer ──────────────────────────────────────────────────────────────

export function CameraViewer({
  title,
  mjpegUrl,
  adPrefix,
  imagePv,
  imageW = 640,
  imageH = 480,
  width  = 480,
  height = 360,
  crosshair = true,
}: CameraViewerProps) {
  const [showXhair, setShowXhair] = useState(crosshair);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{
          margin: 0, fontSize: fontSize.badge, color: colors.sectionHdr,
          borderBottom: `1px solid ${colors.sectionHdrBorder}`, padding: "0 4px 3px", flex: 1,
        }}>{title}</h3>
        <label style={{ fontSize: fontSize.small, color: colors.dim, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showXhair} onChange={e => setShowXhair(e.target.checked)} />
          Crosshair
        </label>
      </div>

      <div style={{ position: "relative", width, height }}>
        {mjpegUrl ? (
          <MjpegImg url={mjpegUrl} width={width} height={height} />
        ) : imagePv ? (
          <WaveformCanvas
            imagePv={imagePv}
            imageW={imageW}
            imageH={imageH}
            displayW={width}
            displayH={height}
          />
        ) : (
          <div style={{
            width, height, background: "#0f2035", color: "#5c7a99",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: fontSize.label, borderRadius: 3,
          }}>No image source</div>
        )}
        {showXhair && <Crosshair width={width} height={height} />}
      </div>

      {adPrefix && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AcquireBtn pv={`${adPrefix}Acquire`} />
            <RbvRow label="Counter" pv={`${adPrefix}NumImagesCounter_RBV`} />
          </div>
          <SpRow label="Exposure"  pv={`${adPrefix}AcquireTime`}   prec={3} unit="s" />
          <SpRow label="Gain"      pv={`${adPrefix}Gain`}          prec={2} />
          <SpRow label="N images"  pv={`${adPrefix}NumImages`}     prec={0} />
        </div>
      )}
    </div>
  );
}
