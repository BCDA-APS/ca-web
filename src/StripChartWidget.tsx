import { useState, useEffect, useRef } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";

// cs-web-lib's built-in StripChart uses the EPICS PV timestamp as the x-position.
// When a PV is constant, no new pvws messages arrive, the timestamp doesn't advance,
// and after one time-window the trace scrolls off the left edge and disappears.
// This component samples the current value at 1 Hz using Date.now() so the trace
// always stays at the right edge of the window regardless of PV update rate.

interface Props {
  pv: string;   // bare name, no ca:// prefix
  label: string;
  windowMs?: number;  // visible time window in ms, default 60 s
}

function extractDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number } }).value;
  return val?.doubleValue ?? null;
}

const W = 560;
const H = 240;
const PAD = { l: 70, r: 16, t: 24, b: 28 };
const INNER_W = W - PAD.l - PAD.r;
const INNER_H = H - PAD.t - PAD.b;
const N_YTICKS = 4;
const N_XTICKS = 6;
const COLORS = {
  bg: "#0f2035",
  axis: "#90caf9",
  grid: "#1a3a5c",
  trace: "#4fc3f7",
  text: "#90caf9",
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtValue(v: number): string {
  if (Math.abs(v) >= 1e5 || (Math.abs(v) < 0.01 && v !== 0)) {
    return v.toExponential(2);
  }
  return v.toPrecision(4);
}

export function StripChartWidget({ pv, label, windowMs = 60_000 }: Props) {
  const [, connected, , rawValue] = useConnection(`sc-${pv}`, `ca://${pv}`);

  // Keep the latest value in a ref so the timer always has the current reading.
  const latestV = useRef<number | null>(null);
  useEffect(() => {
    const v = extractDouble(rawValue);
    if (v !== null) latestV.current = v;
  }, [rawValue]);

  // Circular buffer of (wallclock-t, value) sampled at 1 Hz.
  const data = useRef<{ t: number; v: number }[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (latestV.current !== null) {
        const now = Date.now();
        data.current = [
          ...data.current.filter(p => p.t >= now - windowMs),
          { t: now, v: latestV.current! },
        ];
      }
      tick(n => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [windowMs]);

  // ── Rendering ──────────────────────────────────────────────────────────────

  const now = Date.now();
  const tMin = now - windowMs;
  const pts = data.current;

  const vMin = pts.length > 0 ? Math.min(...pts.map(p => p.v)) : 0;
  const vMax = pts.length > 0 ? Math.max(...pts.map(p => p.v)) : 1;
  // Add 10 % padding so a perfectly flat trace sits in the middle.
  const vRange = vMax - vMin || Math.abs(vMax) || 1;
  const vLo = vMin - vRange * 0.1;
  const vHi = vMax + vRange * 0.1;

  const toX = (t: number) => PAD.l + ((t - tMin) / windowMs) * INNER_W;
  const toY = (v: number) => PAD.t + (1 - (v - vLo) / (vHi - vLo)) * INNER_H;

  const pathD = pts.length > 0
    ? pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`).join(" ")
    : "";

  // Y-axis ticks
  const yTicks = Array.from({ length: N_YTICKS }, (_, i) => {
    const v = vLo + (i / (N_YTICKS - 1)) * (vHi - vLo);
    return { v, y: toY(v) };
  });

  // X-axis ticks
  const xTicks = Array.from({ length: N_XTICKS + 1 }, (_, i) => {
    const t = tMin + (i / N_XTICKS) * windowMs;
    return { t, x: toX(t) };
  });

  return (
    <div style={{ display: "inline-block" }}>
      <svg
        width={W}
        height={H}
        style={{ background: COLORS.bg, borderRadius: 6, display: "block" }}
      >
        {/* Grid lines */}
        {yTicks.map(({ y }, i) => (
          <line key={i} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
            stroke={COLORS.grid} strokeWidth={1} />
        ))}
        {xTicks.map(({ x }, i) => (
          <line key={i} x1={x} y1={PAD.t} x2={x} y2={H - PAD.b}
            stroke={COLORS.grid} strokeWidth={1} />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ v, y }, i) => (
          <text key={i} x={PAD.l - 6} y={y + 4}
            fill={COLORS.text} fontSize={10} textAnchor="end"
            fontFamily="monospace">
            {fmtValue(v)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map(({ t, x }, i) => (
          <text key={i} x={x} y={H - PAD.b + 16}
            fill={COLORS.text} fontSize={10} textAnchor="middle"
            fontFamily="monospace">
            {fmtTime(t)}
          </text>
        ))}

        {/* Axis lines */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b}
          stroke={COLORS.axis} strokeWidth={1.5} />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b}
          stroke={COLORS.axis} strokeWidth={1.5} />

        {/* Trace */}
        {pathD && (
          <path d={pathD} fill="none" stroke={COLORS.trace} strokeWidth={2}
            strokeLinejoin="round" />
        )}

        {/* Legend */}
        <line x1={W / 2 - 28} y1={PAD.t - 8} x2={W / 2 - 12} y2={PAD.t - 8}
          stroke={COLORS.trace} strokeWidth={2} />
        <text x={W / 2 - 6} y={PAD.t - 4}
          fill={COLORS.trace} fontSize={12} textAnchor="start">
          {label}
        </text>

        {/* Disconnected / no-data overlay */}
        {!connected && (
          <text x={W / 2} y={H / 2} fill="#ff6b6b" fontSize={13}
            textAnchor="middle">Disconnected</text>
        )}
        {connected && pts.length === 0 && (
          <text x={W / 2} y={H / 2} fill={COLORS.text} fontSize={13}
            textAnchor="middle">Waiting for data…</text>
        )}
      </svg>
    </div>
  );
}
