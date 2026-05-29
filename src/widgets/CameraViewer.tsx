import { useEffect, useRef, useState, useContext } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";
import { ChanSpBox } from "./EpicsWidgets";
import { pvwsWriter } from "../lib/pvwsWriter";
import { PanelSizeContext } from "../lib/deployment";
import type { CameraEntry } from "../lib/camera";

export interface CameraViewerProps {
  /** Title shown above the image, e.g. "Cam 29ID". Ignored when prefix mode
   * is active (the editable PV input takes the title slot). */
  title?: string;
  /** Live MJPEG stream URL (preferred). If absent, falls back to 2D waveform render. */
  mjpegUrl?: string;
  /** AreaDetector PV prefix (e.g. "29idc_cam1:cam1:"). Used for Acquire/Exposure/Gain controls. */
  adPrefix?: string;
  /** PV for 2D image waveform (when mjpegUrl is absent). */
  imagePv?: string;
  /** Image width / height for the canvas fallback. Used as fallback when
   * the *Pv variants aren't connected. */
  imageW?: number;
  imageH?: number;
  /** Optional PVs that publish current image dimensions (e.g.
   * "myad:image1:ArraySize0_RBV"). When connected, override imageW/imageH
   * so the canvas adapts to detector resizing / ROI / binning. */
  imageWPv?: string;
  imageHPv?: string;
  /** Optional third dimension PV (e.g. "myad:image1:ArraySize2_RBV"). When
   * `imageWPv`'s value is exactly 3, the data is treated as RGB1 (interleaved
   * 3-channel) with width = imageHPv and height = imageSize2Pv. This is the
   * actual AreaDetector layout for RGB1, regardless of what ColorMode_RBV
   * reports. */
  imageSize2Pv?: string;
  /** Optional AreaDetector ColorMode_RBV PV (e.g. "myad:cam1:ColorMode_RBV").
   * Supported values: 0 = Mono (grayscale), 3 = RGB1 (interleaved). All
   * other modes (Bayer, RGB2/3, YUV) currently fall back to mono. Note that
   * the ArraySize0==3 heuristic wins over this PV when both are present. */
  colorModePv?: string;

  // ── Prefix mode ─────────────────────────────────────────────────────────
  // When `initialPrefix` or `knownCameras` is supplied, a text input (with
  // optional dropdown suggestions) appears at the top. Derived PVs follow
  // standard AreaDetector convention from the active prefix `PFX:`:
  //   adPrefix    = `${PFX}cam1:`
  //   imagePv     = `${PFX}image1:ArrayData`
  //   imageWPv    = `${PFX}image1:ArraySize0_RBV`
  //   imageHPv    = `${PFX}image1:ArraySize1_RBV`
  //   colorModePv = `${PFX}cam1:ColorMode_RBV`
  // Explicit props above still win when given (overrides).
  initialPrefix?: string;
  knownCameras?: CameraEntry[];
  /** Called when the user picks or types a new camera prefix (committed,
   * not per-keystroke). Lets the parent lift the selection up — e.g. so
   * tab switches and saved layouts can restore the right camera. */
  onPrefixChange?: (prefix: string) => void;

  /** Display size (px). */
  width?: number;
  height?: number;
  /** Optional crosshair toggle (default true). */
  crosshair?: boolean;
}

// ── WaveformCanvas (fallback) ─────────────────────────────────────────────────

