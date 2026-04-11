import { useState, useRef, useEffect } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./pvwsWriter";

function openStripChart(pv: string, label: string) {
  window.dispatchEvent(new CustomEvent("open-ui", {
    detail: { file: "/ui/29id/29id_stripChart_trend.ui", macros: { Q: pv }, label }
  }));
}

function toDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number; stringValue?: string } }).value;
  if (val?.doubleValue !== undefined) return val.doubleValue;
  if (val?.stringValue !== undefined) { const n = parseFloat(val.stringValue); return isNaN(n) ? null : n; }
  return null;
}

function toStr(d: unknown): string | null {
  if (!d) return null;
  const val = (d as { value?: { stringValue?: string; doubleValue?: number } }).value;
  if (val?.stringValue !== undefined && val.stringValue !== "") return val.stringValue;
  if (val?.doubleValue !== undefined) return String(val.doubleValue);
  return null;
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

  const p1      = fmtPressure(c1 ? toDouble(v1) : null);
  const p2      = fmtPressure(c2 ? toDouble(v2) : null);
  const tempA   = fmtTemp(toDouble(vINA));
  const tempB   = fmtTemp(toDouble(vINB));
  const spVal   = toDouble(vSP);
  const power   = fmtPower(toDouble(vHTR));
  const htrRange = toStr(vRange) ?? "—";
  const scanStr  = toStr(vScan)  ?? "—";

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
    <div style={{ background: "#0e1a2e", borderRadius: 6, padding: 10, display: "inline-block" }}>
      <svg width={420} height={277} viewBox="40 0 420 277" style={{ display: "block" }}>
        <defs>
          <marker id="cd-w" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0,0 8,3 0,6" fill="#cce0ff" />
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
        <text x={sx} y="20" textAnchor="middle" fill="#e3f0ff" fontSize="13"
          fontWeight="600" fontFamily="sans-serif" letterSpacing="1.5">
          TOP VIEW
        </text>

        {/* ── Chi rotation arc ── */}
        <text x="70" y="118" fill="#90caf9" fontSize="11" fontFamily="sans-serif">(−)</text>
        <path d="M 95,125 A 80,80 0 0 1 148,50"
          stroke="#90caf9" strokeWidth="1.5" fill="none" markerEnd="url(#cd-w)" />

        {/* ── Slit dashed line ── */}
        <line x1="50" y1={sy} x2="295" y2={sy}
          stroke="#cce0ff" strokeWidth="1" strokeDasharray="7,5" opacity="0.4" />

        {/* ── Sample ── */}
        <rect x={sx - 11} y={sy - 7} width="22" height="14"
          fill="#b0b8c8" stroke="#8090a8" strokeWidth="0.5" />

        {/* ── z axis (out of page, ⊙) ── */}
        <circle cx={sx} cy={sy - 30} r="9" fill="none" stroke="#cce0ff" strokeWidth="1.5" />
        <circle cx={sx} cy={sy - 30} r="2.5" fill="#cce0ff" />
        <text x={sx - 14} y={sy - 26} fill="#cce0ff" fontSize="12"
          fontFamily="sans-serif" fontWeight="600" textAnchor="end">z</text>

        {/* ── (−)y axis — right, green ── */}
        <line x1={sx + 11} y1={sy} x2={sx + 78} y2={sy}
          stroke="#66bb6a" strokeWidth="2" markerEnd="url(#cd-g)" />
        <text x={sx + 48} y={sy - 8} fill="#66bb6a" fontSize="11"
          fontFamily="sans-serif" textAnchor="middle">(−)y</text>

        {/* ── x axis — down, red ── */}
        <line x1={sx} y1={sy + 7} x2={sx} y2={sy + 78}
          stroke="#ef5350" strokeWidth="2" markerEnd="url(#cd-r)" />
        <text x={sx - 9} y={sy + 49} fill="#ef5350" fontSize="12"
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

        {/* ── EA — truncated cone + rectangle ── */}
        <polygon
          points={`${sx - 14},208 ${sx + 14},208 ${sx + 36},226 ${sx + 36},254 ${sx - 36},254 ${sx - 36},226`}
          fill="#0d3a7a" stroke="#64b5f6" strokeWidth="1.5" />
        <text x={sx} y="236" textAnchor="middle" fill="#e3f2fd" fontSize="13"
          fontWeight="700" fontFamily="sans-serif">EA</text>
        <text x={sx} y="248" textAnchor="middle" fill="#90caf9" fontSize="10"
          fontFamily="sans-serif">th = 0</text>

        {/* ── Right panel divider ── */}
        <line x1="338" y1="0" x2="338" y2="272" stroke="#1e3a5c" strokeWidth="1" />

        {/* ── Chi / Phi ── */}
        <text x="347" y="14" fill="#90caf9" fontSize="11" fontFamily="sans-serif" fontStyle="italic">chi:</text>
        <text x="374" y="14" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">flip along slit</text>

        <line x1="347" y1="26" x2="452" y2="26" stroke="#1e3a5c" strokeWidth="1" />

        <text x="347" y="41" fill="#90caf9" fontSize="11" fontFamily="sans-serif" fontStyle="italic">phi:</text>
        <text x="374" y="41" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">azimuth</text>
        <text x="347" y="56" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">about normal</text>

        {/* ── Pressure ── */}
        <line x1="338" y1="70" x2="458" y2="70" stroke="#1e3a5c" strokeWidth="1" />
        <text x="347" y="84" fill="#90caf9" fontSize="11" fontFamily="sans-serif"
          fontWeight="600" letterSpacing="0.5">Pressure</text>

        <g onClick={() => openStripChart("29idc:VS11C.VAL", "VS11C trend")} style={{ cursor: "pointer" }}>
          <rect x="344" y="92" width="48" height="15" rx="3"
            fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="368" y="102" textAnchor="middle" fill="#90caf9" fontSize="10"
            fontFamily="sans-serif">Gauge</text>
        </g>
        <text x="452" y="102" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{p1}</text>
        <text x="456" y="102" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">T</text>

        <g onClick={() => openStripChart("29idc:IP11C1.VAL", "IP11C1 trend")} style={{ cursor: "pointer" }}>
          <rect x="344" y="110" width="48" height="15" rx="3"
            fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="368" y="120" textAnchor="middle" fill="#90caf9" fontSize="10"
            fontFamily="sans-serif">Pump</text>
        </g>
        <text x="452" y="120" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{p2}</text>
        <text x="456" y="120" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">T</text>

        {/* ── Temperature ── */}
        <line x1="338" y1="138" x2="458" y2="138" stroke="#1e3a5c" strokeWidth="1" />
        <text x="347" y="152" fill="#90caf9" fontSize="11" fontFamily="sans-serif"
          fontWeight="600" letterSpacing="0.5">Temperature</text>

        {/* LS335 settings button */}
        <g style={{ cursor: "pointer" }} onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
          detail: { file: "/ui/LakeShore335_more.ui",
            macros: { P: "29idARPES:", Q: "TC1" },
            label: "Lakeshore" }
        }))}>
          <rect x="444" y="141" width="14" height="14" rx="2" fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="451" y="151" textAnchor="middle" fill="#90caf9" fontSize="10" fontFamily="sans-serif">⚙</text>
        </g>

        <g style={{ cursor: "pointer" }} onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
          detail: { file: "/ui/29id/29id_stripChart_trend.ui",
            macros: { Q: "29idARPES:LS335:TC1:INA", R: "29idARPES:LS335:TC1:INB" },
            label: "T chart", singleton: true }
        }))}>
          <rect x="344" y="160" width="48" height="14" rx="3" fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="368" y="170" textAnchor="middle" fill="#90caf9" fontSize="10" fontFamily="sans-serif">Sample</text>
        </g>
        <text x="449" y="170" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{tempA}</text>
        <text x="456" y="170" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">K</text>

        <g style={{ cursor: "pointer" }} onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
          detail: { file: "/ui/29id/29id_stripChart_trend.ui",
            macros: { Q: "29idARPES:LS335:TC1:INA", R: "29idARPES:LS335:TC1:INB" },
            label: "T chart", singleton: true }
        }))}>
          <rect x="344" y="178" width="48" height="14" rx="3" fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="368" y="188" textAnchor="middle" fill="#90caf9" fontSize="10" fontFamily="sans-serif">Cold fngr</text>
        </g>
        <text x="449" y="188" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{tempB}</text>
        <text x="456" y="188" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">K</text>

        {/* Setpoint */}
        <text x="347" y="206" fill="#5c9ecf" fontSize="10" fontFamily="sans-serif">Setpoint</text>
        {editingSP ? (
          <foreignObject x="396" y="196" width="55" height="16">
            <input
              ref={spRef}
              style={{
                width: "100%", height: "100%", boxSizing: "border-box",
                background: "#1a3a4a", border: "1px solid #4a90d9",
                color: "#fff", fontFamily: "monospace", fontSize: 11,
                padding: "1px 3px", borderRadius: 2,
              }}
              value={spInput}
              onChange={e => setSpInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter")  commitSP();
                if (e.key === "Escape") cancelSP();
              }}
              onBlur={cancelSP}
            />
          </foreignObject>
        ) : (
          <g onClick={startSPEdit} style={{ cursor: "text" }}>
            <text x="449" y="206" fill="#fff" fontSize="11" fontFamily="monospace"
              textAnchor="end">{spVal !== null ? spVal.toFixed(1) : "—"}</text>
          </g>
        )}
        <text x="456" y="206" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">K</text>

        {/* Power */}
        <text x="347" y="222" fill="#5c9ecf" fontSize="10" fontFamily="sans-serif">Power</text>
        <text x="449" y="222" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{power}</text>
        <text x="456" y="222" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">%</text>

        {/* Heater range — dropdown */}
        <text x="347" y="238" fill="#5c9ecf" fontSize="10" fontFamily="sans-serif">Heater</text>
        <foreignObject x="390" y="228" width="68" height="17">
          <select
            value={["off","low","medium","high"].indexOf((htrRange ?? "").toLowerCase())}
            onChange={e => pvwsWriter.write("29idARPES:LS335:TC1:HTR1:Range", parseInt(e.target.value))}
            style={{
              width: "100%", height: "100%", boxSizing: "border-box",
              background: "#0d2a4a", color: heaterColor(htrRange),
              border: "1px solid #2a5a9a", borderRadius: 2,
              fontSize: 11, fontFamily: "sans-serif", cursor: "pointer",
              padding: "0 2px",
            }}
          >
            <option value={0}>Off</option>
            <option value={1}>Low</option>
            <option value={2}>Medium</option>
            <option value={3}>High</option>
          </select>
        </foreignObject>

        {/* Scan rate — dropdown */}
        <text x="347" y="254" fill="#5c9ecf" fontSize="10" fontFamily="sans-serif">Scan</text>
        <foreignObject x="390" y="244" width="68" height="17">
          <select
            value={["passive","event","i/o intr","10 second","5 second","2 second","1 second",".5 second",".2 second",".1 second"].indexOf((scanStr ?? "").toLowerCase())}
            onChange={e => pvwsWriter.write("29idARPES:LS335:TC1:read.SCAN", parseInt(e.target.value))}
            style={{
              width: "100%", height: "100%", boxSizing: "border-box",
              background: "#0d2a4a", color: "#cce0ff",
              border: "1px solid #2a5a9a", borderRadius: 2,
              fontSize: 11, fontFamily: "sans-serif", cursor: "pointer",
              padding: "0 2px",
            }}
          >
            <option value={0}>Passive</option>
            <option value={1}>Event</option>
            <option value={2}>I/O Intr</option>
            <option value={3}>10 second</option>
            <option value={4}>5 second</option>
            <option value={5}>2 second</option>
            <option value={6}>1 second</option>
            <option value={7}>.5 second</option>
            <option value={8}>.2 second</option>
            <option value={9}>.1 second</option>
          </select>
        </foreignObject>
      </svg>
    </div>
  );
}
