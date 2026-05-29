import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble, toStr, toBool, pvCtx } from "../../../lib/epics";
import { colors, fontSize } from "../../../lib/theme";
import { ChanRbvBox, ChanSpBox, TweakValue, Row } from "../../../widgets/EpicsWidgets";

// ── Constants ─────────────────────────────────────────────────────────────────

export const FW      = 110;
export const UW      = 32;
export const TWV_W   = FW - 2 * 24 - 2 * 4;
export const ID_LABEL_W = 55;

// ── Shared styles ─────────────────────────────────────────────────────────────

export const rbvStyle: React.CSSProperties = {
  fontFamily: "monospace", fontSize: fontSize.mono, color: colors.rbvText,
  background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`, borderRadius: 3,
  padding: "4px 6px", width: FW, textAlign: "right",
  boxSizing: "border-box", flexShrink: 0,
};

export const sectionHeaderStyle: React.CSSProperties = {
  fontSize: fontSize.label, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
  color: colors.sectionHdr,
};

export function SectionHead({ children }: { children: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={sectionHeaderStyle}>{children}</span>
      <div style={{ flex: 1, borderTop: `1px solid ${colors.sectionHdrBorder}` }} />
    </div>
  );
}

export const unitStyle: React.CSSProperties = {
  fontSize: fontSize.label, color: colors.unit, width: UW, flexShrink: 0,
};

export const labelStyle: React.CSSProperties = {
  fontSize: fontSize.label, color: colors.label, textAlign: "right", flexShrink: 0,
};

const tweakBtnStyle: React.CSSProperties = {
  background: colors.tweakBg, color: colors.tweakFg, border: `1px solid ${colors.tweakBorder}`,
  borderRadius: 3, width: 22, height: 22, fontSize: 16, lineHeight: "1",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, flexShrink: 0,
};

// ── Enum helpers ──────────────────────────────────────────────────────────────

function grtLabel(grt: number | null): string | null {
  if (grt === 2) return "HEG";
  if (grt === 3) return "MEG";
  if (grt !== null && grt > 3) return "No GRT!";
  return null;
}

function mirLabel(mir: number | null): string | null {
  if (mir === null) return null;
  if (mir === 1) return "Au";
  if (mir === 2) return "Si";
  if (mir === 3) return "C";
  if (mir > 3)  return "No stripe";
  return null;
}

function mirColor(mir: number | null): string {
  if (mir === 1) return "#ffa726";        // Au — amber
  if (mir === 2) return "#9e9e9e";        // Si — grey
  if (mir === 3) return "#212121";        // C  — black
  if (mir !== null && mir > 3) return colors.statusError; // No stripe — alarm red
  return colors.dim;
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

export function MonoSection() {
  const [, conn,, rbvRaw] = useConnection("bl-mono-rbv",   "ca://29idmono:ENERGY_MON");
  const [,,,      spRaw]  = useConnection("bl-mono-sp",    "ca://29idmono:ENERGY_SP");
  const [,,,      grtRaw] = useConnection("bl-mono-grt",   "ca://29idmonoGRT_TYPE_MON");
  const [,,,      mirRaw] = useConnection("bl-mono-mir",   "ca://29idmonoMIR_TYPE_MON");
  const [,,,      rdyRaw] = useConnection("bl-mono-ready", "ca://29idb:userStringCalc2.VAL");
  const [,,,      twvRaw] = useConnection("bl-mono-twv",   "ca://29id:MonoEnergyTweakValue");
  const [,,,      tmpRaw] = useConnection("bl-mono-tmp",   "ca://29idb:userCalcOut10.VAL");
  const [,,,      rngRaw] = useConnection("bl-ring",       "ca://S-DCCT:CurrentM");

  const grt  = toDouble(grtRaw);
  const mir  = toDouble(mirRaw);
  const ready = (toDouble(rdyRaw) ?? 0) !== 0;
  const twv  = toDouble(twvRaw);
  const tmp  = toDouble(tmpRaw);
  const tempAlarm = tmp !== null && tmp !== 0;

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <SectionHead>Mono</SectionHead>

      <Row>
        <ChanRbvBox raw={rbvRaw} fallbackPrec={2} width={FW} onContextMenu={e => pvCtx("29idmono:ENERGY_MON", rbvRaw, e)} />
        <span style={unitStyle}>eV</span>
        <span style={{ fontSize: fontSize.small, color: ready ? colors.statusOk : colors.statusWarn, whiteSpace: "nowrap" }}>
          ● {ready ? "Done" : "Busy"}
        </span>
      </Row>

      <Row>
        <ChanSpBox raw={spRaw} fallbackPrec={3} width={FW} onCommit={n => pvwsWriter.write("29idmono:ENERGY_SP", n)} onContextMenu={e => pvCtx("29idmono:ENERGY_SP", spRaw, e)} />
        <span style={unitStyle}>eV</span>
        <div style={{ minWidth: 40 }}>
          {grtLabel(grt)
            ? <span style={{ fontSize: fontSize.badge, fontWeight: 700, color: grt !== null && grt > 3 ? colors.statusError : colors.relatedFg }}>{grtLabel(grt)}</span>
            : <span style={{ fontSize: fontSize.small, color: colors.dim }}>—</span>}
        </div>
      </Row>

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
          {mirLabel(mir) ? <span style={{ fontSize: fontSize.badge, fontWeight: 700, color: mirColor(mir) }}>{mirLabel(mir)}</span> : null}
        </div>
      </Row>

      <Row mt={2}>
        <button
          onClick={() => pvwsWriter.write("29idmono:STOP_CMD.PROC", 1)}
          style={{
            background: colors.statusError, color: "#fff", border: `1px solid ${colors.statusError}`,
            borderRadius: 3, padding: "3px 0", fontSize: fontSize.label, fontWeight: 700, cursor: "pointer",
            width: FW, boxSizing: "border-box", flexShrink: 0,
          }}
        >STOP</button>
        <div>
          {tempAlarm && (
            <span title="Temperature alarm!" style={{ fontSize: fontSize.label, color: colors.statusError, whiteSpace: "nowrap" }}>
              Temp!
            </span>
          )}
        </div>
      </Row>

      <div style={{ flex: 1 }} />
      <Row mt={0}>
        <ChanRbvBox raw={rngRaw} fallbackPrec={1} width={FW} onContextMenu={e => pvCtx("S-DCCT:CurrentM", rngRaw, e)} />
        <span style={unitStyle}>mA</span>
        <RingInfoButton />
      </Row>
    </div>
  );
}

// ── IdSection ─────────────────────────────────────────────────────────────────

export function IdSection() {
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

  const mode    = toStr(modeRaw) ?? "—";
  const modeIdx = toDouble(modeRaw);
  const des        = toDouble(desRaw);
  const desChoices = (desRaw as { display?: { choices?: string[] } })?.display?.choices;
  const qp      = toDouble(qpRaw);
  const on      = toBool(onRaw);
  const fb      = toStr(fbRaw) ?? "—";
  const busy    = (toDouble(busyRaw) ?? 0) !== 0;
  const hyst    = toDouble(hystRaw);
  const hystUp  = hyst !== null && hyst !== 0;

  const desIdx = des !== null ? Math.round(des) : -1;

  const showCoffee = !busy && hystUp && modeIdx !== null && [0, 1, 3, 4].includes(Math.round(modeIdx));

  const corr = toDouble(corrRaw);
  const malfunction = corr !== null && (corr < 0.4 || corr > 0.8);
  const noAccess = (toDouble(accRaw) ?? 0) !== 0;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHead>ID</SectionHead>

      <Row>
        <div style={{ width: ID_LABEL_W, flexShrink: 0, textAlign: "center" }}>
          <span style={{ fontSize: fontSize.badge, fontWeight: 700, color: on ? colors.statusOk : colors.statusError }}>
            {on ? "On" : "Off"}
          </span>
        </div>
        <ChanRbvBox raw={rbvRaw} fallbackPrec={4} width={FW} onContextMenu={e => pvCtx("S29ID:EnergyM.VAL", rbvRaw, e)} />
        <span style={unitStyle}>keV</span>
        <span style={{ fontSize: fontSize.small, whiteSpace: "nowrap", color: noAccess ? colors.statusError : busy ? colors.statusWarn : colors.statusOk }}>
          ● {noAccess ? "No access" : busy ? "Busy" : "Done"}
        </span>
      </Row>

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
        <ChanSpBox raw={spRaw} fallbackPrec={4} width={FW} onCommit={n => pvwsWriter.write("S29ID:EnergySetC.VAL", n)} onContextMenu={e => pvCtx("S29ID:EnergySetC.VAL", spRaw, e)} />
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
              <span title="Hysteresis cycling in progress"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22, borderRadius: 4, background: "#1a1a1a",
                  fontSize: 16, lineHeight: 1,
                }}>☕</span>
            )}
            {/* Spare design preserved for possible future swap: custom SVG
                mug with brown coffee surface, three steam wisps, and a 3D
                saucer. Drop in instead of the span above if the emoji-in-chip
                ever feels off.
                <svg width="22" height="22" viewBox="0 0 24 24">
                  <title>Hysteresis cycling in progress</title>
                  <path d="M5.5 1.5c-1 1-1 2 0 3s1 2 0 3" fill="none" stroke="#aaa" strokeWidth="1" strokeLinecap="round" />
                  <path d="M10 1c-1 1-1 2 0 3s1 2 0 3" fill="none" stroke="#888" strokeWidth="1" strokeLinecap="round" />
                  <path d="M14.5 1.5c-1 1-1 2 0 3s1 2 0 3" fill="none" stroke="#aaa" strokeWidth="1" strokeLinecap="round" />
                  <path d="M4 9.5h13v7.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9.5z" fill="#1a1a1a" />
                  <path d="M17 11.5h1.5a2.5 2.5 0 0 1 0 5H17" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
                  <ellipse cx="10.5" cy="10" rx="6.5" ry="1.6" fill="#5d3a1a" />
                  <ellipse cx="10.5" cy="9.7" rx="4" ry="0.6" fill="#8b5a2b" opacity="0.6" />
                  <ellipse cx="10.5" cy="22" rx="10" ry="1.8" fill="#1a1a1a" />
                  <ellipse cx="10.5" cy="21.4" rx="8" ry="0.9" fill="#3a3a3a" />
                </svg>
            */}
          </div>
        )}
      </Row>

      <Row>
        <div style={{ ...labelStyle, width: ID_LABEL_W }}>Mode</div>
        <div onContextMenu={e => pvCtx("S29ID:ActualModeM", modeRaw, e)} style={{ ...rbvStyle, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "context-menu" }}>
          {mode}
        </div>
        <select
          aria-label="ID polarization mode"
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

      <Row>
        <div style={{ ...labelStyle, width: ID_LABEL_W }}>QP %</div>
        <div onContextMenu={e => pvCtx("S29ID:QuasiRatioM.RVAL", qpRaw, e)} style={{ ...rbvStyle, textAlign: "right", cursor: "context-menu" }}>
          {qp !== null ? qp.toFixed(1) : "—"}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 9, color: colors.dim, lineHeight: 1.3 }}>
          Set energy after<br />changing polarization
        </div>
      </Row>

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