function WaveformCanvas({ imagePv, acquirePv, imageW, imageH, displayW, displayH, colorMode = 0, manualMin, manualMax, onAutoRange }: {
  imagePv: string;
  /** Optional AreaDetector Acquire_RBV PV. Used to gate the "no new frames
   * for > 5 s" disconnect check — a detector that isn't acquiring isn't
   * supposed to push frames, so staleness there is normal, not a failure. */
  acquirePv?: string;
  imageW: number;
  imageH: number;
  displayW: number;
  displayH: number;
  /** AreaDetector ColorMode. 0 = Mono, 3 = RGB1 (interleaved). Other
   * modes (Bayer / RGB2/3 / YUV) currently fall back to mono. */
  colorMode?: number;
  /** Display contrast range. When both are set the renderer maps
   * [manualMin, manualMax] to [0, 255]; otherwise it auto-scans the data. */
  manualMin?: number | null;
  manualMax?: number | null;
  /** Called with the auto-detected min/max each frame when no manual range
   * is provided. Lets the parent show the auto values as a readback. */
  onAutoRange?: (min: number, max: number) => void;
}) {
  const [, , , raw] = useConnection(`cam-${imagePv}`, `ca://${imagePv}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Cache one ImageData buffer per (w,h) and overwrite its bytes each
  // frame instead of allocating a fresh ~4 MB Uint8ClampedArray every
  // render. The dimension guard reallocates when the image size changes
  // (e.g. ROI applied, camera swap), which is rare compared to per-frame
  // churn. Eliminates the GC pressure that profiling traced to this
  // canvas path.
  const imgCacheRef = useRef<{ img: ImageData; w: number; h: number } | null>(null);
  // acquirePv was used by an earlier IOC-liveness heuristic that turned out
  // to be unreliable. The prop is still accepted (callers pass it; future
  // logic may want it) but we no longer subscribe to it here.
  void acquirePv;

  // Honest blank — pvws-side connection signals turned out to be unreliable
  // enough that any text-based status here was misleading more often than
  // useful. The Acquire/Stop button colour and Done/Acquiring readback
  // already convey connection state truthfully where they can.
  function drawBlank(ctx: CanvasRenderingContext2D) {
    const cv = ctx.canvas;
    const w = Math.max(imageW || 0, 240);
    const h = Math.max(imageH || 0, 180);
    cv.width = w;
    cv.height = h;
    ctx.fillStyle = "#0f2035";
    ctx.fillRect(0, 0, w, h);
  }

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    // No usable image: just go blank. Other UI elements (Acquire button,
    // Done/Acquiring readback) carry the connection signal more honestly.
    const dimsValid = imageW >= 16 && imageH >= 16 && imageW <= 65536 && imageH <= 65536;
    if (!dimsValid) { drawBlank(ctx); return; }
    const val = (raw as { value?: { arrayValue?: unknown } })?.value?.arrayValue;
    if (!val) { drawBlank(ctx); return; }
    // pvws sends arrays as either typed arrays/regular arrays (length-indexed)
    // or as {"0": v, "1": v, ...} objects. Normalise to indexed access.
    const asAny = val as { length?: number; [k: number]: number };
    let rawGet: (i: number) => number;
    let totalLen: number;
    if (typeof asAny.length === "number") {
      totalLen = asAny.length;
      rawGet = i => asAny[i] ?? 0;
    } else {
      const obj = val as Record<string, number>;
      const keys = Object.keys(obj).map(Number).sort((a, b) => a - b);
      totalLen = keys.length;
      rawGet = i => obj[keys[i]] ?? 0;
    }

    const n = imageW * imageH;
    // Auto-detect RGB1 when the ColorMode PV says Mono (or isn't readable)
    // but the buffer is ~3× the mono expectation. Some cameras don't expose
    // ColorMode_RBV reliably; the buffer length is a good fallback signal.
    let isRGB1 = colorMode === 3;
    if (!isRGB1 && Math.abs(totalLen - n * 3) <= n * 3 * 0.05) isRGB1 = true;
    const expectedLen = isRGB1 ? n * 3 : n;
    // Buffer must hold AT LEAST one full frame. Many AreaDetector records
    // are sized for the worst-case ROI / binning / bit depth and the current
    // frame only fills the first expectedLen elements — that's fine.
    // Only bail if the buffer is too small (size PVs lost, stale buffer,
    // etc.) so we don't render torn / partial output.
    if (totalLen < expectedLen * 0.95) { drawBlank(ctx); return; }
    // Reuse the cached ImageData when dimensions match (typical case —
    // the IOC's image size only changes when ROI / binning / camera
    // change). Allocate only on size change. Every pixel index 0..n-1
    // is overwritten below, so a reused buffer carries no stale data.
    const cached = imgCacheRef.current;
    let img: ImageData;
    if (cached && cached.w === imageW && cached.h === imageH) {
      img = cached.img;
    } else {
      img = ctx.createImageData(imageW, imageH);
      imgCacheRef.current = { img, w: imageW, h: imageH };
    }
    const sliceLen = Math.min(expectedLen, totalLen);

    // Detect signed/unsigned mismatch: pvws often delivers unsigned detector
    // data (caCHAR / UInt16 / UInt32) as signed values, wrapping high pixels
    // into negatives. Pick the shift based on the most-negative value seen:
    //   [-128,   -1]  → 8-bit  (CHAR), add 256
    //   [-32768, -1]  → 16-bit (UInt16), add 65536
    //   else          → 32-bit (UInt32), add 2^32
    // Genuine signed imaging data is rare; if it ever shows up here we can
    // wire DataType_RBV through to be precise.
    let mostNeg = 0;
    for (let i = 0; i < sliceLen; i++) {
      const v = rawGet(i);
      if (v < mostNeg) mostNeg = v;
    }
    let shift = 0;
    if (mostNeg < 0) {
      if (mostNeg >= -128)        shift = 256;
      else if (mostNeg >= -32768) shift = 65536;
      else                        shift = 4294967296;
    }
    const getValue = shift > 0
      ? (i: number) => { const v = rawGet(i); return v < 0 ? v + shift : v; }
      : rawGet;

    // Determine the contrast range [dispMin, dispMax]. Manual values win
    // when both supplied; otherwise auto-scan the data.
    let dispMin: number, dispMax: number;
    if (manualMin != null && manualMax != null && manualMax > manualMin) {
      dispMin = manualMin;
      dispMax = manualMax;
    } else {
      // Percentile-based auto-contrast: 1st / 99th percentile of an evenly-
      // sampled subset of pixels. Robust to one bright or one dead pixel
      // that would otherwise crush the visible range with strict min/max.
      const SAMPLE_TARGET = 10000;
      const step = Math.max(1, Math.floor(sliceLen / SAMPLE_TARGET));
      const sampleN = Math.ceil(sliceLen / step);
      const sample = new Float64Array(sampleN);
      let k = 0;
      for (let i = 0; i < sliceLen; i += step) sample[k++] = getValue(i);
      const used = k < sample.length ? sample.subarray(0, k) : sample;
      used.sort();
      dispMin = used[Math.floor(k * 0.01)];
      dispMax = Math.max(dispMin + 1, used[Math.floor(k * 0.99)]);
      if (onAutoRange) onAutoRange(dispMin, dispMax);
    }
    const range = dispMax - dispMin;
    const clamp = (v: number) => {
      if (v <= dispMin) return 0;
      if (v >= dispMax) return 255;
      return Math.round((v - dispMin) / range * 255);
    };

    if (isRGB1) {
      for (let i = 0; i < n; i++) {
        img.data[i * 4 + 0] = clamp(getValue(i * 3 + 0));
        img.data[i * 4 + 1] = clamp(getValue(i * 3 + 1));
        img.data[i * 4 + 2] = clamp(getValue(i * 3 + 2));
        img.data[i * 4 + 3] = 255;
      }
    } else {
      for (let i = 0; i < n; i++) {
        const g = clamp(getValue(i));
        img.data[i * 4 + 0] = g;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = g;
        img.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [raw, imageW, imageH, colorMode, manualMin, manualMax]);

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

function Crosshair({ width, height, cx, cy }: { width: number; height: number; cx?: number; cy?: number }) {
  const x = cx ?? width / 2;
  const y = cy ?? height / 2;
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <line x1={x} y1={0} x2={x} y2={height} stroke="rgba(255,224,0,0.6)" strokeWidth={1} />
      <line x1={0} y1={y} x2={width} y2={y} stroke="rgba(255,224,0,0.6)" strokeWidth={1} />
    </svg>
  );
}

// ── AD controls ───────────────────────────────────────────────────────────────

function AcquireBtn({ pv }: { pv: string }) {
  const [, , , raw] = useConnection(`cam-acq-${pv}`, `ca://${pv}`);
  const val = toDouble(raw);
  const alarm = (raw as { alarm?: { quality?: string } })?.alarm?.quality;
  const hasValue = val !== null && alarm !== "invalid" && alarm !== "undefined";
  const acquiring = hasValue && val === 1;
  return (
    <button
      onClick={() => hasValue && pvwsWriter.write(pv, acquiring ? 0 : 1)}
      onContextMenu={e => pvCtx(pv, raw, e)}
      disabled={!hasValue}
      style={{
        padding: "4px 12px", borderRadius: 3, border: "none",
        cursor: hasValue ? "pointer" : "not-allowed",
        fontSize: fontSize.label, fontFamily: "sans-serif", fontWeight: 700, color: "#fff",
        background: !hasValue ? colors.dim : acquiring ? colors.statusError : colors.statusOk,
        opacity: hasValue ? 1 : 0.6,
      }}
    >{!hasValue ? "—" : acquiring ? "Stop" : "Acquire"}</button>
  );
}

// Gear button that opens the camera's underlying AD settings .ui screen.
// Picks the right ADAravis / ADVimba / ADBase file based on the prefix.
function SettingsButton({ prefix }: { prefix: string }) {
  function open() {
    let file: string;
    if (/_arv\d+:/.test(prefix)) {
      file = "/ui/29id/ADAravis.ui";
    } else if (/_vmb\d+:/.test(prefix)) {
      file = "/ui/ADVimba/ADVimba.ui";
    } else {
      file = "/ui/ADBase/ADBase.ui";
    }
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file, macros: { P: prefix, R: "cam1:" }, label: `${prefix}cam1: settings` },
    }));
  }
  return (
    <button onClick={open} title="Camera settings"
      style={{
        width: 24, height: 24, padding: 0, cursor: "pointer",
        background: colors.relatedBg, color: colors.relatedFg,
        border: `1px solid ${colors.relatedBorder}`, borderRadius: 3,
        fontSize: 14, lineHeight: 1, fontFamily: "sans-serif",
      }}>⚙</button>
  );
}

