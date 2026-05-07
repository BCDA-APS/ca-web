import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";
import { toDouble, toStr, toBool, pvCtx } from "../../lib/epics";
import { colors, fontSize } from "../../lib/theme";
import { ChanRbvBox, ChanSpBox, Row } from "../../widgets/EpicsWidgets";
import { MonoSection, IdSection, SectionHead, rbvStyle, labelStyle } from "./EnergyShared";


// ── e-BPM ─────────────────────────────────────────────────────────────────────

const BPM_FW = 80;
const BPM_LW = 30;

function EBpmSection() {
  const [,,, vPosRaw] = useConnection("bpm-vpos", "ca://S29:ID:SrcPt:VPositionM");
  const [,,, vAngRaw] = useConnection("bpm-vang", "ca://S29:ID:SrcPt:VAngleM");
  const [,,, hPosRaw] = useConnection("bpm-hpos", "ca://S29:ID:SrcPt:HPositionM");
  const [,,, hAngRaw] = useConnection("bpm-hang", "ca://S29:ID:SrcPt:HAngleM");

  const subHead: React.CSSProperties = {
    fontSize: fontSize.label, fontWeight: 700, color: colors.label, marginBottom: 2,
  };

  return (
    <div style={{ flexShrink: 0 }}>
      <SectionHead>e-BPM</SectionHead>
      <div style={subHead}>Vertical</div>
      <Row>
        <span style={{ ...labelStyle, width: BPM_LW }}>Pos</span>
        <ChanRbvBox raw={vPosRaw} fallbackPrec={1} width={BPM_FW} onContextMenu={e => pvCtx("S29:ID:SrcPt:VPositionM", vPosRaw, e)} />
      </Row>
      <Row>
        <span style={{ ...labelStyle, width: BPM_LW }}>Ang</span>
        <ChanRbvBox raw={vAngRaw} fallbackPrec={1} width={BPM_FW} onContextMenu={e => pvCtx("S29:ID:SrcPt:VAngleM", vAngRaw, e)} />
      </Row>
      <div style={{ ...subHead, marginTop: 6 }}>Horizontal</div>
      <Row>
        <span style={{ ...labelStyle, width: BPM_LW }}>Pos</span>
        <ChanRbvBox raw={hPosRaw} fallbackPrec={1} width={BPM_FW} onContextMenu={e => pvCtx("S29:ID:SrcPt:HPositionM", hPosRaw, e)} />
      </Row>
      <Row>
        <span style={{ ...labelStyle, width: BPM_LW }}>Ang</span>
        <ChanRbvBox raw={hAngRaw} fallbackPrec={1} width={BPM_FW} onContextMenu={e => pvCtx("S29:ID:SrcPt:HAngleM", hAngRaw, e)} />
      </Row>
      <div style={{ marginTop: 6, fontSize: fontSize.small, color: colors.dim, fontStyle: "italic", maxWidth: BPM_FW + BPM_LW }}>
        Outboard = more pos values
      </div>
    </div>
  );
}

// ── ID Magnetics ──────────────────────────────────────────────────────────────

const MAG_FW    = 70;
const MAG_LBL   = 36;
const MAG_QLBL  = 40;
const RATIO_LBL = 42;
const RATIO_W   = 46;

const magNumStyle: React.CSSProperties = { ...rbvStyle, width: MAG_FW };
const magRatioStyle: React.CSSProperties = { ...rbvStyle, width: RATIO_W };

const togBtn = (active: boolean, danger: boolean): React.CSSProperties => ({
  fontSize: fontSize.label, fontFamily: "sans-serif",
  borderRadius: 3, padding: "3px 8px", cursor: "pointer",
  background: active ? (danger ? colors.statusError : colors.statusOk) : "#f0f0f0",
  color: active ? "#fff" : "#aaa",
  border: `1px solid ${active ? (danger ? colors.statusError : colors.statusOk) : "#ccc"}`,
  flexShrink: 0,
});


