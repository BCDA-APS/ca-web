import { useConnection } from "@diamondlightsource/cs-web-lib";

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

function fmtPressure(n: number | null): string {
  if (n === null) return "—";
  return n.toExponential(2);
}

export function ChamberDiagram() {
  const [, c1, , v1] = useConnection("cd-vs11c",  "ca://29idc:VS11C.VAL");
  const [, c2, , v2] = useConnection("cd-ip11c1", "ca://29idc:IP11C1.VAL");

  const p1 = fmtPressure(c1 ? toDouble(v1) : null);
  const p2 = fmtPressure(c2 ? toDouble(v2) : null);

  // Sample center
  const sx = 175, sy = 125;

  return (
    <div style={{ background: "#0e1a2e", borderRadius: 6, padding: 10, display: "inline-block" }}>
      <svg width={420} height={268} viewBox="40 0 420 268" style={{ display: "block" }}>
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

        {/* ── Chi rotation arc — top-left, (−) label clearly above ── */}
        <text x="70" y="118" fill="#90caf9" fontSize="11" fontFamily="sans-serif">(−)</text>
        <path d="M 95,125 A 80,80 0 0 1 148,50"
          stroke="#90caf9" strokeWidth="1.5" fill="none" markerEnd="url(#cd-w)" />

        {/* ── Slit dashed line (along y, through sample) ── */}
        <line x1="50" y1={sy} x2="295" y2={sy}
          stroke="#cce0ff" strokeWidth="1" strokeDasharray="7,5" opacity="0.4" />

        {/* ── Sample ── */}
        <rect x={sx - 11} y={sy - 7} width="22" height="14"
          fill="#b0b8c8" stroke="#8090a8" strokeWidth="0.5" />

        {/* ── z axis — OUT OF PAGE — shown as ⊙ symbol above sample ── */}
        {/* Outer circle */}
        <circle cx={sx} cy={sy - 30} r="9" fill="none" stroke="#cce0ff" strokeWidth="1.5" />
        {/* Inner dot */}
        <circle cx={sx} cy={sy - 30} r="2.5" fill="#cce0ff" />
        {/* z label — to the left, clear of the symbol */}
        <text x={sx - 14} y={sy - 26} fill="#cce0ff" fontSize="12"
          fontFamily="sans-serif" fontWeight="600" textAnchor="end">z</text>

        {/* ── (−)y axis — right, green — shortened to clear LEED ── */}
        <line x1={sx + 11} y1={sy} x2={sx + 78} y2={sy}
          stroke="#66bb6a" strokeWidth="2" markerEnd="url(#cd-g)" />
        {/* label above the arrow */}
        <text x={sx + 48} y={sy - 8} fill="#66bb6a" fontSize="11"
          fontFamily="sans-serif" textAnchor="middle">(−)y</text>

        {/* ── x axis — down, red ── */}
        <line x1={sx} y1={sy + 7} x2={sx} y2={sy + 78}
          stroke="#ef5350" strokeWidth="2" markerEnd="url(#cd-r)" />
        <text x={sx - 9} y={sy + 49} fill="#ef5350" fontSize="12"
          fontFamily="sans-serif" fontWeight="600" textAnchor="end">x</text>

        {/* ── X-rays — orange, from lower-RIGHT toward sample ── */}
        <line x1="310" y1="205" x2={sx + 16} y2={sy + 13}
          stroke="#ffa726" strokeWidth="2" markerEnd="url(#cd-o)" />
        <text x="305" y="220" fill="#ffa726" fontSize="11"
          fontFamily="sans-serif" textAnchor="end">x-rays</text>

        {/* ── LEED detector ── */}
        <rect x="262" y="104" width="52" height="42" rx="4"
          fill="#1b5e20" stroke="#66bb6a" strokeWidth="1.5" />
        <text x="288" y="129" textAnchor="middle" fill="#a5d6a7" fontSize="13"
          fontWeight="700" fontFamily="sans-serif">LEED</text>

        {/* ── EA — rectangle body + truncated cone (trapezoid) on top ── */}
        {/* trapezoid snout: narrow at top (±14), widens to body width (±36) */}
        <polygon
          points={`${sx - 14},208 ${sx + 14},208 ${sx + 36},226 ${sx + 36},254 ${sx - 36},254 ${sx - 36},226`}
          fill="#0d3a7a" stroke="#64b5f6" strokeWidth="1.5" />
        <text x={sx} y="236" textAnchor="middle" fill="#e3f2fd" fontSize="13"
          fontWeight="700" fontFamily="sans-serif">EA</text>
        <text x={sx} y="248" textAnchor="middle" fill="#90caf9" fontSize="10"
          fontFamily="sans-serif">th = 0</text>

        {/* ── Right panel divider ── */}
        <line x1="338" y1="30" x2="338" y2="258" stroke="#1e3a5c" strokeWidth="1" />

        {/* ── Axis descriptions ── */}
        <text x="347" y="52" fill="#90caf9" fontSize="11" fontFamily="sans-serif" fontStyle="italic">chi:</text>
        <text x="374" y="52" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">flip</text>
        <text x="347" y="68" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">along slit</text>

        <line x1="347" y1="80" x2="452" y2="80" stroke="#1e3a5c" strokeWidth="1" />

        <text x="347" y="97" fill="#90caf9" fontSize="11" fontFamily="sans-serif" fontStyle="italic">phi:</text>
        <text x="374" y="97" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">azimuth</text>
        <text x="347" y="113" fill="#cce0ff" fontSize="11" fontFamily="sans-serif">about normal</text>

        {/* ── Pressure section ── */}
        <line x1="338" y1="130" x2="458" y2="130" stroke="#1e3a5c" strokeWidth="1" />

        <text x="347" y="150" fill="#90caf9" fontSize="11" fontFamily="sans-serif"
          fontWeight="600" letterSpacing="0.5">Pressure</text>

        <g onClick={() => openStripChart("29idc:VS11C.VAL", "VS11C trend")} style={{ cursor: "pointer" }}>
          <rect x="344" y="161" width="48" height="15" rx="3"
            fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="368" y="171" textAnchor="middle" fill="#90caf9" fontSize="10"
            fontFamily="sans-serif">VS11C</text>
        </g>
        <text x="452" y="170" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{p1}</text>
        <text x="456" y="170" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">T</text>

        <g onClick={() => openStripChart("29idc:IP11C1.VAL", "IP11C1 trend")} style={{ cursor: "pointer" }}>
          <rect x="344" y="181" width="48" height="15" rx="3"
            fill="#0d2a4a" stroke="#2a5a9a" strokeWidth="1" />
          <text x="368" y="191" textAnchor="middle" fill="#90caf9" fontSize="10"
            fontFamily="sans-serif">IP11C1</text>
        </g>
        <text x="452" y="190" fill="#4caf50" fontSize="11" fontFamily="monospace"
          textAnchor="end">{p2}</text>
        <text x="456" y="190" fill="#7a9ab8" fontSize="9" fontFamily="sans-serif">T</text>
      </svg>
    </div>
  );
}
