import { useState, useId } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble, toStr, pvCtx } from "../../../lib/epics";
import { colors, fontSize } from "../../../lib/theme";
import { ChanRbvBox, ChanSpBox, TweakValue, TweakButton, Row } from "../../../widgets/EpicsWidgets";

// ── Constants ─────────────────────────────────────────────────────────────────

const LW    = 80;  // label column width — "Longitudinal" ≈ 75px at font 11
const FW    = 80;  // readback / setpoint field width
const UW    = 36;  // unit column width
const TWV_W = 60;  // tweak step field width
const BTN   = 26;  // tweak button size

// With Row gap=4, ‹ column starts at: LW + 4 + FW + 4 + UW + 4 = 208px
const ARROW_LEFT = LW + 4 + FW + 4 + UW + 4;

// Setpoint header span covers ‹(BTN) + gap(4) + sp(FW) + gap(4) + ›(BTN)
const SP_HDR_W = BTN + 4 + FW + 4 + BTN;

const BTN_W = 54; // uniform width for MOVE / STOP / KILL

// Total content width: sum of all columns + gaps between them
const CONTENT_W = LW + 4 + FW + 4 + UW + 4 + BTN + 4 + FW + 4 + BTN + 4 + TWV_W; // 412px

// Left edge of STOP so that right edge of KILL aligns with right edge of tweak column
const STOP_LEFT = CONTENT_W - BTN_W * 2 - 6; // 412 - 54 - 6 - 54 = 298px

const MIRRORS = [
  { id: "m3r", label: "M3R", prefix: "29id_m3r:" },
  { id: "m1",  label: "M1",  prefix: "29id_m1:"  },
  { id: "m0",  label: "M0",  prefix: "29id_m0:"  },
];

const AXES = [
  { key: "TX", label: "Lateral",      unit: "mm"   },
  { key: "TY", label: "Vertical",     unit: "mm"   },
  { key: "TZ", label: "Longitudinal", unit: "mm"   },
  { key: "RZ", label: "Yaw",          unit: "mrad" },
  { key: "RY", label: "Pitch",        unit: "mrad" },
  { key: "RX", label: "Roll",         unit: "mrad" },
];

const labelStyle: React.CSSProperties = {
  fontSize: fontSize.label,
  color: colors.label,
  width: LW,
  flexShrink: 0,
  textAlign: "right",
};

// ── AxisRow ───────────────────────────────────────────────────────────────────

function AxisRow({ widgetId, prefix, axisKey, label, unit }: {
  widgetId: string;
  prefix: string;
  axisKey: string;
  label: string;
  unit: string;
}) {
  // widgetId scopes each subscription to this Mirrors instance. Without it,
  // two Mirrors panels viewing the same mirror share useConnection ids, and
  // switching the mirror tab in one panel tears down subscriptions the other
  // panel (and BeamlineEnergyA, which uses identical ${prefix}sys-sts ids)
  // still depends on.
  const id = `${widgetId}-${prefix}${axisKey}`;
  const [, conn,, monRaw] = useConnection(`${id}-mon`, `ca://${prefix}${axisKey}_MON`);
  const [,,,       spRaw] = useConnection(`${id}-sp`,  `ca://${prefix}${axisKey}_POS_SP`);
  const [,,,      twvRaw] = useConnection(`${id}-twv`, `ca://${prefix}${axisKey}_TWV_SP`);

  const twv = toDouble(twvRaw);

  return (
    <Row>
      <span style={labelStyle}>{label}</span>
      <ChanRbvBox raw={monRaw} width={FW} onContextMenu={e => pvCtx(`${prefix}${axisKey}_MON`, monRaw, e)} />
      <span style={{ fontSize: fontSize.label, color: colors.unit, width: UW, flexShrink: 0 }}>
        {unit}
      </span>
      <TweakButton size={BTN} onClick={() => pvwsWriter.write(`${prefix}${axisKey}_TWN_CMD.PROC`, 1)} disabled={!conn}>
        −
      </TweakButton>
      <ChanSpBox raw={spRaw} width={FW} onCommit={n => pvwsWriter.write(`${prefix}${axisKey}_POS_SP`, n)} disabled={!conn} onContextMenu={e => pvCtx(`${prefix}${axisKey}_POS_SP`, spRaw, e)} />
      <TweakButton size={BTN} onClick={() => pvwsWriter.write(`${prefix}${axisKey}_TWP_CMD.PROC`, 1)} disabled={!conn}>
        +
      </TweakButton>
      <TweakValue value={twv} prec={4} onCommit={n => pvwsWriter.write(`${prefix}${axisKey}_TWV_SP`, n)} style={{ width: TWV_W, height: BTN }} />
    </Row>
  );
}

// ── Status color helpers ──────────────────────────────────────────────────────

function stsColor(val: number | null): string {
  if (val === 1) return colors.statusOk;               // Positioned
  if (val === 0 || val === 2) return colors.statusWarn; // Moving / Homing
  if (val === 8) return colors.statusError;              // Fault
  return colors.rbvText;
}

function homColor(val: number | null): string {
  if (val === 2) return colors.statusOk;               // Homed
  if (val === 1) return colors.statusWarn;              // Homing
  if (val === 0 || val === 8) return colors.statusError; // Not homed / Fault
  return colors.rbvText;
}

// ── MirrorFooter ──────────────────────────────────────────────────────────────

