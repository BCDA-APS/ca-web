import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";
import { toDouble } from "../../lib/epics";
import { colors } from "../../lib/theme";

const C_BEAM   = "#7aabff";
const C_PHOTON = "#4caf50";
const C_BLOCK  = "#e8b62b";

export function BLLayoutD() {
  // M3R mirror position (shared with AB/C)
  const [,,,m3rr]      = useConnection("bld-m3r",   "ca://29id_m3r:TX_MON");

  // FE shutters (shared with AB)
  const [,,,ss1r]      = useConnection("bld-ss1",   "ca://S29ID-FEEPS:SS1:OpenedM");
  const [,,,ps2r]      = useConnection("bld-ps2",   "ca://S29ID-FEEPS:PS2:OpenedM");

  // B-section gate valves (shared with AB/C)
  const [,,,gv05r]     = useConnection("bld-gv05",  "ca://29id:BLEPS:GV05:OPENED:STS");
  const [,,,gv15r]     = useConnection("bld-gv15",  "ca://29id:BLEPS:GV15:OPENED:STS");

  // D-section gate valves (between D-Shutter and V10D)
  const [,,,gv11r]     = useConnection("bld-gv11",  "ca://29id:BLEPS:GV11:OPENED:STS");
  const [,,,gv12r]     = useConnection("bld-gv12",  "ca://29id:BLEPS:GV12:OPENED:STS");
  const [,,,gv13r]     = useConnection("bld-gv13",  "ca://29id:BLEPS:GV13:OPENED:STS");

  // GV14 gate valve (into RSXS — equivalent to GV10 into ARPES in C branch)
  const [,,,gv14or]    = useConnection("bld-gv14o", "ca://29id:BLEPS:GV14:OPENED:STS");
  const [,,,gv14cr]    = useConnection("bld-gv14c", "ca://29id:BLEPS:GV14:CLOSED:STS");

  // D-Shutter status (0=open, 1=closed)
  const [,,,dsr]       = useConnection("bld-ds",    "ca://S29ID-PSS:SDS:BLEPS_Status:CM");

  // D-Shutter permit
  const [,,,dpmtr]     = useConnection("bld-dpmt",  "ca://29id:BLEPS:STA_D:PMT");

  // VAC15 trip alarm (RSXS chamber)
  const [,,,vac15r]    = useConnection("bld-vac15", "ca://29id:BLEPS:VAC15:TRIP");

  // Vacuum gauges
  const [, vs10dConn,, vs10dr] = useConnection("bld-vs10d", "ca://29idb:VS10D.VAL");
  const [, vs11dConn,, vs11dr] = useConnection("bld-vs11d", "ca://29idb:VS11D.VAL");

  const m3rVal    = toDouble(m3rr);
  const m3rDefl   = m3rVal !== null && m3rVal < 5; // D gets beam when M3R deflecting
  const feOpen    = toDouble(ss1r) === 1 && toDouble(ps2r) === 1;
  const bOpen     = toDouble(gv05r) === 1 && toDouble(gv15r) === 1;
  const dGvsOpen  = toDouble(gv11r) === 1 && toDouble(gv12r) === 1 && toDouble(gv13r) === 1;
  const gv14Open  = toDouble(gv14or) === 1;
  const gv14Closed = toDouble(gv14cr) === 1;
  const dsOpen    = toDouble(dsr) === 0;
  const dsLabel   = dsOpen ? "OPEN" : "CLOSED";
  const dsColor   = dsOpen ? colors.statusOk : colors.statusError;
  const dPermit   = (toDouble(dpmtr) ?? 0) !== 0;
  const vac15Trip = (toDouble(vac15r) ?? 0) !== 0;
  const vac15Color = vac15Trip ? colors.statusError : colors.statusOk;
  const vs10dVal  = toDouble(vs10dr);
  const vs10dStr  = vs10dConn && vs10dVal !== null ? vs10dVal.toExponential(2) : "—";
  const vs11dVal  = toDouble(vs11dr);
  const vs11dStr  = vs11dConn && vs11dVal !== null ? vs11dVal.toExponential(2) : "—";

  // Segment colors — D receives beam only when M3R is deflecting (inverse of C)
  const cRight = !m3rDefl ? C_BEAM : !bOpen     ? C_BLOCK : feOpen              ? C_PHOTON : C_BEAM;
  const cMid   = !m3rDefl ? C_BEAM : !dGvsOpen  ? C_BLOCK : feOpen && dsOpen    ? C_PHOTON : C_BEAM;
  const cLeft  = !gv14Open && m3rDefl ? C_BLOCK : feOpen && dsOpen && gv14Open && m3rDefl ? C_PHOTON : C_BEAM;

  // ── SVG geometry (identical to BLLayoutC) ────────────────────────────────
  const W     = 260;
  const H     = 95;
  const by    = 30;
  const bh    = 5;

  const rsxsX  = 28;
  const rsxsR  = 18;
  const gv14X  = 82;
  const gvHW   = 8;
  const gvTH   = 13;
  const jawW   = 7;
  const dsX    = 182;
  const dsW    = Math.round(42 * 300 / 260); // 48 — matches Main Shutter in BLLayoutAB
  const dsH    = Math.round(18 * 300 / 260); // 21
  const s3dX   = Math.round((gv14X + gvHW + dsX) / 2 - jawW / 2);
  const negMargin = H - by - Math.ceil(dsH / 2) - 6;

  return (
    <div style={{ fontFamily: "sans-serif", fontSize: 10 }}>
      <svg width={W} height={H} style={{ display: "block" }}>

        {/* ── Beam segments (bottom layer) ── */}

        {/* RSXS exit → GV14 center */}
        <rect x={rsxsX + rsxsR} y={by} width={gv14X - (rsxsX + rsxsR)} height={bh} fill={cLeft} />
        {/* GV14 center → D-Shutter */}
        <rect x={gv14X} y={by} width={dsX - gv14X} height={bh} fill={cMid} />
        {/* D-Shutter → right-angle corner */}
        <rect x={dsX + dsW} y={by} width={W - bh - (dsX + dsW)} height={bh} fill={cRight} />
        {/* Right-angle: vertical segment going down to bottom (connects to M3R below) */}
        <rect x={W - bh} y={by} width={bh} height={H - by} fill={cRight} />

        {/* ── RSXS Chamber ── */}
        <circle cx={rsxsX} cy={by + bh / 2} r={rsxsR}
          fill="#4caf50" stroke="rgb(10,100,10)" strokeWidth={2} />
        <text x={rsxsX} y={by + bh / 2 + 1} textAnchor="middle"
          dominantBaseline="middle" fontSize={8} fontWeight="600" fill="#fff">
          RSXS
        </text>

        {/* ── VS11D readback — below RSXS circle ── */}
        <text x={rsxsX} y={by + bh + 2 + gvTH + 9} textAnchor="middle" fontSize={8} fill="#555">VS11D</text>
        <text x={rsxsX} y={by + bh + 2 + gvTH + 21} textAnchor="middle"
          fontSize={9} fontFamily="monospace" fill={colors.statusOk}>{vs11dStr}</text>

        {/* ── VAC15 trip indicator — above RSXS circle ── */}
        <rect x={rsxsX - 16} y={2} width={32} height={10}
          fill={vac15Color} stroke="#333" strokeWidth={1} rx={1} />
        <text x={rsxsX} y={7} textAnchor="middle" dominantBaseline="middle"
          fontSize={7} fontWeight="600" fill="#fff">
          VS11D
        </text>

        {/* ── GV14 Gate Valve (bowtie triangles) ── */}
        <polygon
          points={`${gv14X - gvHW},${by - 2 - gvTH} ${gv14X + gvHW},${by - 2 - gvTH} ${gv14X},${by + bh / 2}`}
          fill={gv14Open ? colors.statusOk : gv14Closed ? colors.statusError : "#888"}
        />
        <polygon
          points={`${gv14X - gvHW},${by + bh + 2 + gvTH} ${gv14X + gvHW},${by + bh + 2 + gvTH} ${gv14X},${by + bh / 2}`}
          fill={gv14Open ? colors.statusOk : gv14Closed ? colors.statusError : "#888"}
        />
        <text x={gv14X} y={by - 2 - gvTH - 2} textAnchor="middle" fontSize={8} fill="#333">V10D</text>
        {(gv14Open || gv14Closed) && (
          <text x={gv14X} y={by + bh / 2} textAnchor="middle" dominantBaseline="middle"
            fontSize={7} fontWeight="700" fill="#111">
            {gv14Open ? "OPEN" : "CLOSED"}
          </text>
        )}

        {/* ── Slit 3D ── */}
        <rect x={s3dX} y={by - 2 - gvTH} width={jawW} height={gvTH} fill="#333" />
        <rect x={s3dX} y={by + bh + 2}   width={jawW} height={gvTH} fill="#333" />
        <text x={s3dX + jawW / 2} y={by - 2 - gvTH - 2} textAnchor="middle" fontSize={8} fill="#333">3D</text>

        {/* ── VS10D vacuum readback — below Slit 3D ── */}
        <text x={s3dX + jawW / 2} y={by + bh + 2 + gvTH + 9} textAnchor="middle"
          fontSize={8} fill="#555">VS10D</text>
        <text x={s3dX + jawW / 2} y={by + bh + 2 + gvTH + 21} textAnchor="middle"
          fontSize={9} fontFamily="monospace" fill={colors.statusOk}>
          {vs10dStr}
        </text>

        {/* ── D-Shutter ── */}
        <rect x={dsX} y={by + bh / 2 - dsH / 2} width={dsW} height={dsH} fill={dsColor} rx={1} />
        <text x={dsX + dsW / 2} y={by + bh / 2 - dsH / 2 - 4} textAnchor="middle" fontSize={8} fill="#333">D-Shutter</text>
        <text x={dsX + dsW / 2} y={by + bh / 2 + 3} textAnchor="middle" fontSize={8} fontWeight="700" fill="#fff">
          {dsLabel}
        </text>

      </svg>

      {/* ── Bottom HTML ── */}
      <div style={{ display: "flex", alignItems: "flex-start", marginTop: -negMargin }}>

        {/* Left: GV14 buttons — centered under valve */}
        <div style={{ width: dsX - 2, paddingTop: by + bh + 2 + gvTH - (H - negMargin) + 4, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <div style={{ marginLeft: gv14X, transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV14:OPEN.VAL", 1)}
              style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", width: "100%" }}>
              OPEN
            </button>
            <button
              onClick={() => pvwsWriter.write("29id:BLEPS:GV14:CLOSE.VAL", 1)}
              style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer" }}>
              CLOSE
            </button>
          </div>
        </div>

        {/* Right: DS OPEN / DS CLOSE buttons + permit alarm — under D-Shutter */}
        <div style={{ width: dsW + 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <button
            onClick={() => pvwsWriter.write("S29ID-PSS:SDS:OpenEPICSC", 1)}
            style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
            DS OPEN
          </button>
          <button
            onClick={() => pvwsWriter.write("S29ID-PSS:SDS:CloseEPICSC", 1)}
            style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
            DS CLOSE
          </button>
          {!dPermit && (
            <span style={{ color: colors.statusError, fontSize: 9, whiteSpace: "nowrap" }}>
              NO DS Permit
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