function IdMagneticsSection() {
  const [,,, bxRaw]   = useConnection("mag-bx",    "ca://S29ID:BxRdbkM.VAL");
  const [,,, bxBRaw]  = useConnection("mag-bx-b",  "ca://S29ID:BxRdbkM");
  const [,,, bxqRaw]  = useConnection("mag-bxq",   "ca://S29ID:BxqRdbk_");
  const [,,, byRaw]   = useConnection("mag-by",    "ca://S29ID:ByRdbkM.VAL");
  const [,,, byDRaw]  = useConnection("mag-by-d",  "ca://S29ID:ByRdbkM");
  const [,,, byqRaw]  = useConnection("mag-byq",   "ca://S29ID:ByqRdbk_");
  const [,,, onRaw]   = useConnection("mag-on",    "ca://S29ID:Main_on_offC.VAL");
  const [,,, qpRaw]   = useConnection("mag-qp",    "ca://S29ID:QuasiRatioM.RVAL");
  const [,,, qpSpRaw] = useConnection("mag-qp-sp", "ca://S29ID:QuasiRatioInC.C");
  const [,,, tdirRaw] = useConnection("mag-tdir",  "ca://S29ID:TableDirection_");
  const [,,, earthRaw]    = useConnection("mag-earth",     "ca://S29ID:SetEarthCorr_");
  const [,,, earthFailRaw]= useConnection("mag-earth-fail","ca://S29ID:CorrRdbkEarth_.VAL");

  const bx  = toDouble(bxRaw);
  const bxB = toDouble(bxBRaw);
  const bxq = toDouble(bxqRaw);
  const by  = toDouble(byRaw);
  const byD = toDouble(byDRaw);
  const byq = toDouble(byqRaw);
  const on  = toBool(onRaw);
  const tdirFull = toStr(tdirRaw);
  const tdir = tdirFull ? tdirFull.split(" ")[0] : "—";
  const earth = toStr(earthRaw) ?? "—";

  const bxRatio = bx !== null && bx !== 0 && bxq !== null ? bxq / bx : null;
  const byRatio = by !== null && by !== 0 && byq !== null ? byq / by : null;

  const qpCommFail   = (bx !== null && bx > 1 && bxB !== null && bx * 0.5 > bxB)
                    || (by !== null && by > 1 && byD !== null && by * 0.5 > byD);
  const earthFail    = (toDouble(earthFailRaw) ?? -1) > -1;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHead>ID Coils</SectionHead>

      {/* Bx row */}
      <Row>
        <span style={{ ...labelStyle, width: MAG_LBL }}>Bx</span>
        <div style={{ ...magNumStyle, cursor: "context-menu" }} onContextMenu={e => pvCtx("S29ID:BxRdbkM.VAL", bxRaw, e)}>{bx !== null ? bx.toFixed(3) : "—"}</div>
        <span style={{ ...labelStyle, width: MAG_QLBL }}>Bxq</span>
        <div style={{ ...magNumStyle, cursor: "context-menu" }} onContextMenu={e => pvCtx("S29ID:BxqRdbk_", bxqRaw, e)}>{bxq !== null ? bxq.toFixed(3) : "—"}</div>
        <span style={{ ...labelStyle, width: RATIO_LBL }}>ratio</span>
        <div style={magRatioStyle}>{bxRatio !== null ? bxRatio.toFixed(2) : "—"}</div>
      </Row>

      {/* By row */}
      <Row>
        <span style={{ ...labelStyle, width: MAG_LBL }}>By</span>
        <div style={{ ...magNumStyle, cursor: "context-menu" }} onContextMenu={e => pvCtx("S29ID:ByRdbkM.VAL", byRaw, e)}>{by !== null ? by.toFixed(3) : "—"}</div>
        <span style={{ ...labelStyle, width: MAG_QLBL }}>Byq</span>
        <div style={{ ...magNumStyle, cursor: "context-menu" }} onContextMenu={e => pvCtx("S29ID:ByqRdbk_", byqRaw, e)}>{byq !== null ? byq.toFixed(3) : "—"}</div>
        <span style={{ ...labelStyle, width: RATIO_LBL }}>ratio</span>
        <div style={magRatioStyle}>{byRatio !== null ? byRatio.toFixed(2) : "—"}</div>
      </Row>

      {/* On/Off + QP% */}
      <Row mt={4}>
        <span style={{ ...labelStyle, width: MAG_LBL }}>ID</span>
        <div style={{ display: "flex", gap: 4, width: MAG_FW, flexShrink: 0 }}>
          <button onClick={() => pvwsWriter.write("S29ID:Main_on_offC.VAL", 1)} style={togBtn(on === true, false)}>On</button>
          <button onClick={() => pvwsWriter.write("S29ID:Main_on_offC.VAL", 0)} style={togBtn(on === false, true)}>Off</button>
        </div>
        <span style={{ ...labelStyle, width: MAG_QLBL }}>QP %</span>
        <ChanRbvBox raw={qpRaw} fallbackPrec={1} width={MAG_FW} onContextMenu={e => pvCtx("S29ID:QuasiRatioM.RVAL", qpRaw, e)} />
        <ChanSpBox raw={qpSpRaw} fallbackPrec={1} width={MAG_FW} onCommit={n => pvwsWriter.write("S29ID:QuasiRatioInC.C", n)} onContextMenu={e => pvCtx("S29ID:QuasiRatioInC.C", qpSpRaw, e)} />
        {qpCommFail && <span style={{ fontSize: fontSize.label, color: colors.statusError, lineHeight: 1.2 }}>QP coils<br />comm fail</span>}
      </Row>

      {/* Table readback + Earth Coils */}
      <Row>
        <span style={{ ...labelStyle, width: MAG_LBL }}>Table</span>
        <div style={{ ...rbvStyle, width: MAG_FW, textAlign: "center", cursor: "context-menu" }} onContextMenu={e => pvCtx("S29ID:TableDirection_", tdirRaw, e)}>{tdir}</div>
        <span style={{ ...labelStyle, width: 114 }}>Earth Coils</span>
        <div style={{ ...rbvStyle, width: MAG_FW, cursor: "context-menu" }} onContextMenu={e => pvCtx("S29ID:SetEarthCorr_", earthRaw, e)}>{earth}</div>
        {earthFail && <span style={{ fontSize: fontSize.label, color: colors.statusError, lineHeight: 1.2 }}>Earth coils fail</span>}
      </Row>
    </div>
  );
}

