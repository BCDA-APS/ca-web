import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble } from "../lib/epics";

// One per enabled PV. React mounts/unmounts these as the enabled set changes,
// so cs-web-lib's useConnection cleanup unsubscribes from pvws on remove.
function TraceSubscriber({ pv, onValue }: {
  pv: string;
  onValue: (pv: string, v: number | null) => void;
}) {
  const [, , , raw] = useConnection(`strip-${pv}`, `ca://${pv}`);
  useEffect(() => {
    onValue(pv, toDouble(raw));
  }, [pv, raw, onValue]);
  return null;
}

export interface TraceConfig {
  pv: string;
  label?: string;
  color?: string;
  enabled?: boolean;
}

interface Props {
  id: string;
  initialPvs?: TraceConfig[];
  defaultWindowMs?: number;
  width?: number;
  height?: number;
}

type YMode = "auto" | "norm" | "manual";

interface Persisted {
  enabled?: string[];
  colors?: Record<string, string>;
  extraPvs?: TraceConfig[];
  windowMs?: number;
  yMode?: YMode;
  logY?: boolean;
  yMin?: number | null;
  yMax?: number | null;
}

const PALETTE = [
  "#4fc3f7", "#aed581", "#ffd54f", "#f06292",
  "#ff8a65", "#4dd0e1", "#ffca28", "#ba68c8",
  "#4db6ac", "#ff8a80", "#81d4fa", "#f48fb1",
];

const WINDOWS: { label: string; ms: number }[] = [
  { label: "2m",  ms:  2 * 60_000 },
  { label: "5m",  ms:  5 * 60_000 },
  { label: "10m", ms: 10 * 60_000 },
  { label: "20m", ms: 20 * 60_000 },
];

const CHART_PAD = { l: 70, r: 12, t: 18, b: 24 };
const N_YTICKS = 4;
const N_XTICKS = 6;

const UI = {
  bg:        "#0f2035",
  panel:     "#142a45",
  border:    "#1a3a5c",
  axis:      "#90caf9",
  grid:      "#1a3a5c",
  text:      "#90caf9",
  textDim:   "#5c7a99",
  divider:   "#243a5c",
  inputBg:   "#1a3550",
  inputText: "#cfe7ff",
};

function loadState(id: string): Persisted | null {
  try {
    const raw = localStorage.getItem(`stripchart:${id}`);
    return raw ? JSON.parse(raw) as Persisted : null;
  } catch {
    return null;
  }
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function fmtValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 0.01) return v.toExponential(2);
  return v.toPrecision(4);
}

