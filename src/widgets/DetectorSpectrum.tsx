import { useMemo } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";
import { ChanRbvBox } from "./EpicsWidgets";
import { pvwsWriter } from "../lib/pvwsWriter";

export interface RoiSpec {
  /** Display label, e.g. "Fe Kα" */
  label: string;
  /** PV for the integrated count, e.g. "29iddxp1:dxp1:R0" */
  countPv: string;
  /** Optional low/high channel bounds for display. */
  loPv?: string;
  hiPv?: string;
}

export interface DetectorSpectrumProps {
  /** Display title, e.g. "DXP Saturn ch1". */
  title: string;
  /** PV that delivers the spectrum waveform (e.g. "29iddxp1:mca1.VAL"). */
  spectrumPv: string;
  /** PV for elapsed real time (s). */
  realTimePv?: string;
  /** PV for live time (s). */
  liveTimePv?: string;
  /** PV for input count rate (Hz). */
  icrPv?: string;
  /** PV for output count rate (Hz). */
  ocrPv?: string;
  /** PV for dead-time percentage. */
  deadTimePv?: string;
  /** Start/EraseStart PV (write 1 to begin acquisition). */
  startPv?: string;
  /** Stop PV (write 1). */
  stopPv?: string;
  /** Erase PV (write 1). */
  erasePv?: string;
  /** Acquiring status PV (1 = acquiring). */
  acquiringPv?: string;
  /** Optional ROI list. */
  rois?: RoiSpec[];
  /** Number of channels (default 2048). */
  channels?: number;
  /** Plot height (px). */
  height?: number;
  /** Plot width (px). */
  width?: number;
}

const PLOT_PAD = { l: 50, r: 10, t: 10, b: 24 };

function fmtRange(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || (a > 0 && a < 0.1)) return v.toExponential(1);
  return v.toFixed(0);
}

function extractWaveform(raw: unknown): number[] | null {
  const val = (raw as { value?: { arrayValue?: unknown } })?.value?.arrayValue;
  if (!val) return null;
  const asAny = val as { length?: number; [k: number]: number };
  if (typeof asAny.length === "number") {
    const n = asAny.length;
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = asAny[i] ?? 0;
    return out;
  }
  // Plain object map { "0": x, "1": y, ... }
  const obj = val as Record<string, number>;
  const keys = Object.keys(obj).map(Number).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  return keys.map(k => obj[k] ?? 0);
}

// ── SpectrumPlot ──────────────────────────────────────────────────────────────

function SpectrumPlot({ spectrumPv, channels, width, height }: {
  spectrumPv: string;
  channels: number;
  width: number;
  height: number;
}) {
  const [, , , raw] = useConnection(`spec-${spectrumPv}`, `ca://${spectrumPv}`);
  const data = useMemo(() => extractWaveform(raw) ?? [], [raw]);

  const innerW = width  - PLOT_PAD.l - PLOT_PAD.r;
  const innerH = height - PLOT_PAD.t - PLOT_PAD.b;
  const N = Math.min(data.length || channels, channels);
  const maxY = data.length ? Math.max(1, ...data) : 1;

  // Build path string
  const path = useMemo(() => {
    if (data.length === 0) return "";
    const stepX = innerW / Math.max(N - 1, 1);
    let d = "";
    for (let i = 0; i < N; i++) {
      const x = PLOT_PAD.l + i * stepX;
      const y = PLOT_PAD.t + innerH * (1 - data[i] / maxY);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
    }
    return d;
  }, [data, innerW, innerH, N, maxY]);

  const yTicks = 4;
  const xTicks = 5;

  return (
    <svg
      width={width} height={height}
      onContextMenu={e => pvCtx(spectrumPv, raw, e)}
      style={{ background: "#0f2035", borderRadius: 3, display: "block" }}
    >
      {/* grid */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = PLOT_PAD.t + (innerH * i) / yTicks;
        const v = maxY * (1 - i / yTicks);
        return (
          <g key={`y${i}`}>
            <line x1={PLOT_PAD.l} y1={y} x2={width - PLOT_PAD.r} y2={y} stroke="#1a3a5c" strokeWidth={1} />
            <text x={PLOT_PAD.l - 4} y={y + 3} fontSize={9} textAnchor="end" fill="#90caf9" fontFamily="monospace">
              {fmtRange(v)}
            </text>
          </g>
        );
      })}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const x = PLOT_PAD.l + (innerW * i) / xTicks;
        const v = Math.round((N * i) / xTicks);
        return (
          <g key={`x${i}`}>
            <line x1={x} y1={PLOT_PAD.t} x2={x} y2={height - PLOT_PAD.b} stroke="#1a3a5c" strokeWidth={1} />
            <text x={x} y={height - PLOT_PAD.b + 12} fontSize={9} textAnchor="middle" fill="#90caf9" fontFamily="monospace">
              {v}
            </text>
          </g>
        );
      })}
      {/* trace */}
      {path && <path d={path} fill="none" stroke="#4fc3f7" strokeWidth={1.2} />}
      {/* empty state */}
      {data.length === 0 && (
        <text x={width / 2} y={height / 2} fill="#5c7a99" fontSize={11} textAnchor="middle">
          Waiting for spectrum…
        </text>
      )}
    </svg>
  );
}

