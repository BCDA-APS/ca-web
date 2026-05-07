import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";
import { toDouble } from "../../lib/epics";
import { colors } from "../../lib/theme";

const C_BEAM   = "#7aabff";
const C_PHOTON = "#4caf50";
const C_BLOCK  = "#e8b62b";

export function BLLayoutE() {
  const [,,,m3rr]   = useConnection("ble-m3r",    "ca://29id_m3r:TX_MON");

  // D-Shutter blocking status (two redundant PSS channels)
  const [,,,paSdsr] = useConnection("ble-pa-sds", "ca://PA:29ID:SDS_BLOCKING_BEAM.VAL");
  const [,,,pbSdsr] = useConnection("ble-pb-sds", "ca://PB:29ID:SDS_BLOCKING_BEAM.VAL");

  // GV14 (V10D) — shared with D; controls cRight beam color in E
  const [,,,gv14r]  = useConnection("ble-gv14",   "ca://29id:BLEPS:GV14:OPENED:STS");

  // GV18 (V11D)
  const [,,,gv18or] = useConnection("ble-gv18o",  "ca://29id:BLEPS:GV18:OPENED:STS");
  const [,,,gv18cr] = useConnection("ble-gv18c",  "ca://29id:BLEPS:GV18:CLOSED:STS");

  // GV19 (V12D)
  const [,,,gv19or] = useConnection("ble-gv19o",  "ca://29id:BLEPS:GV19:OPENED:STS");
  const [,,,gv19cr] = useConnection("ble-gv19c",  "ca://29id:BLEPS:GV19:CLOSED:STS");

  // VS13D vacuum gauge
  const [, vs13dConn,, vs13dr] = useConnection("ble-vs13d", "ca://29ide:VS17D.VAL");

  const m3rVal      = toDouble(m3rr);
  const m3rDefl     = m3rVal !== null && m3rVal < 5;
  const sdsNotBlock = toDouble(paSdsr) === 0 || toDouble(pbSdsr) === 0;
  const gv14Open    = toDouble(gv14r) === 1;
  const gv18Open    = toDouble(gv18or) === 1;
  const gv18Closed  = toDouble(gv18cr) === 1;
  const gv19Open    = toDouble(gv19or) === 1;
  const gv19Closed  = toDouble(gv19cr) === 1;
  const vs13dVal    = toDouble(vs13dr);
  const vs13dStr    = vs13dConn && vs13dVal !== null ? vs13dVal.toExponential(2) : "—";

  // Beam segment colors (E gets beam when mirror deflects, same as D)
  const cLeft  = !m3rDefl ? C_BEAM : !gv19Open ? C_BLOCK : sdsNotBlock ? C_PHOTON : C_BEAM;
  const cMid   = !m3rDefl ? C_BEAM : !gv18Open ? C_BLOCK : sdsNotBlock ? C_PHOTON : C_BEAM;
  const cRight = !m3rDefl ? C_BEAM : !gv14Open ? C_BLOCK : sdsNotBlock ? C_PHOTON : C_BEAM;

  // ── SVG geometry ─────────────────────────────────────────────────────────
  const W     = 150;
  const H     = 95;
  const by    = 30;
  const bh    = 5;

  const octX  = 28;
  const octR  = 18;
  const gv19X = 80;
  const gv18X = 130;
  const gvHW  = 8;
  const gvTH  = 13;
  const negMargin = H - (by + bh + 2 + gvTH) - 4;  // pull buttons up to just below valves
  const midX  = Math.round((gv19X + gv18X) / 2);

  return (
    <div style={{ fontFamily: "sans-serif", fontSize: 10 }}>
      <svg width={W} height={H} style={{ display: "block" }}>

        {/* ── Beam segments (bottom layer) ── */}
        {/* Octupole exit → GV19 center */}
        <rect x={octX + octR} y={by} width={gv19X - (octX + octR)} height={bh} fill={cLeft} />
        {/* GV19 center → GV18 center */}
        <rect x={gv19X} y={by} width={gv18X - gv19X} height={bh} fill={cMid} />
        {/* GV18 center → right edge (connects to D's RSXS) */}
        <rect x={gv18X} y={by} width={W - gv18X} height={bh} fill={cRight} />

        {/* ── Octupole Chamber ── */}
        <circle cx={octX} cy={by + bh / 2} r={octR}
          fill="rgb(255,160,100)" stroke="rgb(180,80,0)" strokeWidth={2} />
        <text x={octX} y={by + bh / 2 + 1} textAnchor="middle"
          dominantBaseline="middle" fontSize={7} fontWeight="600" fill="#fff">
          Octupole
        </text>

        {/* ── VS13D readback — below Octupole circle ── */}
        <text x={octX} y={by + bh + 2 + gvTH + 9} textAnchor="middle" fontSize={8} fill="#555">VS13D</text>
        <text x={octX} y={by + bh + 2 + gvTH + 21} textAnchor="middle"
          fontSize={9} fontFamily="monospace" fill={colors.statusOk}>{vs13dStr}</text>

        {/* ── GV19 (V12D) Gate Valve ── */}
        <polygon
          points={`${gv19X - gvHW},${by - 2 - gvTH} ${gv19X + gvHW},${by - 2 - gvTH} ${gv19X},${by + bh / 2}`}
          fill={gv19Open ? colors.statusOk : gv19Closed ? colors.statusError : "#888"}
        />
        <polygon
          points={`${gv19X - gvHW},${by + bh + 2 + gvTH} ${gv19X + gvHW},${by + bh + 2 + gvTH} ${gv19X},${by + bh / 2}`}
          fill={gv19Open ? colors.statusOk : gv19Closed ? colors.statusError : "#888"}
        />
        <text x={gv19X} y={by - 2 - gvTH - 2} textAnchor="middle" fontSize={8} fill="#333">V12D</text>
        {(gv19Open || gv19Closed) && (
          <text x={gv19X} y={by + bh / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={7} fontWeight="700" fill="#111">
            {gv19Open ? "OPEN" : "CLOSED"}
          </text>
        )}

        {/* ── GV18 (V11D) Gate Valve ── */}
        <polygon
          points={`${gv18X - gvHW},${by - 2 - gvTH} ${gv18X + gvHW},${by - 2 - gvTH} ${gv18X},${by + bh / 2}`}
          fill={gv18Open ? colors.statusOk : gv18Closed ? colors.statusError : "#888"}
        />
        <polygon
          points={`${gv18X - gvHW},${by + bh + 2 + gvTH} ${gv18X + gvHW},${by + bh + 2 + gvTH} ${gv18X},${by + bh / 2}`}
          fill={gv18Open ? colors.statusOk : gv18Closed ? colors.statusError : "#888"}
        />
        <text x={gv18X} y={by - 2 - gvTH - 2} textAnchor="middle" fontSize={8} fill="#333">V11D</text>
        {(gv18Open || gv18Closed) && (
          <text x={gv18X} y={by + bh / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={7} fontWeight="700" fill="#111">
            {gv18Open ? "OPEN" : "CLOSED"}
          </text>
        )}

      </svg>

      {/* ── Bottom HTML ── */}
      <div style={{ display: "flex", alignItems: "flex-start", marginTop: -negMargin }}>

        {/* Left: GV19 (V12D) buttons — centered under valve */}
        <div style={{ width: midX, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <div style={{ marginLeft: gv19X, transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV19:OPEN.VAL", 1)}
              style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", width: "100%" }}>
              OPEN
            </button>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV19:CLOSE.VAL", 1)}
              style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer" }}>
              CLOSE
            </button>
          </div>
        </div>

        {/* Right: GV18 (V11D) buttons — centered under valve */}
        <div style={{ width: W - midX, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <div style={{ marginLeft: gv18X - midX, transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV18:OPEN.VAL", 1)}
              style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", width: "100%" }}>
              OPEN
            </button>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV18:CLOSE.VAL", 1)}
              style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer" }}>
              CLOSE
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