// ── Mirror status ─────────────────────────────────────────────────────────────

const MIRROR_DEFS = [
  { label: "M0",  prefix: "29id_m0:"  },
  { label: "M1",  prefix: "29id_m1:"  },
  { label: "M3R", prefix: "29id_m3r:" },
];

// SYSTEM_STS: 0=Moving, 1=Positioned, 2=Homing, 8=Fault
// HOMING_STS: 0=Not homed, 1=Homing, 2=Homed, 8=Fault
function stsColor(val: string | null, goodVal: string): string {
  if (!val) return colors.dim;
  if (val === goodVal) return colors.statusOk;
  if (val === "Fault") return colors.statusError;
  if (val === "Not homed") return colors.statusError;
  if (val === "Moving" || val === "Homing") return colors.statusWarn;
  return colors.dim;
}

function MirrorStatusItem({ label, prefix }: { label: string; prefix: string }) {
  const [,,, stsRaw] = useConnection(`${prefix}sys-sts`,    `ca://${prefix}SYSTEM_STS`);
  const [,,, homRaw] = useConnection(`${prefix}homing-sts`, `ca://${prefix}HOMING_STS`);

  const sts = toStr(stsRaw);
  const hom = toStr(homRaw);

  const dotStyle = (color: string): React.CSSProperties => ({ fontSize: fontSize.label, color });

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <span style={{ fontSize: fontSize.label, color: colors.label, fontWeight: 700, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={dotStyle(stsColor(sts, "Positioned"))}>● {sts ?? "—"}</span>
        <span style={dotStyle(stsColor(hom, "Homed"))}>● {hom ?? "—"}</span>
      </div>
    </div>
  );
}

function MirrorStatusSection() {
  return (
    <div>
      <SectionHead>Mirrors</SectionHead>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {MIRROR_DEFS.map(m => <MirrorStatusItem key={m.prefix} label={m.label} prefix={m.prefix} />)}
      </div>
    </div>
  );
}

// ── BeamlineEnergyA ───────────────────────────────────────────────────────────

const DIVIDER = <div style={{ width: 1, background: "#b0b0b8", alignSelf: "stretch", flexShrink: 0 }} />;

export function BeamlineEnergyA() {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "sans-serif", minWidth: 520 }}>
      <div style={{ display: "flex", gap: 16, padding: "10px 14px 6px" }}>
        <MonoSection />
        {DIVIDER}
        <IdSection />
      </div>
      <div style={{ display: "flex", gap: 16, padding: "6px 14px 10px" }}>
        <EBpmSection />
        {DIVIDER}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <IdMagneticsSection />
          <MirrorStatusSection />
        </div>
      </div>
    </div>
  );
}