export function StripChart({
  id,
  initialPvs = [],
  defaultWindowMs = 5 * 60_000,
  width = 700,
  height = 320,
}: Props) {
  const persisted = useRef(loadState(id)).current;

  const [enabled, setEnabled] = useState<Set<string>>(() =>
    persisted?.enabled
      ? new Set(persisted.enabled)
      : new Set(initialPvs.filter(p => p.enabled).map(p => p.pv))
  );
  const [colorsMap, setColorsMap] = useState<Record<string, string>>(() => persisted?.colors ?? {});
  const [extraPvs, setExtraPvs] = useState<TraceConfig[]>(() => persisted?.extraPvs ?? []);
  const [windowMs, setWindowMs] = useState<number>(() => persisted?.windowMs ?? defaultWindowMs);
  const [yMode, setYMode]       = useState<YMode>(() => persisted?.yMode ?? "auto");
  const [logY, setLogY]         = useState<boolean>(() => persisted?.logY ?? false);
  const [yMin, setYMin]         = useState<number | null>(() => persisted?.yMin ?? null);
  const [yMax, setYMax]         = useState<number | null>(() => persisted?.yMax ?? null);
  const [addInput, setAddInput] = useState("");

  // Persist any state change.
  useEffect(() => {
    const payload: Persisted = {
      enabled: [...enabled],
      colors: colorsMap,
      extraPvs,
      windowMs, yMode, logY, yMin, yMax,
    };
    try { localStorage.setItem(`stripchart:${id}`, JSON.stringify(payload)); } catch {}
  }, [id, enabled, colorsMap, extraPvs, windowMs, yMode, logY, yMin, yMax]);

  // ── Sidebar entries: pre-loaded (from props) + ad-hoc (from state) ─────────
  const sidebar = useMemo(() => [
    ...initialPvs.map(p => ({ ...p, removable: false })),
    ...extraPvs .map(p => ({ ...p, removable: true  })),
  ], [initialPvs, extraPvs]);

  // ── Subscriptions: only enabled PVs ───────────────────────────────────────
  const enabledPvs = useMemo(
    () => sidebar.filter(p => enabled.has(p.pv)).map(p => p.pv),
    [sidebar, enabled],
  );

  // ── Latest values + 1 Hz sampling ─────────────────────────────────────────
  const latestV = useRef<Map<string, number>>(new Map());
  const dataBuf = useRef<Map<string, { t: number; v: number }[]>>(new Map());
  const [, tick] = useState(0);

  const recordValue = useCallback((pv: string, v: number | null) => {
    if (v !== null && Number.isFinite(v)) latestV.current.set(pv, v);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      enabledPvs.forEach(pv => {
        const v = latestV.current.get(pv);
        if (v !== undefined && Number.isFinite(v)) {
          const buf = dataBuf.current.get(pv) ?? [];
          const next = buf.filter(p => p.t >= now - windowMs);
          next.push({ t: now, v });
          dataBuf.current.set(pv, next);
        }
      });
      tick(n => n + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [enabledPvs, windowMs]);

  // ── Toggle / add / remove handlers ────────────────────────────────────────
  function toggle(pv: string) {
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(pv)) next.delete(pv);
      else next.add(pv);
      return next;
    });
    if (!enabled.has(pv) && !colorsMap[pv]) {
      const used = new Set(Object.values(colorsMap));
      const free = PALETTE.find(c => !used.has(c)) ?? PALETTE[Object.keys(colorsMap).length % PALETTE.length];
      setColorsMap(prev => ({ ...prev, [pv]: free }));
    }
  }

  function addPv() {
    const pv = addInput.trim();
    if (!pv) return;
    if (sidebar.some(s => s.pv === pv)) { setAddInput(""); return; }
    setExtraPvs(prev => [...prev, { pv }]);
    setEnabled(prev => new Set(prev).add(pv));
    if (!colorsMap[pv]) {
      const used = new Set(Object.values(colorsMap));
      const free = PALETTE.find(c => !used.has(c)) ?? PALETTE[Object.keys(colorsMap).length % PALETTE.length];
      setColorsMap(prev => ({ ...prev, [pv]: free }));
    }
    setAddInput("");
  }

  function removePv(pv: string) {
    setExtraPvs(prev => prev.filter(p => p.pv !== pv));
    setEnabled(prev => { const n = new Set(prev); n.delete(pv); return n; });
    dataBuf.current.delete(pv);
    latestV.current.delete(pv);
  }

  function clearBuffers() {
    dataBuf.current = new Map();
    tick(n => n + 1);
  }

  // ── Layout dimensions ─────────────────────────────────────────────────────
  const CTRL_H = 30;
  const SIDEBAR_W = 140;
  const chartW = width  - SIDEBAR_W;
  const chartH = height - CTRL_H;

  // ── Chart math ────────────────────────────────────────────────────────────
  const now = Date.now();
  const tMin = now - windowMs;

  const traces = enabledPvs.map(pv => ({
    pv,
    label: sidebar.find(s => s.pv === pv)?.label ?? pv,
    color: colorsMap[pv] ?? UI.text,
    points: dataBuf.current.get(pv) ?? [],
  }));

  // Per-trace [min, max] for Norm mode and combined range for Auto.
  const perTraceRange = traces.map(tr => {
    const vs = tr.points.map(p => p.v).filter(v => Number.isFinite(v) && (!logY || v > 0));
    if (vs.length === 0) return null;
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return { lo, hi };
  });

  let autoLo = 0, autoHi = 1;
  const allRanges = perTraceRange.filter((r): r is {lo:number;hi:number} => r !== null);
  if (allRanges.length > 0) {
    autoLo = Math.min(...allRanges.map(r => r.lo));
    autoHi = Math.max(...allRanges.map(r => r.hi));
  }

  // Compute final axis range based on mode + log
  let axisLo: number, axisHi: number;
  if (yMode === "manual" && yMin !== null && yMax !== null && yMin < yMax) {
    axisLo = yMin; axisHi = yMax;
  } else if (yMode === "norm") {
    axisLo = 0; axisHi = 1;
  } else {
    const range = autoHi - autoLo || Math.abs(autoHi) || 1;
    if (logY) {
      axisLo = autoLo > 0 ? autoLo : 1e-9;
      axisHi = autoHi > 0 ? autoHi : 1;
    } else {
      axisLo = autoLo - range * 0.1;
      axisHi = autoHi + range * 0.1;
    }
  }

  const innerW = chartW - CHART_PAD.l - CHART_PAD.r;
  const innerH = chartH - CHART_PAD.t - CHART_PAD.b;
  const toX = (t: number) => CHART_PAD.l + ((t - tMin) / windowMs) * innerW;

  function makeYMapper(traceLo: number, traceHi: number) {
    if (yMode === "norm") {
      const span = traceHi - traceLo || 1;
      return (v: number) => CHART_PAD.t + (1 - (v - traceLo) / span) * innerH;
    }
    if (logY) {
      const lLo = Math.log10(Math.max(axisLo, 1e-30));
      const lHi = Math.log10(Math.max(axisHi, 1e-30));
      const span = lHi - lLo || 1;
      return (v: number) => {
        if (v <= 0) return NaN;
        return CHART_PAD.t + (1 - (Math.log10(v) - lLo) / span) * innerH;
      };
    }
    const span = axisHi - axisLo || 1;
    return (v: number) => CHART_PAD.t + (1 - (v - axisLo) / span) * innerH;
  }

  // Y-axis tick labels
  const yTicks = (() => {
    if (yMode === "norm") {
      return Array.from({ length: N_YTICKS }, (_, i) => {
        const f = i / (N_YTICKS - 1);
        const y = CHART_PAD.t + (1 - f) * innerH;
        return { label: f.toFixed(2), y };
      });
    }
    if (logY) {
      const lLo = Math.log10(Math.max(axisLo, 1e-30));
      const lHi = Math.log10(Math.max(axisHi, 1e-30));
      return Array.from({ length: N_YTICKS }, (_, i) => {
        const f = i / (N_YTICKS - 1);
        const lv = lLo + f * (lHi - lLo);
        const y = CHART_PAD.t + (1 - f) * innerH;
        return { label: fmtValue(Math.pow(10, lv)), y };
      });
    }
    return Array.from({ length: N_YTICKS }, (_, i) => {
      const f = i / (N_YTICKS - 1);
      const v = axisLo + f * (axisHi - axisLo);
      const y = CHART_PAD.t + (1 - f) * innerH;
      return { label: fmtValue(v), y };
    });
  })();

  const xTicks = Array.from({ length: N_XTICKS + 1 }, (_, i) => {
    const t = tMin + (i / N_XTICKS) * windowMs;
    return { t, x: toX(t) };
  });

  // ── Render ────────────────────────────────────────────────────────────────
  const ctrlBtn: React.CSSProperties = {
    background: UI.inputBg, color: UI.inputText,
    border: `1px solid ${UI.border}`, borderRadius: 3,
    padding: "2px 8px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif",
  };
  const numInput: React.CSSProperties = {
    width: 60, background: UI.inputBg, color: UI.inputText,
    border: `1px solid ${UI.border}`, borderRadius: 2, fontSize: 11,
    padding: "1px 3px", fontFamily: "monospace",
  };

  const logDisabled = yMode === "norm";

  return (
    <div style={{
      display: "flex", flexDirection: "column", width, height,
      background: UI.bg, color: UI.text, fontFamily: "sans-serif",
      borderRadius: 4,
    }}>
      {enabledPvs.map(pv => (
        <TraceSubscriber key={pv} pv={pv} onValue={recordValue} />
      ))}
      {/* Controls bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, height: CTRL_H,
        padding: "0 8px", borderBottom: `1px solid ${UI.border}`,
        fontSize: 11, flexShrink: 0,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Window:
          <select value={windowMs} onChange={e => setWindowMs(Number(e.target.value))}
            style={{ ...ctrlBtn, padding: "1px 4px" }}>
            {WINDOWS.map(w => <option key={w.ms} value={w.ms}>{w.label}</option>)}
          </select>
        </label>
        <span style={{ color: UI.textDim }}>|</span>
        <span>Y:</span>
        {(["auto", "norm", "manual"] as YMode[]).map(m => (
          <label key={m} style={{ display: "flex", alignItems: "center", gap: 2, cursor: "pointer" }}>
            <input type="radio" name={`ym-${id}`} checked={yMode === m}
              onChange={() => setYMode(m)} />
            {m === "auto" ? "Auto" : m === "norm" ? "Norm" : "Manual"}
          </label>
        ))}
        {yMode === "manual" && (
          <>
            <input type="number" placeholder="min" value={yMin ?? ""} style={numInput}
              onChange={e => setYMin(e.target.value === "" ? null : Number(e.target.value))} />
            <input type="number" placeholder="max" value={yMax ?? ""} style={numInput}
              onChange={e => setYMax(e.target.value === "" ? null : Number(e.target.value))} />
          </>
        )}
        <label style={{
          display: "flex", alignItems: "center", gap: 2,
          opacity: logDisabled ? 0.4 : 1,
          cursor: logDisabled ? "not-allowed" : "pointer",
        }} title={logDisabled ? "Log scale doesn't apply to normalized mode" : ""}>
          <input type="checkbox" checked={logY && !logDisabled} disabled={logDisabled}
            onChange={e => setLogY(e.target.checked)} />
          Log Y
        </label>
        <button style={{ ...ctrlBtn, marginLeft: "auto" }} onClick={clearBuffers}>Clear</button>
      </div>

      {/* Sidebar + chart */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{
          width: SIDEBAR_W, borderRight: `1px solid ${UI.border}`,
          padding: 4, display: "flex", flexDirection: "column",
          fontSize: 11, overflow: "auto", flexShrink: 0,
        }}>
          {sidebar.map((p, i) => {
            const showDivider = p.removable && (i === 0 || !sidebar[i - 1].removable);
            const checked = enabled.has(p.pv);
            const swatch = checked ? colorsMap[p.pv] : null;
            return (
              <div key={p.pv}>
                {showDivider && <div style={{ borderTop: `1px solid ${UI.divider}`, margin: "3px 0" }}/>}
                <label style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "1px 0", cursor: "pointer",
                }} title={p.pv}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(p.pv)} />
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: swatch ?? "transparent",
                    border: swatch ? "none" : `1px solid ${UI.divider}`,
                    flexShrink: 0,
                  }}/>
                  <span style={{
                    flex: 1, color: checked ? UI.inputText : UI.textDim,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.label ?? p.pv}
                  </span>
                  {p.removable && (
                    <button onClick={e => { e.preventDefault(); removePv(p.pv); }}
                      title="Remove"
                      style={{
                        background: "transparent", border: "none", color: UI.textDim,
                        cursor: "pointer", padding: "0 2px", fontSize: 12, lineHeight: 1,
                      }}>×</button>
                  )}
                </label>
              </div>
            );
          })}
          {/* Add input */}
          <div style={{ marginTop: "auto", display: "flex", gap: 2, paddingTop: 6 }}>
            <input value={addInput} placeholder="add PV"
              onChange={e => setAddInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addPv(); }}
              style={{
                flex: 1, minWidth: 0, background: UI.inputBg, color: UI.inputText,
                border: `1px solid ${UI.border}`, borderRadius: 2, fontSize: 11,
                padding: "1px 3px", fontFamily: "monospace",
              }} />
            <button onClick={addPv} style={{ ...ctrlBtn, padding: "0 6px" }}>+</button>
          </div>
        </div>

        {/* Chart */}
        <svg width={chartW} height={chartH} style={{ background: UI.bg, display: "block" }}>
          {/* Grid */}
          {yTicks.map((t, i) => (
            <line key={`gy-${i}`} x1={CHART_PAD.l} y1={t.y} x2={chartW - CHART_PAD.r} y2={t.y}
              stroke={UI.grid} strokeWidth={1}/>
          ))}
          {xTicks.map((t, i) => (
            <line key={`gx-${i}`} x1={t.x} y1={CHART_PAD.t} x2={t.x} y2={chartH - CHART_PAD.b}
              stroke={UI.grid} strokeWidth={1}/>
          ))}

          {/* Y labels */}
          {yTicks.map((t, i) => (
            <text key={`ly-${i}`} x={CHART_PAD.l - 6} y={t.y + 4}
              fill={UI.text} fontSize={10} textAnchor="end" fontFamily="monospace">
              {t.label}
            </text>
          ))}

          {/* X labels */}
          {xTicks.map((t, i) => (
            <text key={`lx-${i}`} x={t.x} y={chartH - CHART_PAD.b + 14}
              fill={UI.text} fontSize={10} textAnchor="middle" fontFamily="monospace">
              {fmtTime(t.t)}
            </text>
          ))}

          {/* Axes */}
          <line x1={CHART_PAD.l} y1={CHART_PAD.t} x2={CHART_PAD.l} y2={chartH - CHART_PAD.b}
            stroke={UI.axis} strokeWidth={1.5}/>
          <line x1={CHART_PAD.l} y1={chartH - CHART_PAD.b} x2={chartW - CHART_PAD.r} y2={chartH - CHART_PAD.b}
            stroke={UI.axis} strokeWidth={1.5}/>

          {/* Traces */}
          {traces.map((tr, idx) => {
            const range = perTraceRange[idx];
            if (!range || tr.points.length === 0) return null;
            const toY = makeYMapper(range.lo, range.hi);
            const segments: string[] = [];
            let started = false;
            for (const p of tr.points) {
              const y = toY(p.v);
              if (!Number.isFinite(y)) { started = false; continue; }
              segments.push(`${started ? "L" : "M"}${toX(p.t).toFixed(1)},${y.toFixed(1)}`);
              started = true;
            }
            return segments.length === 0 ? null : (
              <path key={tr.pv} d={segments.join(" ")} fill="none"
                stroke={tr.color} strokeWidth={1.6} strokeLinejoin="round"/>
            );
          })}

          {/* Empty state */}
          {enabledPvs.length === 0 && (
            <text x={chartW / 2} y={chartH / 2} fill={UI.textDim} fontSize={12}
              textAnchor="middle">Check a PV in the sidebar to start monitoring</text>
          )}

          {/* Legend */}
          {traces.length > 0 && (
            <g>
              {traces.map((tr, i) => {
                const x = CHART_PAD.l + 8 + i * 88;
                return (
                  <g key={`lg-${tr.pv}`}>
                    <line x1={x} y1={CHART_PAD.t - 6} x2={x + 14} y2={CHART_PAD.t - 6}
                      stroke={tr.color} strokeWidth={2}/>
                    <text x={x + 18} y={CHART_PAD.t - 2} fill={tr.color} fontSize={11}
                      textAnchor="start">{tr.label}</text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