// ── RoiRow ────────────────────────────────────────────────────────────────────

function RoiRow({ spec }: { spec: RoiSpec }) {
  const [, , , raw] = useConnection(`roi-${spec.countPv}`, `ca://${spec.countPv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
      <span style={{ width: 80, fontSize: fontSize.label, color: colors.label, fontFamily: "sans-serif" }}>{spec.label}</span>
      <ChanRbvBox raw={raw} width={100} fallbackPrec={0} onContextMenu={e => pvCtx(spec.countPv, raw, e)} />
    </div>
  );
}

// ── Stat helpers ──────────────────────────────────────────────────────────────

function StatBox({ label, pv, prec = 3 }: { label: string; pv: string; prec?: number }) {
  const [, , , raw] = useConnection(`stat-${pv}`, `ca://${pv}`);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: fontSize.small, color: colors.dim, fontFamily: "sans-serif" }}>{label}</span>
      <ChanRbvBox raw={raw} width={86} fallbackPrec={prec} onContextMenu={e => pvCtx(pv, raw, e)} />
    </div>
  );
}

function AcquireBadge({ pv }: { pv: string }) {
  const [, , , raw] = useConnection(`acq-${pv}`, `ca://${pv}`);
  const acq = toDouble(raw) === 1;
  return (
    <span
      onContextMenu={e => pvCtx(pv, raw, e)}
      style={{
        padding: "2px 8px", borderRadius: 3, fontSize: fontSize.small,
        fontFamily: "sans-serif", color: "#fff",
        background: acq ? colors.statusOk : colors.dim, cursor: "context-menu",
      }}
    >
      {acq ? "Acquiring" : "Idle"}
    </span>
  );
}

// ── DetectorSpectrum ──────────────────────────────────────────────────────────

export function DetectorSpectrum({
  title, spectrumPv,
  realTimePv, liveTimePv, icrPv, ocrPv, deadTimePv,
  startPv, stopPv, erasePv, acquiringPv,
  rois = [],
  channels = 2048,
  width  = 520,
  height = 220,
}: DetectorSpectrumProps) {
  const ctrlBtn: React.CSSProperties = {
    background: colors.spBg, color: colors.spText,
    border: `1px solid ${colors.spBorder}`, borderRadius: 3,
    padding: "4px 12px", cursor: "pointer", fontSize: fontSize.label,
    fontFamily: "sans-serif", fontWeight: 700,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, fontFamily: "sans-serif", minWidth: width + 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{
          margin: 0, fontSize: fontSize.badge, color: colors.sectionHdr,
          borderBottom: `1px solid ${colors.sectionHdrBorder}`, padding: "0 4px 3px",
          flex: 1,
        }}>{title}</h3>
        {acquiringPv && <AcquireBadge pv={acquiringPv} />}
      </div>

      {/* Acquire controls */}
      {(startPv || stopPv || erasePv) && (
        <div style={{ display: "flex", gap: 6 }}>
          {startPv && (
            <button style={{ ...ctrlBtn, background: colors.statusOk, color: "#fff", border: "none" }}
                    onClick={() => pvwsWriter.write(startPv, 1)}>Start</button>
          )}
          {stopPv && (
            <button style={{ ...ctrlBtn, background: colors.statusError, color: "#fff", border: "none" }}
                    onClick={() => pvwsWriter.write(stopPv, 1)}>Stop</button>
          )}
          {erasePv && (
            <button style={ctrlBtn} onClick={() => pvwsWriter.write(erasePv, 1)}>Erase</button>
          )}
        </div>
      )}

      {/* Spectrum plot */}
      <SpectrumPlot spectrumPv={spectrumPv} channels={channels} width={width} height={height} />

      {/* Statistics */}
      {(realTimePv || liveTimePv || icrPv || ocrPv || deadTimePv) && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {realTimePv && <StatBox label="Real time (s)"  pv={realTimePv} />}
          {liveTimePv && <StatBox label="Live time (s)"  pv={liveTimePv} />}
          {icrPv      && <StatBox label="ICR (cps)"      pv={icrPv}      prec={0} />}
          {ocrPv      && <StatBox label="OCR (cps)"      pv={ocrPv}      prec={0} />}
          {deadTimePv && <StatBox label="Dead time (%)"  pv={deadTimePv} prec={1} />}
        </div>
      )}

      {/* ROIs */}
      {rois.length > 0 && (
        <section>
          <h4 style={{ margin: "0 0 4px", fontSize: fontSize.label, color: colors.dim }}>ROIs</h4>
          {rois.map(r => <RoiRow key={r.countPv} spec={r} />)}
        </section>
      )}
    </div>
  );
}