function DoneIndicator({ pv }: { pv: string }) {
  const [, , , raw] = useConnection(`cam-done-${pv}`, `ca://${pv}`);
  const val = toDouble(raw);
  const alarm = (raw as { alarm?: { quality?: string } })?.alarm?.quality;
  // Match the ChanSpBox convention: when we can't get a real value (no
  // parseable doubleValue, or the alarm went invalid/undefined), show "—"
  // instead of falsely reporting "Done" from a stale cached 0.
  const hasValue = val !== null && alarm !== "invalid" && alarm !== "undefined";
  const acquiring = hasValue && val === 1;
  return (
    <span
      onContextMenu={e => pvCtx(pv, raw, e)}
      style={{
        padding: "4px 8px",
        background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`,
        color: !hasValue ? colors.dim : acquiring ? colors.rbvText : colors.statusOk,
        fontSize: fontSize.label, fontFamily: "monospace",
        lineHeight: 1,
        cursor: "context-menu",
      }}
    >{!hasValue ? "—" : acquiring ? "Acquiring…" : "Done"}</span>
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


// ── CameraViewer ──────────────────────────────────────────────────────────────

export function CameraViewer({
  title,
  mjpegUrl,
  adPrefix: adPrefixProp,
  imagePv: imagePvProp,
  imageW = 640,
  imageH = 480,
  imageWPv: imageWPvProp,
  imageHPv: imageHPvProp,
  imageSize2Pv: imageSize2PvProp,
  colorModePv: colorModePvProp,
  initialPrefix,
  knownCameras,
  onPrefixChange,
  width  = 480,
  height = 360,
  crosshair = true,
}: CameraViewerProps) {
  // Active PV prefix when in prefix mode. Empty string = no camera selected
  // yet (placeholders show). The input is debounced via Enter/blur so we
  // don't re-subscribe on every keystroke.
  const prefixMode = initialPrefix !== undefined || (knownCameras && knownCameras.length > 0);
  const [prefix, setPrefixRaw] = useState<string>(initialPrefix ?? "");
  const [prefixDraft, setPrefixDraft] = useState<string>(initialPrefix ?? "");
  // Wrapped setter so external listeners (parent overlay record, saved
  // layouts) see committed prefix changes.
  const setPrefix = (p: string) => {
    setPrefixRaw(p);
    if (onPrefixChange) onPrefixChange(p);
  };

  // Derived PVs. Explicit props always win; otherwise compute from prefix.
  const trimmedPrefix = prefix.trim();
  const adPrefix     = adPrefixProp     ?? (trimmedPrefix ? `${trimmedPrefix}cam1:`               : undefined);
  const imagePv      = imagePvProp      ?? (trimmedPrefix ? `${trimmedPrefix}image1:ArrayData`     : undefined);
  const imageWPv     = imageWPvProp     ?? (trimmedPrefix ? `${trimmedPrefix}image1:ArraySize0_RBV` : undefined);
  const imageHPv     = imageHPvProp     ?? (trimmedPrefix ? `${trimmedPrefix}image1:ArraySize1_RBV` : undefined);
  const imageSize2Pv = imageSize2PvProp ?? (trimmedPrefix ? `${trimmedPrefix}image1:ArraySize2_RBV` : undefined);
  const colorModePv  = colorModePvProp  ?? (trimmedPrefix ? `${trimmedPrefix}cam1:ColorMode_RBV`    : undefined);
  const [showXhair, setShowXhair] = useState(crosshair);
  // PV-driven dimensions and color mode: fall back when not connected.
  const [, , , wRaw]  = useConnection(`cam-w-${imageWPv  ?? title}`, imageWPv  ? `ca://${imageWPv}`  : undefined);
  const [, , , hRaw]  = useConnection(`cam-h-${imageHPv  ?? title}`, imageHPv  ? `ca://${imageHPv}`  : undefined);
  const [, , , s2Raw] = useConnection(`cam-s2-${imageSize2Pv ?? title}`, imageSize2Pv ? `ca://${imageSize2Pv}` : undefined);
  const [, , , cmRaw] = useConnection(`cam-cm-${colorModePv ?? title}`, colorModePv ? `ca://${colorModePv}` : undefined);
  // AreaDetector lays RGB1 out as ArraySize0=3 (channels), ArraySize1=width,
  // ArraySize2=height. So when the first size PV reports 3, treat as RGB1
  // and use the next two as width/height. Otherwise plain Mono with
  // width=ArraySize0, height=ArraySize1.
  //
  // When an *Pv is provided but its current value is null (PV disconnected
  // or never connected), DON'T fall back to the static imageW/imageH props
  // — pass 0 so WaveformCanvas's dimsValid check flags the panel as
  // "Disconnected" instead of rendering the cached image data at wrong
  // dimensions (tile-garbage on IOC stop).
  const s0 = imageWPv ? (toDouble(wRaw) ?? 0) : imageW;
  const s1 = imageHPv ? (toDouble(hRaw) ?? 0) : imageH;
  const s2 = imageSize2Pv ? toDouble(s2Raw) : null;
  const isRGB1ByLayout = s0 === 3 && s2 != null && s2 > 0;
  const effW = isRGB1ByLayout ? s1 : s0;
  const effH = isRGB1ByLayout ? (s2 as number) : s1;
  const colorMode = isRGB1ByLayout ? 3 : ((colorModePv ? toDouble(cmRaw) : null) ?? 0);

  // Display contrast (Min/Max/Auto) — when Auto is on, manual values are
  // ignored, the canvas auto-scans the data, and the inputs show those
  // computed values as a live readback.
  const [autoContrast, setAutoContrast] = useState(true);
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [autoMin, setAutoMin] = useState<number | null>(null);
  const [autoMax, setAutoMax] = useState<number | null>(null);
  const manualMin = autoContrast || minText === "" ? null : Number(minText);
  const manualMax = autoContrast || maxText === "" ? null : Number(maxText);
  const minDisplay = autoContrast ? (autoMin != null ? String(Math.round(autoMin)) : "") : minText;
  const maxDisplay = autoContrast ? (autoMax != null ? String(Math.round(autoMax)) : "") : maxText;

  // Zoom — display-only canvas scaling. 1.0 = native displayW/displayH.
  const [zoom, setZoom] = useState(1);

  // Crosshair position in IMAGE PIXEL coordinates. Default to image centre;
  // user clicks anywhere on the canvas to relocate. Stored in image coords
  // so it stays correct as the display size / zoom change.
  const [crossImg, setCrossImg] = useState<{ x: number; y: number } | null>(null);
  const effImgW = Math.max(1, Math.round(effW));
  const effImgH = Math.max(1, Math.round(effH));
  const crossX = crossImg?.x ?? Math.round(effImgW / 2);
  const crossY = crossImg?.y ?? Math.round(effImgH / 2);
  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    if (rect.width <= 0 || rect.height <= 0) return;
    const ix = Math.max(0, Math.min(effImgW - 1, Math.floor(cssX / rect.width  * effImgW)));
    const iy = Math.max(0, Math.min(effImgH - 1, Math.floor(cssY / rect.height * effImgH)));
    setCrossImg({ x: ix, y: iy });
  }

  // The image container is sized by the parent's flex layout (flex:1, fills
  // remaining vertical space inside CameraViewer). We measure it to derive
  // aspect-preserving canvas dimensions. No feedback loop: the canvas inside
  // is sized FROM this measurement and never the other way around.
  const panelSize = useContext(PanelSizeContext);
  const imageBoxRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>(() => ({ w: width, h: height }));
  useEffect(() => {
    const el = imageBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: bw, height: bh } = entry.contentRect;
        if (bw > 10 && bh > 10) {
          setBoxSize(prev => (Math.round(bw) === prev.w && Math.round(bh) === prev.h)
            ? prev
            : { w: Math.round(bw), h: Math.round(bh) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Suppress unused-var warning when panel context is absent (still useful to
  // reference for future tweaks; harmless to read).
  void panelSize;
  // Source aspect from current dims, clamped to a sane range so a transient
  // bogus value (e.g. effW=1 before ArraySize PVs connect, or stale dims
  // after the IOC dies) doesn't render the image as a one-pixel-wide strip
  // and lock the panel into a weird shape.
  const rawAspect = effH / Math.max(1, effW);
  const sourceAspect = Number.isFinite(rawAspect) && rawAspect >= 0.1 && rawAspect <= 10
    ? rawAspect : 1;
  let dispW = boxSize.w;
  let dispH = dispW * sourceAspect;
  if (dispH > boxSize.h) {
    dispH = boxSize.h;
    dispW = dispH / sourceAspect;
  }
  dispW = Math.max(80, Math.round(dispW));
  dispH = Math.max(80, Math.round(dispH));
  const zoomedW = Math.round(dispW * zoom);
  const zoomedH = Math.round(dispH * zoom);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {prefixMode ? (
          // Visible dropdown of known cameras + always-editable text input.
          // Picking from the dropdown immediately loads that camera. Typing
          // in the input is committed on Enter or blur (so we don't re-
          // subscribe on every keystroke).
          <>
            <span style={{ fontSize: fontSize.badge, color: colors.sectionHdr, fontWeight: 600 }}>Cam:</span>
            <select value={knownCameras?.some(c => c.prefix === prefix) ? prefix : ""}
              aria-label="Pick known camera"
              onChange={e => {
                const v = e.target.value;
                if (v) { setPrefix(v); setPrefixDraft(v); }
              }}
              style={{
                fontFamily: "monospace", fontSize: fontSize.label,
                padding: "2px 6px", border: `1px solid ${colors.inputBorder}`,
                background: colors.inputBg, color: colors.spText, borderRadius: 2,
                cursor: "pointer",
              }}>
              <option value="">— pick —</option>
              {(knownCameras ?? []).map(c => (
                <option key={c.prefix} value={c.prefix}>{c.label}</option>
              ))}
            </select>
            <input type="text" value={prefixDraft}
              onChange={e => setPrefixDraft(e.target.value)}
              onBlur={() => setPrefix(prefixDraft)}
              onKeyDown={e => { if (e.key === "Enter") setPrefix(prefixDraft); }}
              placeholder="or type prefix"
              aria-label="Camera PV prefix"
              style={{
                flex: 1, minWidth: 80, fontFamily: "monospace", fontSize: fontSize.label,
                padding: "2px 6px", border: `1px solid ${colors.inputBorder}`,
                background: colors.inputBg, color: colors.spText, borderRadius: 2,
              }} />
          </>
        ) : (
          <h3 style={{
            margin: 0, fontSize: fontSize.badge, color: colors.sectionHdr,
            borderBottom: `1px solid ${colors.sectionHdrBorder}`, padding: "0 4px 3px", flex: 1,
          }}>{title}</h3>
        )}
        <label style={{ fontSize: fontSize.small, color: colors.dim, display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={showXhair} onChange={e => setShowXhair(e.target.checked)}
            aria-label="Crosshair" />
          Crosshair
        </label>
      </div>

      {/* Min / Max / Auto contrast controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fontSize.label, color: colors.label }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Min:
          <input type="text" inputMode="decimal" value={minDisplay} disabled={autoContrast} readOnly={autoContrast}
            onChange={e => setMinText(e.target.value)}
            aria-label="Display min"
            style={{ width: 36, fontFamily: "monospace", fontSize: fontSize.label,
              padding: "1px 4px", border: `1px solid ${colors.inputBorder}`,
              background: autoContrast ? colors.rbvBg : colors.inputBg, color: colors.spText,
              borderRadius: 2, textAlign: "right" }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Max:
          <input type="text" inputMode="decimal" value={maxDisplay} disabled={autoContrast} readOnly={autoContrast}
            onChange={e => setMaxText(e.target.value)}
            aria-label="Display max"
            style={{ width: 36, fontFamily: "monospace", fontSize: fontSize.label,
              padding: "1px 4px", border: `1px solid ${colors.inputBorder}`,
              background: autoContrast ? colors.rbvBg : colors.inputBg, color: colors.spText,
              borderRadius: 2, textAlign: "right" }} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={autoContrast}
            onChange={e => setAutoContrast(e.target.checked)}
            aria-label="Auto contrast" />
          Auto
        </label>
        {/* X/Y crosshair pixel readout — only shown when crosshair is on. */}
        {showXhair && (
          <span style={{
            marginLeft: "auto", fontFamily: "monospace", fontSize: fontSize.label,
            padding: "1px 6px", background: colors.rbvBg,
            border: `1px solid ${colors.rbvBorder}`, borderRadius: 2, color: colors.rbvText,
          }}>
            x:{crossX} y:{crossY}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 6, flex: 1, minHeight: 0, minWidth: 0 }}>
        {/* Image box — flex:1 fills remaining space. ResizeObserver measures
            this box; the inner image is sized FROM that measurement with
            aspect preserved. Centred via auto margin when it fits; when
            zoomed past the box, it sits at top-left and the box scrolls so
            every corner is reachable. */}
        <div ref={imageBoxRef} style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0,
          overflow: zoom > 1 ? "auto" : "hidden",
          background: "#0f2035", borderRadius: 3 }}>
          <div onClick={handleImageClick}
            style={{
              width: zoomedW, height: zoomedH, position: "relative", flexShrink: 0,
              cursor: "crosshair",
              // Centre when content fits the box, top-left when it overflows
              // (so the scrollbars expose every corner).
              margin: zoom > 1 ? 0 : "auto",
              marginTop: zoom > 1 ? 0 : Math.max(0, (boxSize.h - zoomedH) / 2),
            }}>
            {mjpegUrl ? (
              <MjpegImg url={mjpegUrl} width={zoomedW} height={zoomedH} />
            ) : imagePv ? (
              <WaveformCanvas
                imagePv={imagePv}
                acquirePv={adPrefix ? `${adPrefix}Acquire_RBV` : undefined}
                imageW={Math.max(1, Math.round(effW))}
                imageH={Math.max(1, Math.round(effH))}
                displayW={zoomedW}
                displayH={zoomedH}
                colorMode={colorMode}
                manualMin={manualMin}
                manualMax={manualMax}
                onAutoRange={(mn, mx) => { setAutoMin(mn); setAutoMax(mx); }}
              />
            ) : (
              // Blank panel — the Cam dropdown / input above already conveys
              // that no camera is picked yet, no need for an in-image label.
              <div style={{ width: zoomedW, height: zoomedH, background: "#0f2035", borderRadius: 3 }} />
            )}
            {showXhair && (
              <Crosshair width={zoomedW} height={zoomedH}
                cx={(crossX + 0.5) / effImgW * zoomedW}
                cy={(crossY + 0.5) / effImgH * zoomedH} />
            )}
          </div>
        </div>

        {/* Zoom controls — column to the right of the image */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
          gap: 4, fontSize: fontSize.small, color: colors.label, paddingTop: 24 }}>
          <button onClick={() => setZoom(z => Math.min(8, z * 1.25))} title="Zoom in"
            style={{ width: 24, height: 24, padding: 0, fontSize: 14, cursor: "pointer",
              border: `1px solid ${colors.relatedBorder}`, background: colors.relatedBg,
              color: colors.relatedFg, borderRadius: 3 }}>+</button>
          <span style={{ fontFamily: "monospace" }}>{zoom.toFixed(2)}x</span>
          <button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} title="Zoom out"
            style={{ width: 24, height: 24, padding: 0, fontSize: 14, cursor: "pointer",
              border: `1px solid ${colors.relatedBorder}`, background: colors.relatedBg,
              color: colors.relatedFg, borderRadius: 3 }}>−</button>
          <button onClick={() => setZoom(1)} title="Reset zoom"
            style={{ width: 24, height: 18, padding: 0, fontSize: 10, cursor: "pointer",
              border: `1px solid ${colors.relatedBorder}`, background: colors.relatedBg,
              color: colors.relatedFg, borderRadius: 3 }}>1x</button>
        </div>
      </div>

      {adPrefix && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", flexShrink: 0 }}>
          <AcquireBtn pv={`${adPrefix}Acquire`} />
          <DoneIndicator pv={`${adPrefix}Acquire_RBV`} />
          <div style={{ marginLeft: "auto" }}>
            <SpRow label="Exposure"  pv={`${adPrefix}AcquireTime`}   prec={4} unit="s" />
          </div>
          {(() => {
            // Pick the AD record prefix for the gear-icon macro `P`. In prefix
            // mode we have it directly. Otherwise derive from the explicit
            // adPrefix prop by stripping the trailing `cam1:` segment.
            const gearPrefix = trimmedPrefix || (adPrefix ? adPrefix.replace(/cam1:$/, "") : "");
            return gearPrefix ? <SettingsButton prefix={gearPrefix} /> : null;
          })()}
        </div>
      )}
    </div>
  );
}
