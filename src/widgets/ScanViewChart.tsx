import { useState, useEffect, useRef, useMemo, useCallback, useContext } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble } from "../lib/epics";
import { layoutGet, layoutSet } from "../lib/layoutStorage";
import { PanelSizeContext } from "../lib/deployment";

// sscan record fields are zero-padded to two digits (.D01 through .D70).
function dd(det: number): string {
  return det.toString().padStart(2, "0");
}

// One per enabled detector. The sscan record's .D{NN}CV field is a SCALAR
// "current value" (not an array) — it holds whatever the detector measured
// at the most recent scan point. We accumulate points locally each time
// the CPT counter advances. .D{NN}PV is a string with the underlying
// detector PV name (label only).
//
// widgetId scoping: two ScanViewChart instances watching the same
// record+detector must register under different useConnection ids,
// otherwise unmounting one tears down the shared subscription and the
// surviving instance stops receiving updates.
function DetectorScalarSubscriber({ widgetId, recordPv, det, onValue, onLabel }: {
  widgetId: string;
  recordPv: string;
  det: number;
  onValue: (det: number, v: number) => void;
  onLabel: (det: number, label: string | null) => void;
}) {
  const [, , , rawCV] = useConnection(`scanview-${widgetId}-${recordPv}-d${dd(det)}cv`, `ca://${recordPv}.D${dd(det)}CV`);
  const [, , , rawPV] = useConnection(`scanview-${widgetId}-${recordPv}-d${dd(det)}pv`, `ca://${recordPv}.D${dd(det)}PV`);
  useEffect(() => {
    const v = toDouble(rawCV);
    if (v !== null && Number.isFinite(v)) onValue(det, v);
  }, [rawCV, det, onValue]);
  useEffect(() => { onLabel(det, toStringValue(rawPV)); }, [rawPV, det, onLabel]);
  return null;
}

interface Props {
  id: string;
  recordPv: string;                  // e.g. "29idARPES:scan1"
  defaultDetectors?: number[];       // pre-checked on first open
  width?: number;
  height?: number;
}

type YMode = "auto" | "norm" | "manual";

interface Persisted {
  enabled?: number[];
  extras?: number[];         // user-added detectors (removable via X)
  colors?: Record<number, string>;
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

const CHART_PAD = { l: 70, r: 12, t: 18, b: 28 };
const N_YTICKS = 4;
const N_XTICKS = 6;

const UI = {
  bg:        "#0f2035",
  border:    "#1a3a5c",
  axis:      "#90caf9",
  grid:      "#1a3a5c",
  text:      "#90caf9",
  textDim:   "#5c7a99",
  inputBg:   "#1a3550",
  inputText: "#cfe7ff",
};

function loadState(id: string): Persisted | null {
  return layoutGet<Persisted>(`scanviewchart:${id}`) ?? null;
}

function fmtValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 0.01) return v.toExponential(2);
  return v.toPrecision(4);
}

function toStringValue(raw: unknown): string | null {
  return (raw as { value?: { stringValue?: string } } | undefined)?.value?.stringValue ?? null;
}

const MAX_BUFFER = 5000;  // safety cap per detector

