import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";
import { toDouble } from "../../lib/epics";
import { colors } from "../../lib/theme";

const C_BEAM   = "#7aabff";
const C_PHOTON = "#4caf50";
const C_BLOCK  = "#e8b62b";

function segColor(feOpen: boolean, valvesOpen: boolean): string {
  if (!valvesOpen) return C_BLOCK;
  return feOpen ? C_PHOTON : C_BEAM;
}

export function BLLayoutC() {
  // Mirror (shared with AB)
  const [,,,m3rr]      = useConnection("blc-m3r",   "ca://29id_m3r:TX_MON");

  // FE open (same condition as AB)
  const [,,,ss1r]      = useConnection("blc-ss1",   "ca://S29ID-FEEPS:SS1:OpenedM");
  const [,,,ps2r]      = useConnection("blc-ps2",   "ca://S29ID-FEEPS:PS2:OpenedM");

  // C-section gate valves between B and C branches
  const [,,,gv06r]     = useConnection("blc-gv06",  "ca://29id:BLEPS:GV06:OPENED:STS");
  const [,,,gv08r]     = useConnection("blc-gv08",  "ca://29id:BLEPS:GV08:OPENED:STS");
  const [,,,gv09r]     = useConnection("blc-gv09",  "ca://29id:BLEPS:GV09:OPENED:STS");

  // GV10 gate valve (into ARPES)
  const [,,,gv10or]    = useConnection("blc-gv10o", "ca://29id:BLEPS:GV10:OPENED:STS");
  const [,,,gv10cr]    = useConnection("blc-gv10c", "ca://29id:BLEPS:GV10:CLOSED:STS");

  // C-Shutter status (0=open, 1=closed)
  const [,,,csr]       = useConnection("blc-cs",    "ca://S29ID-PSS:SCS:BLEPS_Status:CM");

  // C shutter permit
  const [,,,cpmtr]     = useConnection("blc-cpmt",  "ca://29id:BLEPS:STA_C:PMT");

  // VAC11 trip alarm
  const [,,,vac11r]    = useConnection("blc-vac11", "ca://29id:BLEPS:VAC11:TRIP");

  // VS10C vacuum gauge
  const [, vs10cConn,, vs10cr] = useConnection("blc-vs10c", "ca://29idb:VS10C.VAL");

  // ARPES chamber gauges
  const [, vs11cConn,, vs11cr] = useConnection("blc-vs11c", "ca://29idc:VS11C.VAL");
  const [, ip11cConn,, ip11cr] = useConnection("blc-ip11c", "ca://29idc:IP11C1.VAL");

  // Derived values
  const m3rVal    = toDouble(m3rr);
  const m3rDefl   = m3rVal !== null && m3rVal < 5;  // TX_MON < 5 → mirror deflecting into C
  const feOpen    = toDouble(ss1r) === 1 && toDouble(ps2r) === 1;
  const cGvsOpen  = toDouble(gv06r) === 1 && toDouble(gv08r) === 1 && toDouble(gv09r) === 1;
  const gv10Open  = toDouble(gv10or) === 1;
  const gv10Closed = toDouble(gv10cr) === 1;
  const csOpen    = toDouble(csr) === 0;
  const csLabel   = csOpen ? "OPEN" : "CLOSED";
  const csColor   = csOpen ? colors.statusOk : colors.statusError;
  const cPermit   = (toDouble(cpmtr) ?? 0) !== 0;
  const vac11Trip  = (toDouble(vac11r) ?? 0) !== 0;
  const vac11Color = vac11Trip ? colors.statusError : colors.statusOk;
  const vs10cVal   = toDouble(vs10cr);
  const vs10cStr   = vs10cConn && vs10cVal !== null ? vs10cVal.toExponential(2) : "—";
  const vs11cVal   = toDouble(vs11cr);
  const vs11cStr   = vs11cConn && vs11cVal !== null ? vs11cVal.toExponential(2) : "—";
  const ip11cVal   = toDouble(ip11cr);
  const ip11cStr   = ip11cConn && ip11cVal !== null ? ip11cVal.toExponential(2) : "—";

  // Beam segment colors (C gets beam only when mirror deflecting)
  // cRight: M3R connection → C-Shutter (controlled by GV06/08/09)
  const cRight  = !m3rDefl ? C_BEAM : segColor(feOpen, cGvsOpen);
  // cMid: C-Shutter → GV10 (controlled by C-Shutter + upstream valves)
  const cMid    = !m3rDefl ? C_BEAM : segColor(feOpen, csOpen && cGvsOpen);
  // cLeft: GV10 → ARPES (controlled by GV10 + C-Shutter + upstream valves)
  const cLeft   = !m3rDefl ? C_BEAM : segColor(feOpen, gv10Open && csOpen && cGvsOpen);

  // ── SVG geometry ─────────────────────────────────────────────────────────
  const W     = 260;
  const H     = 95;
  const by    = 30;
  const bh    = 5;

  const arpX  = 28;   // ARPES circle center X
  const arpR  = 18;   // ARPES circle radius
  const gv10X = 82;   // GV10 symbol center X
  const gvHW  = 8;    // GV10 triangle half-width
  const gvTH  = 13;   // GV10 triangle height
  const jawW  = 7;
  const csX   = 182;
  const s3cX  = Math.round((gv10X + gvHW + csX) / 2 - jawW / 2);  // centered between valve and shutter
  const csW   = Math.round(42 * 300 / 260); // 48 — matches Main Shutter in BLLayoutAB
  const csH   = Math.round(18 * 300 / 260); // 21
  const negMargin = H - by - Math.ceil(csH / 2) - 6;

  return (
    <div style={{ fontFamily: "sans-serif", fontSize: 10 }}>
      <svg width={W} height={H} style={{ display: "block" }}>

        {/* ── Beam segments (bottom layer) ── */}

        {/* ARPES exit → GV10 center (cLeft; valve renders on top) */}
        <rect x={arpX + arpR} y={by} width={gv10X - (arpX + arpR)} height={bh} fill={cLeft} />
        {/* GV10 center → C-Shutter (cMid; continuous through slit 3C jaws) */}
        <rect x={gv10X} y={by} width={csX - gv10X} height={bh} fill={cMid} />
        {/* C-Shutter → right edge (connects to AB) */}
        <rect x={csX + csW} y={by} width={W - (csX + csW)} height={bh} fill={cRight} />

        {/* ── ARPES Chamber ── */}
        <circle cx={arpX} cy={by + bh / 2} r={arpR}
          fill="rgb(170,170,255)" stroke="rgb(10,0,184)" strokeWidth={2} />
        <text x={arpX} y={by + bh / 2 + 1} textAnchor="middle"
          dominantBaseline="middle" fontSize={8} fontWeight="600" fill="#fff">
          ARPES
        </text>

        {/* ── VS11C + IP11C1 readbacks — below ARPES circle ── */}
        <text x={arpX} y={by + bh / 2 + arpR + 8} textAnchor="middle" fontSize={7} fill="#555">VS11C</text>
        <text x={arpX} y={by + bh / 2 + arpR + 17} textAnchor="middle"
          fontSize={8} fontFamily="monospace" fill={colors.statusOk}>{vs11cStr}</text>
        <text x={arpX} y={by + bh / 2 + arpR + 26} textAnchor="middle" fontSize={7} fill="#555">IP11C1</text>
        <text x={arpX} y={by + bh / 2 + arpR + 35} textAnchor="middle"
          fontSize={8} fontFamily="monospace" fill={colors.statusOk}>{ip11cStr}</text>

        {/* ── VAC11 trip indicator — above ARPES circle ── */}
        <rect x={arpX - 16} y={2} width={32} height={10}
          fill={vac11Color} stroke="#333" strokeWidth={1} rx={1} />
        <text x={arpX} y={7} textAnchor="middle" dominantBaseline="middle"
          fontSize={7} fontWeight="600" fill="#fff">
          VS11C
        </text>

        {/* ── GV10 Gate Valve (bowtie triangles) ── */}
        {/* Top triangle: tip points down to beam center */}
        <polygon
          points={`${gv10X - gvHW},${by - 2 - gvTH} ${gv10X + gvHW},${by - 2 - gvTH} ${gv10X},${by + bh / 2}`}
          fill={gv10Open ? colors.statusOk : gv10Closed ? colors.statusError : "#888"}
        />
        {/* Bottom triangle: tip points up to beam center */}
        <polygon
          points={`${gv10X - gvHW},${by + bh + 2 + gvTH} ${gv10X + gvHW},${by + bh + 2 + gvTH} ${gv10X},${by + bh / 2}`}
          fill={gv10Open ? colors.statusOk : gv10Closed ? colors.statusError : "#888"}
        />
        <text x={gv10X} y={by - 2 - gvTH - 2} textAnchor="middle" fontSize={8} fill="#333">V10C</text>
        {(gv10Open || gv10Closed) && (
          <text x={gv10X} y={by + bh / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={7} fontWeight="700" fill="#111">
            {gv10Open ? "OPEN" : "CLOSED"}
          </text>
        )}

        {/* ── Slit 3C ── */}
        <rect x={s3cX} y={by - 2 - gvTH} width={jawW} height={gvTH} fill="#333" />
        <rect x={s3cX} y={by + bh + 2}   width={jawW} height={gvTH} fill="#333" />
        <text x={s3cX + jawW / 2} y={by - 2 - gvTH - 2} textAnchor="middle" fontSize={8} fill="#333">3C</text>

        {/* ── VS10C vacuum readback — below Slit 3C ── */}
        <text x={s3cX + jawW / 2} y={by + bh + 2 + gvTH + 9} textAnchor="middle"
          fontSize={8} fill="#555">VS10C</text>
        <text x={s3cX + jawW / 2} y={by + bh + 2 + gvTH + 21} textAnchor="middle"
          fontSize={9} fontFamily="monospace" fill={colors.statusOk}>
          {vs10cStr}
        </text>

        {/* ── C-Shutter ── */}
        <rect x={csX} y={by + bh / 2 - csH / 2} width={csW} height={csH} fill={csColor} rx={1} />
        <text x={csX + csW / 2} y={by + bh / 2 - csH / 2 - 4} textAnchor="middle" fontSize={8} fill="#333">C-Shutter</text>
        <text x={csX + csW / 2} y={by + bh / 2 + 3} textAnchor="middle" fontSize={8} fontWeight="700" fill="#fff">
          {csLabel}
        </text>

      </svg>

      {/* ── Bottom HTML ── */}
      <div style={{ display: "flex", alignItems: "flex-start", marginTop: -negMargin }}>

        {/* Left: GV10 buttons + warning — centered under valve */}
        <div style={{ width: csX - 2, paddingTop: by + bh + 2 + gvTH - (H - negMargin) + 4, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          {/* Buttons alone — flex stretch makes OPEN match CLOSE width */}
          <div style={{ marginLeft: gv10X, transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV10:OPEN.VAL", 1)}
              style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", width: "100%" }}>
              OPEN
            </button>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV10:CLOSE.VAL", 1)}
              style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer" }}>
              CLOSE
            </button>
          </div>
          {/* Warning text — separately centered at valve X */}
          <span style={{ marginLeft: gv10X, transform: "translateX(-50%)", display: "inline-block", color: colors.statusError, fontSize: 9, whiteSpace: "nowrap" }}>
            Close shutter first
          </span>
        </div>

        {/* Right: CS OPEN / CS CLOSE buttons + permit alarm — under C-Shutter */}
        <div style={{ width: csW + 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <button
            onClick={() => pvwsWriter.write("S29ID-PSS:SCS:OpenEPICSC", 1)}
            style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
            CS OPEN
          </button>
          <button
            onClick={() => pvwsWriter.write("S29ID-PSS:SCS:CloseEPICSC", 1)}
            style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
            CS CLOSE
          </button>
          {!cPermit && (
            <span style={{ color: colors.statusError, fontSize: 9, whiteSpace: "nowrap" }}>
              NO CS Permit
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
