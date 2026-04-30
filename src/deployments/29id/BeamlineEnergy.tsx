import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";
import { toDouble, toStr, toBool, pvCtx } from "../../lib/epics";
import { colors, fontSize } from "../../lib/theme";
import { RbvBox, SpBox, TweakValue, Row } from "../../widgets/EpicsWidgets";

// ── Constants ─────────────────────────────────────────────────────────────────

const FW  = 110;                      // field width
const UW  = 32;                       // unit column width
const TWV_W = FW - 2 * 24 - 2 * 4;  // tweak value width = 54px

// ── Shared styles ─────────────────────────────────────────────────────────────

const rbvStyle: React.CSSProperties = {
  fontFamily: "monospace", fontSize: fontSize.mono, color: colors.rbvText,
  background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`, borderRadius: 3,
  padding: "4px 6px", width: FW, textAlign: "right",
  boxSizing: "border-box", flexShrink: 0,
};

const tweakBtnStyle: React.CSSProperties = {
  background: colors.tweakBg, color: colors.tweakFg, border: `1px solid ${colors.tweakBorder}`,
  borderRadius: 3, width: 22, height: 22, fontSize: 16, lineHeight: "1",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, flexShrink: 0,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: fontSize.label, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
  color: colors.sectionHdr, marginBottom: 6, borderBottom: `1px solid ${colors.sectionHdrBorder}`, paddingBottom: 3,
};

const unitStyle: React.CSSProperties = {
  fontSize: fontSize.label, color: colors.unit, width: UW, flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: fontSize.label, color: colors.label, textAlign: "right", flexShrink: 0,
};

// ── Enum helpers ──────────────────────────────────────────────────────────────

function grtLabel(grt: number | null): string | null {
  if (grt === 2) return "HEG";
  if (grt === 3) return "MEG";
  if (grt !== null && grt > 3) return "No GRT!";
  return null;
}

// 29idmonoMIR_TYPE_MON: 1=Au, 2=Si, 3=C, >3=No stripe
function mirLabel(mir: number | null): string | null {
  if (mir === null) return null;
  if (mir === 1) return "Au";
  if (mir === 2) return "Si";
  if (mir === 3) return "C";
  if (mir > 3)  return "No stripe";
  return null;
}

// ── RingInfoButton ────────────────────────────────────────────────────────────

const ringInfoItems = [
  { label: "24h Beam History",    file: "/ui/beamHistory.ui",                                    macros: {} },
  { label: "Storage Ring Status", file: "/ui//APSshare/adlsys/sr/fe/SR_Status.ui",               macros: {} },
  { label: "RF BPM",              file: "/ui/29id_BPM.ui",                                        macros: {} },
  { label: "X-Ray BPM",          file: "/ui/IDxbpm.ui",                                           macros: { sector: "29", sectorPlusOne: "30", sector0: "29" } },
  { label: "Steering",           file: "/ui/BLSteering.ui",                                        macros: { BL: "ID", S: "29", SEC: "29" } },
];

function RingInfoButton() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    setMenuPos(r ? { top: r.bottom + 2, left: r.left } : null);
  }

  function openScreen(item: typeof ringInfoItems[0]) {
    window.dispatchEvent(new CustomEvent("open-ui", { detail: { ...item, label: item.label } }));
    setMenuPos(null);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        style={{
          background: colors.relatedBg, border: `1px solid ${colors.relatedBorder}`, color: colors.relatedFg,
          borderRadius: 3, fontSize: fontSize.label, fontFamily: "sans-serif",
          padding: "4px 6px", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "stretch",
        }}
      >Ring Info ▾</button>
      {menuPos && createPortal(
        <>
          <div onClick={() => setMenuPos(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div style={{
            position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999,
            background: "#fff", border: "1px solid #999", borderRadius: 2,
            minWidth: 160, boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
          }}>
            {ringInfoItems.map((item, i) => (
              <div
                key={i}
                onClick={() => openScreen(item)}
                style={{
                  padding: "4px 8px", fontSize: 11, fontFamily: "sans-serif",
                  cursor: "pointer", whiteSpace: "nowrap",
                  borderBottom: i < ringInfoItems.length - 1 ? "1px solid #eee" : "none",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#e8f0fe")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >{item.label}</div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── IdGearButton ──────────────────────────────────────────────────────────────

const idGearItems = [
  { label: "ID more",   file: "/ui/29id/29id_BL_Energy_more.ui",                                                        macros: { P: "S29ID:" } },
  { label: "ID Expert", file: "/ui//APSshare/adlsys/screens/adl/iocs/idctl/adl_Legacy/IEXMachinePhysics.ui",            macros: { P: "S29ID:" } },
];

function IdGearButton() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    setMenuPos(r ? { top: r.bottom + 2, left: r.left } : null);
  }

  function openScreen(item: typeof idGearItems[0]) {
    window.dispatchEvent(new CustomEvent("open-ui", { detail: { ...item, label: item.label } }));
    setMenuPos(null);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        title="ID screens"
        style={{
          width: 23, height: 23, flexShrink: 0,
          background: colors.relatedBg, border: `1px solid ${colors.relatedBorder}`,
          color: colors.relatedFg, cursor: "pointer", fontSize: 14,
          borderRadius: 3, padding: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      ><span style={{ display: "block", lineHeight: 1, marginTop: -1 }}>⚙</span></button>
      {menuPos && createPortal(
        <>
          <div onClick={() => setMenuPos(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div style={{
            position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999,
            background: "#fff", border: "1px solid #999", borderRadius: 2,
            minWidth: 140, boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
          }}>
            {idGearItems.map((item, i) => (
              <div
                key={i}
                onClick={() => openScreen(item)}
                style={{
                  padding: "4px 8px", fontSize: 11, fontFamily: "sans-serif",
                  cursor: "pointer", whiteSpace: "nowrap",
                  borderBottom: i < idGearItems.length - 1 ? "1px solid #eee" : "none",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#e8f0fe")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >{item.label}</div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── MonoSection ───────────────────────────────────────────────────────────────

function MonoSection() {
  const [, conn,, rbvRaw] = useConnection("bl-mono-rbv",   "ca://29idmono:ENERGY_MON");
  const [,,,      spRaw]  = useConnection("bl-mono-sp",    "ca://29idmono:ENERGY_SP");
  const [,,,      grtRaw] = useConnection("bl-mono-grt",   "ca://29idmonoGRT_TYPE_MON");
  const [,,,      mirRaw] = useConnection("bl-mono-mir",   "ca://29idmonoMIR_TYPE_MON");
  const [,,,      rdyRaw] = useConnection("bl-mono-ready", "ca://29idb:userStringCalc2.VAL");
  const [,,,      twvRaw] = useConnection("bl-mono-twv",   "ca://29id:MonoEnergyTweakValue");
  const [,,,      tmpRaw] = useConnection("bl-mono-tmp",   "ca://29idb:userCalcOut10.VAL");
  const [,,,      rngRaw] = useConnection("bl-ring",       "ca://S-DCCT:CurrentM");

  const rbv  = toDouble(rbvRaw);
  const sp   = toDouble(spRaw);
  const grt  = toDouble(grtRaw);
  const mir  = toDouble(mirRaw);
  const ready = (toDouble(rdyRaw) ?? 0) !== 0;
  const twv  = toDouble(twvRaw);
  const tmp  = toDouble(tmpRaw);
  const ring = toDouble(rngRaw);

  const gLabel = grtLabel(grt);
  const mLabel = mirLabel(mir);
  const tempAlarm = tmp !== null && tmp !== 0;


  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <div style={sectionHeaderStyle}>Mono</div>

      {/* Row 1: RBV | eV | Done/Busy */}
      <Row>
        <RbvBox value={rbv} prec={(rbvRaw as any)?.display?.precision ?? 2} width={FW} onContextMenu={e => pvCtx("29idmono:ENERGY_MON", rbvRaw, e)} />
        <span style={unitStyle}>eV</span>
        <span style={{ fontSize: fontSize.small, color: ready ? colors.statusOk : colors.statusWarn, whiteSpace: "nowrap" }}>
          ● {ready ? "Done" : "Busy"}
        </span>
      </Row>

      {/* Row 2: SP | eV | Grating label */}
      <Row>
        <SpBox value={sp} prec={(spRaw as any)?.display?.precision ?? 3} width={FW} onCommit={n => pvwsWriter.write("29idmono:ENERGY_SP", n)} onContextMenu={e => pvCtx("29idmono:ENERGY_SP", spRaw, e)} />
        <span style={unitStyle}>eV</span>
        <div style={{ minWidth: 40 }}>
          {gLabel
            ? <span style={{ fontSize: fontSize.badge, fontWeight: 700, color: colors.relatedFg }}>{gLabel}</span>
            : <span style={{ fontSize: fontSize.small, color: colors.dim }}>—</span>}
        </div>
      </Row>

      {/* Row 3: Tweak ‹›  | eV | Mirror label */}
      <Row>
        <div style={{ display: "flex", alignItems: "center", gap: 4, width: FW, flexShrink: 0 }}>
          <button onClick={() => pvwsWriter.write("29id:MonoEnergyTweakDec.PROC", 1)}
            style={tweakBtnStyle} disabled={!conn}><span style={{ marginTop: -3 }}>‹</span></button>
          <TweakValue value={twv} onCommit={n => pvwsWriter.write("29id:MonoEnergyTweakValue", n)} style={{ width: TWV_W }} onContextMenu={e => pvCtx("29id:MonoEnergyTweakValue", twvRaw, e)} />
          <button onClick={() => pvwsWriter.write("29id:MonoEnergyTweakInc.PROC", 1)}
            style={tweakBtnStyle} disabled={!conn}><span style={{ marginTop: -3 }}>›</span></button>
        </div>
        <span style={unitStyle}>eV</span>
        <div style={{ minWidth: 40 }}>
          {mLabel ? <span style={{ fontSize: fontSize.badge, fontWeight: 700, color: "#ffa726" }}>{mLabel}</span> : null}
        </div>
      </Row>

      {/* Row 4: STOP | Temp alarm */}
      <Row mt={2}>
        <button
          onClick={() => pvwsWriter.write("29idmono:STOP_CMD.PROC", 1)}
          style={{
            background: "#7f1d1d", color: "#fecaca", border: `1px solid ${colors.statusError}`,
            borderRadius: 3, padding: "3px 0", fontSize: fontSize.label, cursor: "pointer",
            width: FW, boxSizing: "border-box", flexShrink: 0,
          }}
        >STOP</button>
        <div>
          {tempAlarm && (
            <span title="Temperature alarm!" style={{ fontSize: fontSize.label, color: colors.statusError, whiteSpace: "nowrap" }}>
              🌡 Temp!
            </span>
          )}
        </div>
      </Row>

      <div style={{ flex: 1 }} />
      {/* Row 5: Ring current | mA | Ring Info button */}
      <Row mt={0}>
        <RbvBox value={ring} prec={(rngRaw as any)?.display?.precision ?? 1} width={FW} onContextMenu={e => pvCtx("S-DCCT:CurrentM", rngRaw, e)} />
        <span style={unitStyle}>mA</span>
        <RingInfoButton />
      </Row>
    </div>
  );
}

// ── IdSection ─────────────────────────────────────────────────────────────────

const ID_LABEL_W = 55;

function IdSection() {
  const [, conn,, rbvRaw]   = useConnection("bl-id-rbv",   "ca://S29ID:EnergyM.VAL");
  const [,,,       spRaw]   = useConnection("bl-id-sp",    "ca://S29ID:EnergySetC.VAL");
  const [,,,       modeRaw] = useConnection("bl-id-mode",  "ca://S29ID:ActualModeM");
  const [,,,       desRaw]  = useConnection("bl-id-des",   "ca://S29ID:DesiredModeC.VAL");
  const [,,,       qpRaw]   = useConnection("bl-id-qp",    "ca://S29ID:QuasiRatioM.RVAL");
  const [,,,       onRaw]   = useConnection("bl-id-on",    "ca://S29ID:Main_on_offC.VAL");
  const [,,,       fbRaw]   = useConnection("bl-id-fb",    "ca://S29ID:feedbackM.VAL");
  const [,,,       busyRaw] = useConnection("bl-id-busy",  "ca://S29ID:BusyRecordM");
  const [,,,       hystRaw] = useConnection("bl-id-hyst",  "ca://29idb:userCalcOut4.VAL");
  const [,,,       corrRaw] = useConnection("bl-id-corr",  "ca://S29ID:CorrRdbkEarth_.VAL");
  const [,,,       accRaw]  = useConnection("bl-id-acc",   "ca://S29ID:AccessSecurityC.VAL");

  const rbv     = toDouble(rbvRaw);
  const sp      = toDouble(spRaw);
  const mode    = toStr(modeRaw) ?? "—";
  const modeIdx = toDouble(modeRaw);
  const des        = toDouble(desRaw);
  const desChoices = (desRaw as { display?: { choices?: string[] } })?.display?.choices;
  const qp      = toDouble(qpRaw);
  const on      = toBool(onRaw);
  const fb      = toStr(fbRaw) ?? "—";
  const busy    = (toDouble(busyRaw) ?? 0) !== 0;  // 0=Done, 1=Busy
  const hyst    = toDouble(hystRaw);
  const hystUp  = hyst !== null && hyst !== 0;

  const desIdx = des !== null ? Math.round(des) : -1;

  // coffee cup: C=0 AND A=1 AND (B=0 OR B=1 OR B=3 OR B=4)
  // A=userCalcOut4 (hystUp), B=ActualModeM, C=BusyRecordM
  const showCoffee = !busy && hystUp && modeIdx !== null && [0, 1, 3, 4].includes(Math.round(modeIdx));

  const corr = toDouble(corrRaw);
  const malfunction = corr !== null && (corr < 0.4 || corr > 0.8);
  const noAccess = (toDouble(accRaw) ?? 0) !== 0;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionHeaderStyle}>ID</div>

      {/* Row 1: On/Off | RBV keV | keV | Busy dot */}
      <Row>
        <div style={{ width: ID_LABEL_W, flexShrink: 0, textAlign: "center" }}>
          <span style={{ fontSize: fontSize.badge, fontWeight: 700, color: on ? colors.statusOk : colors.statusError }}>
            {on ? "On" : "Off"}
          </span>
        </div>
        <RbvBox value={rbv} prec={(rbvRaw as any)?.display?.precision ?? 4} width={FW} onContextMenu={e => pvCtx("S29ID:EnergyM.VAL", rbvRaw, e)} />
        <span style={unitStyle}>keV</span>
        <span style={{ fontSize: fontSize.small, whiteSpace: "nowrap", color: noAccess ? colors.statusError : busy ? colors.statusWarn : colors.statusOk }}>
          ● {noAccess ? "No access" : busy ? "Busy" : "Done"}
        </span>
      </Row>

      {/* Row 2: Ramp | SP keV | keV | Arrow + coffee */}
      <Row>
        <div style={{ width: ID_LABEL_W, flexShrink: 0, alignSelf: "stretch" }}>
          <button
            onClick={() => pvwsWriter.write("S29ID:StartRampC.VAL", 1)}
            disabled={!conn}
            style={{
              background: "#e8f5e9", color: "#1b5e20", border: `1px solid ${colors.statusOk}`,
              borderRadius: 3, fontSize: fontSize.label, cursor: "pointer",
              width: "100%", height: "100%",
            }}
          >Ramp</button>
        </div>
        <SpBox value={sp} prec={(spRaw as any)?.display?.precision ?? 4} width={FW} onCommit={n => pvwsWriter.write("S29ID:EnergySetC.VAL", n)} onContextMenu={e => pvCtx("S29ID:EnergySetC.VAL", spRaw, e)} />
        <span style={unitStyle}>keV</span>
        {malfunction ? (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: -6 }}>
            <div style={{
              width: 0, height: 0,
              borderLeft: "7px solid transparent",
              borderRight: "7px solid transparent",
              borderBottom: "13px solid #ff6b35",
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#ff6b35", whiteSpace: "nowrap", letterSpacing: 0.5 }}>
              Call Staff
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
            <span style={{ fontSize: 22, color: "rgb(0,53,132)", lineHeight: 1 }} title={`ID hysteresis: ${hystUp ? "up" : "down"}`}>
              {hystUp ? "↑" : "↓"}
            </span>
            {showCoffee && (
              <span title="Hysteresis cycling in progress" style={{ fontSize: 20 }}>☕</span>
            )}
          </div>
        )}
      </Row>

      {/* Row 3: Mode label | ActualModeM RBV | DesiredModeC menu */}
      <Row>
        <div style={{ ...labelStyle, width: ID_LABEL_W }}>Mode</div>
        <div onContextMenu={e => pvCtx("S29ID:ActualModeM", modeRaw, e)} style={{ ...rbvStyle, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "context-menu" }}>
          {mode}
        </div>
        <select
          value={desIdx >= 0 ? desIdx : ""}
          onChange={e => pvwsWriter.write("S29ID:DesiredModeC.VAL", Number(e.target.value))}
          style={{
            flex: 1, minWidth: 0,
            background: colors.spBg, color: colors.spText, border: `1px solid ${colors.spBorder}`,
            borderRadius: 3, fontSize: fontSize.mono, padding: "4px 4px", cursor: "pointer",
          }}
        >
          {(desChoices ?? []).map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
      </Row>

      {/* Row 4: QP% label | QP RBV | hint */}
      <Row>
        <div style={{ ...labelStyle, width: ID_LABEL_W }}>QP %</div>
        <div onContextMenu={e => pvCtx("S29ID:QuasiRatioM.RVAL", qpRaw, e)} style={{ ...rbvStyle, textAlign: "right", cursor: "context-menu" }}>
          {qp !== null ? qp.toFixed(1) : "—"}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 9, color: colors.dim, lineHeight: 1.3 }}>
          Set energy after<br />changing polarization
        </div>
      </Row>

      {/* Row 5: BusyRecord RBV | feedbackM RBV */}
      <Row>
        <div style={{ ...rbvStyle, width: ID_LABEL_W, textAlign: "center", fontSize: fontSize.label, padding: "3px 6px" }}>
          {toStr(busyRaw) ?? "—"}
        </div>
        <div onContextMenu={e => pvCtx("S29ID:feedbackM.VAL", fbRaw, e)} style={{
          flex: 1, minWidth: 0,
          fontFamily: "monospace", fontSize: fontSize.label, color: colors.rbvText,
          background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`, borderRadius: 3,
          padding: "3px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          boxSizing: "border-box", cursor: "context-menu",
        }}>
          {fb}
        </div>
        <IdGearButton />
      </Row>
    </div>
  );
}

// ── BeamlineEnergy ────────────────────────────────────────────────────────────

export function BeamlineEnergy() {
  return (
    <div style={{ display: "flex", gap: 16, padding: "10px 14px", fontFamily: "sans-serif", minWidth: 520 }}>
      <MonoSection />
      <div style={{ width: 1, background: "#1e3a5c", flexShrink: 0 }} />
      <IdSection />
    </div>
  );
}