export function ScanViewChart({
  id,
  recordPv,
  defaultDetectors = [],
  width = 700,
  height = 400,
}: Props) {
  const persisted = useRef(loadState(id)).current;

  const [enabled, setEnabled] = useState<Set<number>>(() =>
    new Set(persisted?.enabled ?? defaultDetectors)
  );
  const [extras, setExtras] = useState<number[]>(() => persisted?.extras ?? []);
  const [colorsMap, setColorsMap] = useState<Record<number, string>>(() => persisted?.colors ?? {});
  const [yMode, setYMode]       = useState<YMode>(() => persisted?.yMode ?? "auto");
  const [logY, setLogY]         = useState<boolean>(() => persisted?.logY ?? false);
  const [yMin, setYMin]         = useState<number | null>(() => persisted?.yMin ?? null);
  const [yMax, setYMax]         = useState<number | null>(() => persisted?.yMax ?? null);
  const [yMinText, setYMinText] = useState<string>(() => persisted?.yMin == null ? "" : String(persisted.yMin));
  const [yMaxText, setYMaxText] = useState<string>(() => persisted?.yMax == null ? "" : String(persisted.yMax));
  const [addInput, setAddInput] = useState("");

  function commitNum(text: string, set: (n: number | null) => void) {
    if (text === "") { set(null); return; }
    const n = Number(text);
    if (Number.isFinite(n)) set(n);
  }

  // Persist on every state change.
  useEffect(() => {
    layoutSet(`scanviewchart:${id}`, {
      enabled: [...enabled].sort((a, b) => a - b),
      extras,
      colors: colorsMap,
      yMode, logY, yMin, yMax,
    } satisfies Persisted);
  }, [id, enabled, extras, colorsMap, yMode, logY, yMin, yMax]);

  // Assign palette colors to enabled detectors that don't have one yet.
  useEffect(() => {
    setColorsMap(prev => {
      let next = prev;
      for (const det of enabled) {
        if (!next[det]) {
          const used = new Set(Object.values(next));
          const free = PALETTE.find(c => !used.has(c)) ?? PALETTE[Object.keys(next).length % PALETTE.length];
          next = { ...next, [det]: free };
        }
      }
      return next === prev ? prev : next;
    });
  }, [enabled]);

  // Sidebar = preloaded (defaultDetectors, not removable) + user-added extras.
  // Sorted by detector number for stable ordering.
  const sidebar = useMemo(() => {
    const all = new Map<number, { det: number; removable: boolean }>();
    for (const d of defaultDetectors) all.set(d, { det: d, removable: false });
    for (const d of extras)            if (!all.has(d)) all.set(d, { det: d, removable: true });
    return [...all.values()].sort((a, b) => a.det - b.det);
  }, [defaultDetectors, extras]);

  // Always-on record-level subscriptions. Scoped by widget id so multiple
  // ScanView instances on the same record don't share subscription keys
  // (see DetectorScalarSubscriber comment).
  const [, , , rawCPT]  = useConnection(`scanview-${id}-${recordPv}-cpt`,  `ca://${recordPv}.CPT`);
  const [, , , rawNPTS] = useConnection(`scanview-${id}-${recordPv}-npts`, `ca://${recordPv}.NPTS`);
  const [, , , rawDATA] = useConnection(`scanview-${id}-${recordPv}-data`, `ca://${recordPv}.DATA`);
  const [, , , rawP1PV] = useConnection(`scanview-${id}-${recordPv}-p1pv`, `ca://${recordPv}.P1PV`);
  const [, , , rawR1CV] = useConnection(`scanview-${id}-${recordPv}-r1cv`, `ca://${recordPv}.R1CV`);

  const cpt   = toDouble(rawCPT) ?? 0;
  const npts  = toDouble(rawNPTS) ?? 0;
  const data  = toDouble(rawDATA) ?? 1;
  const p1pv  = toStringValue(rawP1PV) ?? "";
  const r1cv  = toDouble(rawR1CV);  // SCALAR — latest positioner readback

  // Detector labels (string) per detector — from .D{NN}PV
  const yLabels = useRef<Map<number, string | null>>(new Map());
  // Latest scalar value per detector — from .D{NN}CV
  const latestY = useRef<Map<number, number>>(new Map());
  // Accumulated buffer per detector: appends on every CPT advance.
  const detBuffers = useRef<Map<number, Array<{ x: number; y: number }>>>(new Map());
  // Last seen CPT so we only append once per new point.
  const lastCpt = useRef<number>(-1);
  // Last seen .DATA so we can detect the 1 → 0 transition for erase.
  const lastData = useRef<number>(1);
  const [, tick] = useState(0);

  const recordValue = useCallback((det: number, v: number) => {
    latestY.current.set(det, v);
  }, []);
  const recordLabel = useCallback((det: number, label: string | null) => {
    yLabels.current.set(det, label);
    tick(n => n + 1);
  }, []);

  // Toggle / add / remove.
  function toggle(det: number) {
    setEnabled(prev => {
      const n = new Set(prev);
      if (n.has(det)) n.delete(det);
      else n.add(det);
      return n;
    });
  }

  // Remove from sidebar entirely. Only used for `extras`; preloaded detectors
  // (from defaultDetectors) don't show the X button so they can't be removed.
  function removeDet(det: number) {
    setExtras(prev => prev.filter(d => d !== det));
    setEnabled(prev => { const n = new Set(prev); n.delete(det); return n; });
    detBuffers.current.delete(det);
    latestY.current.delete(det);
    yLabels.current.delete(det);
    setColorsMap(prev => {
      if (!(det in prev)) return prev;
      const { [det]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
  }

  function addDet() {
    const n = parseInt(addInput.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 70) { setAddInput(""); return; }
    if (sidebar.some(s => s.det === n)) { setAddInput(""); return; }
    setExtras(prev => [...prev, n]);
    setEnabled(prev => new Set(prev).add(n));
    setAddInput("");
  }

  // Layout dimensions.
  const CTRL_H = 30;
  const FOOTER_H = 18;
  const SIDEBAR_W = 140;
  const panelSize = useContext(PanelSizeContext);
  const totalW = panelSize?.w ?? width;
  const totalH = panelSize?.h ?? height;
  const chartW = Math.max(SIDEBAR_W + 100, totalW) - SIDEBAR_W;
  const chartH = Math.max(CTRL_H + FOOTER_H + 80, totalH) - CTRL_H - FOOTER_H;

  // ── Trace building ───────────────────────────────────────────────────────
  const enabledList = useMemo(() => [...enabled].sort((a, b) => a - b), [enabled]);

  const traces = enabledList.map(det => ({
    det,
    label: `D${dd(det)}`,
    color: colorsMap[det] ?? UI.text,
    pvName: yLabels.current.get(det) ?? "",
  }));

  // If the scan has no positioner (time scans), P1PV is empty and R1CV
  // is meaningless. Fall back to point index (1..N) for the X axis.
  const usePointIndex = !p1pv.trim();

  // Erase + accumulate. The sscan record exposes scalars (.D{NN}CV is the
  // current value, .R1CV is the current readback), not arrays. So we
  // accumulate (x, y) points locally: each time CPT advances we snapshot
  // the latest scalar from every enabled detector.
  //
  // Erase is triggered by the 1 → 0 transition on .DATA (matching the
  // scanDet.ui "ifzero" mode). We can't just check `data === 0` because
  // some records (e.g. continuous time scans) keep .DATA at 0 between
  // bursts; that would wipe the buffer on every render.
  // Also erase on a cpt decrease as a safety net (clear restart signal).
  useEffect(() => {
    const prevData = lastData.current;
    lastData.current = data;
    const erase =
      (prevData !== 0 && data === 0) ||  // 1 → 0 transition on DATA
      (lastCpt.current >= 0 && cpt < lastCpt.current);  // CPT went backwards
    if (erase) {
      detBuffers.current = new Map();
      lastCpt.current = -1;
      tick(n => n + 1);
      return;
    }
    if (cpt > 0 && cpt !== lastCpt.current) {
      const xVal = usePointIndex ? cpt : (r1cv ?? 0);
      for (const det of enabled) {
        const yVal = latestY.current.get(det);
        if (yVal == null || !Number.isFinite(yVal)) continue;
        const buf = detBuffers.current.get(det) ?? [];
        buf.push({ x: xVal, y: yVal });
        if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
        detBuffers.current.set(det, buf);
      }
      lastCpt.current = cpt;
      tick(n => n + 1);
    }
  }, [cpt, data, r1cv, enabled, usePointIndex]);

  // Render directly from the accumulated buffers (one per detector).
  const visiblePoints = traces.map(tr => detBuffers.current.get(tr.det) ?? []);

  // Per-trace [min,max] for Norm + Auto.
  const perTraceRange = visiblePoints.map(pts => {
    const vs = pts.map(p => p.y).filter(v => Number.isFinite(v) && (!logY || v > 0));
    if (vs.length === 0) return null;
    return { lo: Math.min(...vs), hi: Math.max(...vs) };
  });

  let autoLo = 0, autoHi = 1;
  const allRanges = perTraceRange.filter((r): r is {lo:number;hi:number} => r !== null);
  if (allRanges.length > 0) {
    autoLo = Math.min(...allRanges.map(r => r.lo));
    autoHi = Math.max(...allRanges.map(r => r.hi));
  }

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

  // X-axis range from collected x values, with 5% margin.
  let xLo = 0, xHi = 1;
  const xVisible = visiblePoints.flatMap(pts => pts.map(p => p.x));
  if (xVisible.length > 0) {
    xLo = Math.min(...xVisible);
    xHi = Math.max(...xVisible);
    if (xLo === xHi) { xLo -= 1; xHi += 1; }
    const xRange = xHi - xLo;
    xLo -= xRange * 0.05;
    xHi += xRange * 0.05;
  }

  const innerW = chartW - CHART_PAD.l - CHART_PAD.r;
  const innerH = chartH - CHART_PAD.t - CHART_PAD.b;
  const toX = (x: number) => CHART_PAD.l + ((x - xLo) / (xHi - xLo || 1)) * innerW;

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
    const f = i / N_XTICKS;
    const x = xLo + f * (xHi - xLo);
    return { x, px: toX(x) };
  });

  // ── Render ───────────────────────────────────────────────────────────────
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
      display: "flex", flexDirection: "column",
      width: totalW, height: totalH,
      overflow: "hidden",
      background: UI.bg, color: UI.text, fontFamily: "sans-serif",
      borderRadius: 4, boxSizing: "border-box",
    }}>
      {enabledList.map(det => (
        <DetectorScalarSubscriber key={det}
          widgetId={id} recordPv={recordPv} det={det}
          onValue={recordValue} onLabel={recordLabel} />
      ))}

      {/* Controls bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, height: CTRL_H,
        padding: "0 8px", borderBottom: `1px solid ${UI.border}`,
        fontSize: 11, flexShrink: 0,
      }}>
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
            <input type="text" inputMode="decimal" placeholder="min" value={yMinText} style={numInput}
              aria-label="Y axis minimum"
              onChange={e => { setYMinText(e.target.value); commitNum(e.target.value, setYMin); }} />
            <input type="text" inputMode="decimal" placeholder="max" value={yMaxText} style={numInput}
              aria-label="Y axis maximum"
              onChange={e => { setYMaxText(e.target.value); commitNum(e.target.value, setYMax); }} />
          </>
        )}
        <label style={{
          display: "flex", alignItems: "center", gap: 2,
          opacity: logDisabled ? 0.4 : 1,
          cursor: logDisabled ? "not-allowed" : "pointer",
        }} title={logDisabled ? "Log scale doesn't apply to normalized mode" : ""}>
          <input type="checkbox" checked={logY && !logDisabled} disabled={logDisabled}
            aria-label="Log Y"
            onChange={e => setLogY(e.target.checked)} />
          Log Y
        </label>
        <span style={{ color: UI.textDim, marginLeft: "auto", fontSize: 11, fontFamily: "monospace" }}>
          CPT: {cpt} / {npts}
        </span>
      </div>

      {/* Sidebar + chart + footer */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{
          width: SIDEBAR_W, borderRight: `1px solid ${UI.border}`,
          padding: 4, display: "flex", flexDirection: "column",
          fontSize: 11, overflow: "auto", flexShrink: 0,
        }}>
          {sidebar.map((entry, i) => {
            const det = entry.det;
            const checked = enabled.has(det);
            const swatch = checked ? (colorsMap[det] ?? UI.text) : null;
            const pvName = yLabels.current.get(det) ?? "";
            const showDivider = entry.removable && (i === 0 || !sidebar[i - 1].removable);
            return (
              <div key={det}>
                {showDivider && <div style={{ borderTop: `1px solid ${UI.border}`, margin: "3px 0" }}/>}
                <label style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "1px 0", cursor: "pointer",
                }} title={pvName ? `${recordPv}.D${dd(det)}CV → ${pvName}` : `${recordPv}.D${dd(det)}CV`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(det)}
                    aria-label={`Show D${dd(det)}`} />
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: swatch ?? "transparent",
                    border: swatch ? "none" : `1px solid ${UI.border}`,
                    flexShrink: 0,
                  }}/>
                  <span style={{
                    flex: 1, color: checked ? UI.inputText : UI.textDim,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    D{dd(det)}
                  </span>
                  {entry.removable && (
                    <button onClick={e => { e.preventDefault(); removeDet(det); }}
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
            <input value={addInput} placeholder="add D#"
              aria-label="Add detector by number"
              onChange={e => setAddInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addDet(); }}
              style={{
                flex: 1, minWidth: 0, background: UI.inputBg, color: UI.inputText,
                border: `1px solid ${UI.border}`, borderRadius: 2, fontSize: 11,
                padding: "1px 3px", fontFamily: "monospace",
              }} />
            <button onClick={addDet} style={{ ...ctrlBtn, padding: "0 6px" }}>+</button>
          </div>
        </div>

        {/* Chart + Footer column */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <svg width={chartW} height={chartH} style={{ background: UI.bg, display: "block" }}>
            {/* Grid */}
            {yTicks.map((t, i) => (
              <line key={`gy-${i}`} x1={CHART_PAD.l} y1={t.y} x2={chartW - CHART_PAD.r} y2={t.y}
                stroke={UI.grid} strokeWidth={1}/>
            ))}
            {xTicks.map((t, i) => (
              <line key={`gx-${i}`} x1={t.px} y1={CHART_PAD.t} x2={t.px} y2={chartH - CHART_PAD.b}
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
              <text key={`lx-${i}`} x={t.px} y={chartH - CHART_PAD.b + 14}
                fill={UI.text} fontSize={10} textAnchor="middle" fontFamily="monospace">
                {usePointIndex ? Math.round(t.x).toString() : fmtValue(t.x)}
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
              const pts = visiblePoints[idx];
              if (!range || pts.length === 0) return null;
              const toY = makeYMapper(range.lo, range.hi);
              const segments: string[] = [];
              let started = false;
              for (const p of pts) {
                const y = toY(p.y);
                if (!Number.isFinite(y)) { started = false; continue; }
                segments.push(`${started ? "L" : "M"}${toX(p.x).toFixed(1)},${y.toFixed(1)}`);
                started = true;
              }
              return segments.length === 0 ? null : (
                <path key={tr.det} d={segments.join(" ")} fill="none"
                  stroke={tr.color} strokeWidth={1.6} strokeLinejoin="round"/>
              );
            })}

            {/* Empty state */}
            {enabledList.length === 0 && (
              <text x={chartW / 2} y={chartH / 2} fill={UI.textDim} fontSize={12}
                textAnchor="middle">Add a detector number in the sidebar to start plotting</text>
            )}

            {/* Legend */}
            {traces.length > 0 && (
              <g>
                {(() => {
                  let cursor = CHART_PAD.l + 8;
                  return traces.map(tr => {
                    const x = cursor;
                    const label = tr.label;
                    cursor += 14 + 4 + Math.ceil(label.length * 6.6) + 14;
                    return (
                      <g key={`lg-${tr.det}`}>
                        <line x1={x} y1={CHART_PAD.t - 6} x2={x + 14} y2={CHART_PAD.t - 6}
                          stroke={tr.color} strokeWidth={2}/>
                        <text x={x + 18} y={CHART_PAD.t - 2} fill={tr.color} fontSize={11}
                          textAnchor="start">{label}</text>
                      </g>
                    );
                  });
                })()}
              </g>
            )}
          </svg>

          {/* Footer: positioner PV name (or note about index mode) */}
          <div style={{
            height: FOOTER_H, fontSize: 11, color: UI.textDim,
            padding: "0 8px", display: "flex", alignItems: "center", gap: 4,
            borderTop: `1px solid ${UI.border}`, flexShrink: 0,
            fontFamily: "monospace",
          }}>
            {usePointIndex ? (
              <span>X = point index (no positioner)</span>
            ) : (
              <>
                <span>Positioner:</span>
                <span style={{ color: UI.inputText }}>{p1pv}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
