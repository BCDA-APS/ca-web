import { useState, useRef, useEffect } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble, toStr, pvCtx } from "../../../lib/epics";
import type { TraceConfig } from "../../../widgets/StripChart";

const ARPES_PRESSURE_TREND_PVS: TraceConfig[] = [
  { pv: "29idc:VS11C.VAL",  label: "Gauge", enabled: true },
  { pv: "29idc:IP11C1.VAL", label: "Pump",  enabled: true },
];
const ARPES_TEMP_TREND_PVS: TraceConfig[] = [
  { pv: "29idARPES:LS335:TC1:INA", label: "Sample",    enabled: true },
  { pv: "29idARPES:LS335:TC1:INB", label: "Cold fngr", enabled: true },
];
const ARPES_STRIP_TOOL_PVS: TraceConfig[] = [
  { pv: "29idc:ca1:read",                label: "CA1 (TEY)",    enabled: true },
  { pv: "29idc:ca2:read",                label: "CA2 (TFY)",    enabled: true },
  { pv: "29idb:ca15:read",               label: "CA15 (Diode)", enabled: true },
  { pv: "29idcScienta:Stats4:Total_RBV", label: "EA",           enabled: true },
];

function spawnPressureTrend() {
  window.dispatchEvent(new CustomEvent("open-stripchart", { detail: {
    label: "ARPES Pressure Trend", initialPvs: ARPES_PRESSURE_TREND_PVS, dedupe: true,
  }}));
}
function spawnTempTrend() {
  window.dispatchEvent(new CustomEvent("open-stripchart", { detail: {
    label: "ARPES Temperature Trend", initialPvs: ARPES_TEMP_TREND_PVS, dedupe: true,
  }}));
}
function fmtPressure(n: number | null): string {
  if (n === null) return "—";
  return n.toExponential(2);
}

function fmtTemp(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1);
}

function fmtPower(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1);
}

function fmtScaler(n: number | null): string {
  if (n === null) return "—";
  return n.toExponential(3);
}

function fmtCount(n: number | null): string {
  if (n === null) return "—";
  return Math.round(n).toString();
}

const SCAN_OPTS = ["passive","event","i/o intr","10 second","5 second","2 second","1 second",".5 second",".2 second",".1 second"];

function heaterColor(s: string | null): string {
  if (!s) return "#7a9ab8";
  const lo = s.toLowerCase();
  if (lo === "off")    return "#7a9ab8";
  if (lo === "low")    return "#66bb6a";
  if (lo === "medium") return "#ffa726";
  if (lo === "high")   return "#ef5350";
  return "#cce0ff";
}