function MirrorFooter({ widgetId, prefix, label }: { widgetId: string; prefix: string; label: string }) {
  const [,,,  stsRaw] = useConnection(`${widgetId}-${prefix}sys-sts`,    `ca://${prefix}SYSTEM_STS`);
  const [,,, homRaw]  = useConnection(`${widgetId}-${prefix}homing-sts`, `ca://${prefix}HOMING_STS`);

  const stsStr = toStr(stsRaw) ?? "—";
  const homStr = toStr(homRaw) ?? "—";
  const stsNum = toDouble(stsRaw);
  const homNum = toDouble(homRaw);

  const valueStyle: React.CSSProperties = {
    fontSize: fontSize.label,
    fontFamily: "monospace",
    color: colors.rbvText,
    background: colors.rbvBg,
    border: `1px solid ${colors.rbvBorder}`,
    borderRadius: 3,
    padding: "3px 8px",
    width: FW,
    boxSizing: "border-box",
  };

  const actionBtn: React.CSSProperties = {
    borderRadius: 3,
    padding: "4px 0",
    width: BTN_W,
    cursor: "pointer",
    fontSize: fontSize.label,
    fontFamily: "sans-serif",
    fontWeight: 700,
    textAlign: "center",
    border: "none",
  };

  // HOME & STAY width spans STOP + gap + KILL so its right edge lines up
  // with KILL's right edge (the tweak column edge).
  const HOME_W = BTN_W * 2 + 6;

  return (
    <div style={{
      position: "relative",
      marginTop: 10,
      paddingTop: 10,
      borderTop: `1px solid ${colors.sectionHdrBorder}`,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      {/* Status row: Status RBV on the left, STOP+KILL pinned to the right
          edge so they vertically align with this row's center. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: CONTENT_W }}>
        <span style={labelStyle}>Status</span>
        <span style={{ ...valueStyle, color: stsColor(stsNum) }}>{stsStr}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            onClick={() => pvwsWriter.write(`${prefix}STOP_CMD.PROC`, 1)}
            style={{ ...actionBtn, background: colors.statusError, color: "#fff" }}
          >STOP</button>
          <button
            onClick={() => pvwsWriter.write(`${prefix}KILL_CMD.PROC`, 1)}
            style={{ ...actionBtn, background: "rgb(140,0,140)", color: "#fff" }}
          >KILL</button>
        </div>
      </div>
      {/* Homing row: Homing RBV on the left, HOME & STAY pinned right so it
          aligns with this row's center. Width matches STOP+gap+KILL. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: CONTENT_W }}>
        <span style={labelStyle}>Homing</span>
        <span style={{ ...valueStyle, color: homColor(homNum) }}>{homStr}</span>
        <button
          onClick={() => {
            if (window.confirm(`Are you sure you want to home ${label}?`)) {
              pvwsWriter.write(`${prefix}HOME_MODE_SP`, 0);
              // Delay PROC so the mode-write's downstream FLNK chain has time
              // to arm the homing sequence. Back-to-back writes consistently
              // failed to start motion; caQtDM works because the user clicks
              // mode then Home Now hundreds of ms apart.
              setTimeout(() => pvwsWriter.write(`${prefix}HOME_CMD.PROC`, 1), 200);
            }
          }}
          style={{ ...actionBtn, marginLeft: "auto", width: HOME_W, background: "rgb(120,180,130)", color: "#fff" }}
        >HOME &amp; STAY</button>
      </div>

      {/* MOVE aligned with ‹ column, centered vertically between the two rows */}
      <div style={{ position: "absolute", left: ARROW_LEFT, top: "50%", transform: "translateY(-50%)" }}>
        <button
          onClick={() => pvwsWriter.write(`${prefix}MOVE_CMD.PROC`, 1)}
          style={{ ...actionBtn, background: colors.spBg, color: colors.spText, border: `1px solid ${colors.spBorder}`, fontWeight: 400 }}
        >MOVE</button>
      </div>
    </div>
  );
}

// ── MirrorPanel ───────────────────────────────────────────────────────────────

function MirrorPanel({ widgetId, prefix, label }: { widgetId: string; prefix: string; label: string }) {
  return (
    <div style={{ paddingTop: 10, paddingBottom: 10, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, paddingLeft: LW + 4 }}>
        <span style={{ fontSize: fontSize.small, color: colors.dim, width: FW, textAlign: "center", flexShrink: 0 }}>Readback</span>
        <span style={{ width: UW, flexShrink: 0 }} />
        <span style={{ fontSize: fontSize.small, color: colors.dim, width: SP_HDR_W, textAlign: "center", flexShrink: 0 }}>Setpoint</span>
        <span style={{ fontSize: fontSize.small, color: colors.dim, width: TWV_W, textAlign: "center", flexShrink: 0 }}>Tweak Step</span>
      </div>
      {AXES.map(ax => (
        <AxisRow key={ax.key} widgetId={widgetId} prefix={prefix} axisKey={ax.key} label={ax.label} unit={ax.unit} />
      ))}
      <MirrorFooter widgetId={widgetId} prefix={prefix} label={label} />
    </div>
  );
}

// ── Mirrors ───────────────────────────────────────────────────────────────────

export function Mirrors() {
  const [active, setActive] = useState(0);
  const mirror = MIRRORS[active];
  // Unique-per-instance id so each spawned Mirrors panel has its own
  // useConnection subscription namespace (see AxisRow for rationale).
  const widgetId = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "sans-serif", minWidth: CONTENT_W }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${colors.sectionHdrBorder}` }}>
        {MIRRORS.map((m, i) => (
          <button
            key={m.id}
            onClick={() => setActive(i)}
            style={{
              padding: "6px 20px",
              fontSize: fontSize.label,
              fontWeight: active === i ? 700 : 400,
              color: active === i ? colors.relatedFg : colors.dim,
              background: active === i ? "#fff" : "transparent",
              border: "none",
              borderBottom: active === i ? `2px solid ${colors.relatedFg}` : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "sans-serif",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <MirrorPanel key={mirror.prefix} widgetId={widgetId} prefix={mirror.prefix} label={mirror.label} />
    </div>
  );
}