export function ChamberDiagram() {
  // "More" popup menu state — small dropdown anchored on the More button.
  const [moreOpen, setMoreOpen] = useState(false);
  const [pressureMenuOpen, setPressureMenuOpen] = useState(false);
  useEffect(() => {
    if (!pressureMenuOpen) return;
    function close() { setPressureMenuOpen(false); }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [pressureMenuOpen]);
  useEffect(() => {
    if (!moreOpen) return;
    function close() { setMoreOpen(false); }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [moreOpen]);

  // Pressure
  const [, c1, , v1] = useConnection("cd-vs11c",  "ca://29idc:VS11C.VAL");
  const [, c2, , v2] = useConnection("cd-ip11c1", "ca://29idc:IP11C1.VAL");

  // Temperature (Lakeshore 335)
  const [, , , vINA]   = useConnection("cd-ina",   "ca://29idARPES:LS335:TC1:INA");
  const [, , , vINB]   = useConnection("cd-inb",   "ca://29idARPES:LS335:TC1:INB");
  const [, , , vSP]    = useConnection("cd-sp",    "ca://29idARPES:LS335:TC1:OUT1:SP");
  const [, , , vHTR]   = useConnection("cd-htr",   "ca://29idARPES:LS335:TC1:HTR1");
  const [, , , vRange] = useConnection("cd-range", "ca://29idARPES:LS335:TC1:HTR1:Range");
  const [, , , vScan]  = useConnection("cd-scan",  "ca://29idARPES:LS335:TC1:read.SCAN");

  // Detectors
  const [, , , vD15]    = useConnection("cd-d15",  "ca://29idb:ca15:read");
  const [, , , vD16]    = useConnection("cd-d16",  "ca://29idc:ca2:read");
  const [, , , vD14]    = useConnection("cd-d14",  "ca://29idc:ca1:read");
  const [, , , vD18]    = useConnection("cd-d18",  "ca://29idcScienta:Stats4:Total_RBV");
  const [, , , vD16s]   = useConnection("cd-d16s", "ca://29idc:ca2:read.SCAN");
  const [, , , vD14s]   = useConnection("cd-d14s", "ca://29idc:ca1:read.SCAN");

  const p1      = fmtPressure(c1 ? toDouble(v1) : null);
  const p2      = fmtPressure(c2 ? toDouble(v2) : null);
  const tempA   = fmtTemp(toDouble(vINA));
  const tempB   = fmtTemp(toDouble(vINB));
  const spVal   = toDouble(vSP);
  const power   = fmtPower(toDouble(vHTR));
  const htrRange = toStr(vRange) ?? "—";
  const scanStr  = toStr(vScan)  ?? "—";

  const d15     = fmtScaler(toDouble(vD15));
  const d16     = fmtScaler(toDouble(vD16));
  const d14     = fmtScaler(toDouble(vD14));
  const d18     = fmtCount(toDouble(vD18));
  const d16scan = toStr(vD16s) ?? "passive";
  const d14scan = toStr(vD14s) ?? "passive";

  // Setpoint editing
  const [editingSP, setEditingSP] = useState(false);
  const [spInput, setSpInput]     = useState("");
  const spRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingSP) spRef.current?.focus(); }, [editingSP]);

  function startSPEdit() {
    setSpInput(spVal !== null ? spVal.toFixed(1) : "");
    setEditingSP(true);
  }
  function commitSP() {
    const n = parseFloat(spInput);
    if (!isNaN(n)) pvwsWriter.write("29idARPES:LS335:TC1:OUT1:SP", n);
    setEditingSP(false); setSpInput("");
  }
  function cancelSP() { setEditingSP(false); setSpInput(""); }

  // Sample center
  const sx = 175, sy = 125;

  return (
    <div style={{ background: "rgb(222,222,227)", borderRadius: 6, padding: 10, display: "inline-flex", flexDirection: "column", gap: 8 }}>
      {/* ── Top row: drawing + right panels ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {/* ── SVG drawing only ── */}
        <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={290} height={265} viewBox="40 0 290 265" style={{ display: "block" }}>
          <defs>
            <marker id="cd-w" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0,0 8,3 0,6" fill="#1565c0" />
            </marker>
            <marker id="cd-r" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0,0 8,3 0,6" fill="#ef5350" />
            </marker>
            <marker id="cd-g" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0,0 8,3 0,6" fill="#66bb6a" />
            </marker>
            <marker id="cd-o" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0,0 8,3 0,6" fill="#ffa726" />
            </marker>
          </defs>

          {/* ── Title ── */}
          <text x={sx} y="20" textAnchor="middle" fill="#7c6fa0" fontSize="13"
            fontWeight="600" fontFamily="sans-serif" letterSpacing="1.5">
            TOP VIEW
          </text>

          {/* ── Chi rotation arc ── */}
          <text x="70" y="118" fill="#1565c0" fontSize="11" fontFamily="sans-serif">(−)</text>
          <path d="M 95,125 A 80,80 0 0 1 148,50"
            stroke="#1565c0" strokeWidth="1.5" fill="none" markerEnd="url(#cd-w)" />

          {/* ── Slit dashed line ── */}
          <line x1="50" y1={sy} x2="295" y2={sy}
            stroke="#444444" strokeWidth="1" strokeDasharray="7,5" opacity="0.6" />

          {/* ── Sample ── */}
          <rect x={sx - 11} y={sy - 7} width="22" height="14"
            fill="#b0b8c8" stroke="#8090a8" strokeWidth="0.5" />

          {/* ── z axis (out of page, ⊙) ── */}
          <circle cx={sx} cy={sy - 30} r="9" fill="none" stroke="rgb(10,37,159)" strokeWidth="1.5" />
          <circle cx={sx} cy={sy - 30} r="2.5" fill="rgb(10,37,159)" />
          <text x={sx - 14} y={sy - 26} fill="rgb(10,37,159)" fontSize="12"
            fontFamily="sans-serif" fontWeight="600" textAnchor="end">z</text>

          {/* ── (−)y axis — right, green ── */}
          <line x1={sx + 11} y1={sy} x2={sx + 78} y2={sy}
            stroke="#66bb6a" strokeWidth="2" markerEnd="url(#cd-g)" />
          <text x={sx + 36} y={sy - 8} fill="#66bb6a" fontSize="11"
            fontFamily="sans-serif" textAnchor="middle">(−)y</text>

          {/* ── x axis — down, red ── */}
          <line x1={sx} y1={sy + 7} x2={sx} y2={sy + 78}
            stroke="#ef5350" strokeWidth="2" markerEnd="url(#cd-r)" />
          <text x={sx - 9} y={sy + 40} fill="#ef5350" fontSize="12"
            fontFamily="sans-serif" fontWeight="600" textAnchor="end">x</text>

          {/* ── X-rays — orange, 55° from x-axis ── */}
          <line x1="303" y1="216" x2={sx + 16} y2={sy + 13}
            stroke="#ffa726" strokeWidth="2" markerEnd="url(#cd-o)" />
          <text x="298" y="231" fill="#ffa726" fontSize="11"
            fontFamily="sans-serif" textAnchor="end">x-rays</text>

          {/* ── LEED detector ── */}
          <rect x="262" y="104" width="52" height="42" rx="4"
            fill="#1b5e20" stroke="#66bb6a" strokeWidth="1.5" />
          <text x="288" y="129" textAnchor="middle" fill="#a5d6a7" fontSize="13"
            fontWeight="700" fontFamily="sans-serif">LEED</text>

          {/* ── "More" button + popup menu ── */}
          <g
            cursor="pointer"
            style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }}
            onMouseDown={e => { e.stopPropagation(); setMoreOpen(o => !o); }}
          >
            <rect x="40" y="240" width="42" height="20" rx="3"
              fill="rgb(210,220,240)" stroke="rgb(160,180,220)" />
            <text x="61" y="254" textAnchor="middle"
              fill="rgb(0,53,132)" fontSize="11" fontFamily="sans-serif"
              style={{ pointerEvents: "none" }}>
              More
            </text>
          </g>

          {/* ── EA — truncated cone + rectangle ── */}
          <polygon
            points={`${sx - 14},208 ${sx + 14},208 ${sx + 36},226 ${sx + 36},254 ${sx - 36},254 ${sx - 36},226`}
            fill="#0d3a7a" stroke="#64b5f6" strokeWidth="1.5" />
          <text x={sx} y="236" textAnchor="middle" fill="#e3f2fd" fontSize="13"
            fontWeight="700" fontFamily="sans-serif">EA</text>
          <text x={sx} y="248" textAnchor="middle" fill="#ffffff" fontSize="10"
            fontFamily="sans-serif">th = 0</text>
        </svg>
        {moreOpen && (
          <div onMouseDown={e => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 262,
              left: 0,
              zIndex: 100,
              minWidth: 130,
              background: "#ffffff",
              border: "1px solid rgb(160,180,220)",
              borderRadius: 3,
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              fontFamily: "sans-serif", fontSize: 11,
              overflow: "hidden",
            }}>
            {[
              { label: "StripTool",      action: () => window.dispatchEvent(new CustomEvent("open-stripchart", { detail: {
                label: "ARPES StripTool", initialPvs: ARPES_STRIP_TOOL_PVS,
              }})) },
              { label: "ARPES ScanView", action: () => window.dispatchEvent(new CustomEvent("open-scanview", { detail: {
                label: "ARPES ScanView", recordPv: "29idARPES:scan1", defaultDetectors: [14, 15, 16, 18],
              }})) },
            ].map(item => (
              <button key={item.label}
                onClick={() => { setMoreOpen(false); item.action(); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "5px 10px", background: "transparent",
                  border: "none", color: "rgb(0,53,132)", cursor: "pointer",
                  fontSize: 11,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgb(225,235,250)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                {item.label}
              </button>
            ))}
          </div>
        )}
        </div>

        {/* ── Vertical divider ── */}
        <div style={{ width: 1, background: "#b0b0b8", alignSelf: "stretch", flexShrink: 0 }} />

        {/* ── Right HTML panels ── */}
        <div style={{ fontFamily: "sans-serif", fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }}>
          {/* chi / phi */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div><span style={{ color: "#333333", fontStyle: "italic" }}>chi:</span> <span style={{ color: "#666666" }}>flip along slit</span></div>
            <div><span style={{ color: "#333333", fontStyle: "italic" }}>phi:</span> <span style={{ color: "#666666" }}>azimuth about normal</span></div>
          </div>

          {/* Pressure */}
          <div style={{ borderTop: "1px solid #b0b0b8", paddingTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, position: "relative" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#7c6fa0", letterSpacing: "0.5px" }}>Pressure</span>
              <button
                onMouseDown={e => { e.stopPropagation(); setPressureMenuOpen(o => !o); }}
                style={{ width: 20, height: 20, padding: 0, background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 12, cursor: "pointer" }}>
                ⚙
              </button>
              {pressureMenuOpen && (
                <div onMouseDown={e => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    top: 22, right: 0,
                    zIndex: 100,
                    minWidth: 80,
                    background: "#ffffff",
                    border: "1px solid rgb(160,180,220)",
                    borderRadius: 3,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                    fontFamily: "sans-serif", fontSize: 11,
                    overflow: "hidden",
                  }}>
                  {[
                    { label: "Gauge", action: () => window.dispatchEvent(new CustomEvent("open-ui", { detail: {
                      file: "/ui/VacSen.ui",
                      macros: { P: "29idc:", GAUGE: "VS11C" },
                      label: "VacSen",
                    } })) },
                    { label: "Pump", action: () => window.dispatchEvent(new CustomEvent("open-ui", { detail: {
                      file: "/ui/vac/Pump.ui",
                      macros: { P: "29idc:", PUMP: "IP11C1" },
                      label: "Pump",
                    } })) },
                  ].map(item => (
                    <button key={item.label}
                      onClick={() => { setPressureMenuOpen(false); item.action(); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "5px 10px", background: "transparent",
                        border: "none", color: "rgb(0,53,132)", cursor: "pointer",
                        fontSize: 11,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgb(230,238,250)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >{item.label}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={spawnPressureTrend}
                  style={{ width: 58, padding: "2px 4px", background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
                  Gauge
                </button>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#4caf50", cursor: "context-menu", flex: 1, textAlign: "right" }}
                  onContextMenu={e => pvCtx("29idc:VS11C.VAL", v1, e)}>{p1}</span>
                <span style={{ color: "#444444", fontSize: 10 }}>T</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={spawnPressureTrend}
                  style={{ width: 58, padding: "2px 4px", background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
                  Pump
                </button>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#4caf50", cursor: "context-menu", flex: 1, textAlign: "right" }}
                  onContextMenu={e => pvCtx("29idc:IP11C1.VAL", v2, e)}>{p2}</span>
                <span style={{ color: "#444444", fontSize: 10 }}>T</span>
              </div>
            </div>
          </div>

          {/* Temperature */}
          <div style={{ borderTop: "1px solid #b0b0b8", paddingTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#7c6fa0", letterSpacing: "0.5px" }}>Temperature</span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/LakeShore335_more.ui", macros: { P: "29idARPES:", Q: "TC1" }, label: "Lakeshore" } }))}
                style={{ width: 20, height: 20, padding: 0, background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 12, cursor: "pointer" }}>
                ⚙
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Sample */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={spawnTempTrend}
                  style={{ width: 58, padding: "2px 4px", background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Sample
                </button>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", cursor: "context-menu", flex: 1, textAlign: "right" }}
                  onContextMenu={e => pvCtx("29idARPES:LS335:TC1:INA", vINA, e)}>{tempA}</span>
                <span style={{ color: "#444444", fontSize: 10 }}>K</span>
              </div>
              {/* Cold finger */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={spawnTempTrend}
                  style={{ width: 58, padding: "2px 4px", background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Cold fngr
                </button>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", cursor: "context-menu", flex: 1, textAlign: "right" }}
                  onContextMenu={e => pvCtx("29idARPES:LS335:TC1:INB", vINB, e)}>{tempB}</span>
                <span style={{ color: "#444444", fontSize: 10 }}>K</span>
              </div>
              {/* Setpoint */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#333333", minWidth: 52 }}>Setpoint</span>
                <span style={{ flex: 1 }} />
                {editingSP ? (
                  <input
                    ref={spRef}
                    aria-label="Temperature setpoint (K)"
                    style={{ width: 55, fontFamily: "monospace", fontSize: 12, padding: "2px 4px", background: "rgb(162,186,221)", color: "rgb(10,37,159)", border: "1px solid rgb(120,150,190)", borderRadius: 3, boxSizing: "border-box" }}
                    value={spInput}
                    onChange={e => setSpInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitSP(); if (e.key === "Escape") cancelSP(); }}
                    onBlur={cancelSP}
                  />
                ) : (
                  <span
                    onClick={startSPEdit}
                    style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", background: "rgb(162,186,221)", border: "1px solid rgb(120,150,190)", borderRadius: 3, padding: "2px 4px", minWidth: 55, display: "inline-block", textAlign: "right", cursor: "text", boxSizing: "border-box" }}>
                    {spVal !== null ? spVal.toFixed(1) : "—"}
                  </span>
                )}
                <span style={{ color: "#444444", fontSize: 10 }}>K</span>
              </div>
              {/* Power */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#333333", minWidth: 52 }}>Power</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", cursor: "context-menu", flex: 1, textAlign: "right" }}
                  onContextMenu={e => pvCtx("29idARPES:LS335:TC1:HTR1", vHTR, e)}>{power}</span>
                <span style={{ color: "#444444", fontSize: 10 }}>%</span>
              </div>
              {/* Heater */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#333333", minWidth: 52 }}>Heater</span>
                <span style={{ flex: 1 }} />
                <select
                  aria-label="Heater range"
                  value={["off","low","medium","high"].indexOf((htrRange ?? "").toLowerCase())}
                  onChange={e => pvwsWriter.write("29idARPES:LS335:TC1:HTR1:Range", parseInt(e.target.value))}
                  style={{ width: 80, background: "rgb(162,186,221)", color: heaterColor(htrRange), border: "1px solid rgb(120,150,190)", borderRadius: 3, fontSize: 11, padding: "1px 2px", cursor: "pointer" }}>
                  <option value={0}>Off</option>
                  <option value={1}>Low</option>
                  <option value={2}>Medium</option>
                  <option value={3}>High</option>
                </select>
              </div>
              {/* Scan */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#333333", minWidth: 52 }}>Scan</span>
                <span style={{ flex: 1 }} />
                <select
                  aria-label="Temperature scan rate"
                  value={SCAN_OPTS.indexOf((scanStr ?? "").toLowerCase())}
                  onChange={e => pvwsWriter.write("29idARPES:LS335:TC1:read.SCAN", parseInt(e.target.value))}
                  style={{ width: 80, background: "rgb(162,186,221)", color: "rgb(10,37,159)", border: "1px solid rgb(120,150,190)", borderRadius: 3, fontSize: 11, padding: "1px 2px", cursor: "pointer" }}>
                  {SCAN_OPTS.map((opt, i) => <option key={i} value={i}>{opt}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom detector section ── */}
      <div style={{ borderTop: "1px solid #b0b0b8", paddingTop: 6, display: "flex", gap: 9, fontFamily: "sans-serif", fontSize: 11 }}>
        {/* Left: D15 Diode + D18 EA */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {/* D15 Diode */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#333333", width: 75, flexShrink: 0 }}>Diode [D15]</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", width: 80, textAlign: "right", cursor: "context-menu", flexShrink: 0, marginLeft: -4 }}
              onContextMenu={e => pvCtx("29idb:ca15:read", vD15, e)}>{d15}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => pvwsWriter.write("29idARPES:userStringSeq7.PROC", 1)}
              style={{ width: 42, padding: "1px 2px", background: "#fff3e0", color: "#e65100", border: "1px solid #ffa726", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
              Live
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/Keithley6485.ui", macros: { P: "29idb:", CA: "ca15" }, label: "Keithley CA15" } }))}
              style={{ width: 18, height: 18, padding: 0, background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
              ⚙
            </button>
          </div>
          {/* D18 EA */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#333333", width: 75, flexShrink: 0 }}>EA [D18]</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", width: 80, textAlign: "right", cursor: "context-menu", flexShrink: 0, marginLeft: -4 }}
              onContextMenu={e => pvCtx("29idcScienta:Stats4:Total_RBV", vD18, e)}>{d18}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => pvwsWriter.write("29idcScienta:HV:ZeroSuppliesSeq.PROC", 1)}
              style={{ width: 42, padding: "1px 2px", background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
              HV off
            </button>
            <button onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/29idc_Scienta.ui", macros: { P: "29idcScienta:" }, label: "Scienta" } }))}
              style={{ width: 18, height: 18, padding: 0, background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
              ⚙
            </button>
          </div>
        </div>

        {/* Vertical divider */}
        <div style={{ width: 1, background: "#b0b0b8", alignSelf: "stretch", flexShrink: 0 }} />

        {/* Right: D16 TFY + D14 TEY */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {/* D16 TFY */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#333333", width: 75, flexShrink: 0 }}>TFY [D16]</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", width: 80, textAlign: "right", cursor: "context-menu", flexShrink: 0, marginLeft: -4 }}
              onContextMenu={e => pvCtx("29idc:ca2:read", vD16, e)}>{d16}</span>
            <select
              aria-label="D16 TFY scan rate"
              value={SCAN_OPTS.indexOf(d16scan.toLowerCase())}
              onChange={e => pvwsWriter.write("29idc:ca2:read.SCAN", parseInt(e.target.value))}
              style={{ width: 40, background: "rgb(162,186,221)", color: "rgb(10,37,159)", border: "1px solid rgb(120,150,190)", borderRadius: 3, fontSize: 11, padding: "1px 0", cursor: "pointer" }}>
              {SCAN_OPTS.map((opt, i) => <option key={i} value={i}>{opt}</option>)}
            </select>
            <button onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/Keithley6485.ui", macros: { P: "29idc:", CA: "ca2" }, label: "Keithley CA2" } }))}
              style={{ width: 18, height: 18, padding: 0, background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
              ⚙
            </button>
          </div>
          {/* D14 TEY */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#333333", width: 75, flexShrink: 0 }}>TEY [D14]</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgb(10,37,159)", width: 80, textAlign: "right", cursor: "context-menu", flexShrink: 0, marginLeft: -4 }}
              onContextMenu={e => pvCtx("29idc:ca1:read", vD14, e)}>{d14}</span>
            <select
              aria-label="D14 TEY scan rate"
              value={SCAN_OPTS.indexOf(d14scan.toLowerCase())}
              onChange={e => pvwsWriter.write("29idc:ca1:read.SCAN", parseInt(e.target.value))}
              style={{ width: 40, background: "rgb(162,186,221)", color: "rgb(10,37,159)", border: "1px solid rgb(120,150,190)", borderRadius: 3, fontSize: 11, padding: "1px 0", cursor: "pointer" }}>
              {SCAN_OPTS.map((opt, i) => <option key={i} value={i}>{opt}</option>)}
            </select>
            <button onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/Keithley6485.ui", macros: { P: "29idc:", CA: "ca1" }, label: "Keithley CA1" } }))}
              style={{ width: 18, height: 18, padding: 0, background: "rgb(210,220,240)", color: "rgb(0,53,132)", border: "1px solid rgb(160,180,220)", borderRadius: 3, fontSize: 11, cursor: "pointer" }}>
              ⚙
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
