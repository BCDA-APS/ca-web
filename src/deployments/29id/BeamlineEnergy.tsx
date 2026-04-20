import { useState, useRef, useEffect } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../lib/pvwsWriter";

function pvCtx(pvName: string, rawData: unknown, e: React.MouseEvent) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("pv-context", { detail: { pvName, rawData, x: e.clientX, y: e.clientY } }));
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function toDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number; floatValue?: number; intValue?: number; stringValue?: string } }).value;
  if (val?.doubleValue !== undefined) return val.doubleValue;
  if (val?.floatValue  !== undefined) return val.floatValue;
  if (val?.intValue    !== undefined) return val.intValue;
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

function fmt(n: number | null, prec = 3): string {
  return n === null ? "—" : n.toFixed(prec);
}

function toBool(d: unknown): boolean {
  // Check string label first — EPICS enum records can have 0="On" (reversed convention)
  const s = toStr(d);
  if (s !== null) {
    const l = s.toLowerCase().trim();
    if (l === "on"  || l === "1" || l === "true")  return true;
    if (l === "off" || l === "0" || l === "false") return false;
  }
  const n = toDouble(d);
  return n !== null && n !== 0;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FW  = 110;                      // field width
const UW  = 32;                       // unit column width
const FONT = 14;
const TWV_W = FW - 2 * 24 - 2 * 4;  // tweak value width = 54px

// ── Shared styles ─────────────────────────────────────────────────────────────

const rbvStyle: React.CSSProperties = {
  fontFamily: "monospace", fontSize: FONT, color: "#80deea",
  background: "#1a2a3a", border: "1px solid #2a3a4a", borderRadius: 3,
  padding: "4px 6px", width: FW, textAlign: "right",
  boxSizing: "border-box", flexShrink: 0,
};

const spDisplayStyle: React.CSSProperties = {
  fontFamily: "monospace", fontSize: FONT, color: "#fff",
  background: "#1a3258", border: "1px solid #2a5a9a", borderRadius: 3,
  padding: "4px 6px", width: FW, textAlign: "right",
  cursor: "text", userSelect: "none", boxSizing: "border-box", flexShrink: 0,
};

const spEditStyle: React.CSSProperties = {
  fontFamily: "monospace", fontSize: FONT, background: "#1a3a4a",
  border: "1px solid #4a90d9", color: "#fff", borderRadius: 3,
  padding: "4px 6px", width: FW, boxSizing: "border-box", flexShrink: 0,
};

const tweakBtnStyle: React.CSSProperties = {
  background: "#2060a0", color: "#cce0ff", border: "1px solid #1a4a7a",
  borderRadius: 3, width: 24, height: 24, fontSize: 16, lineHeight: "1",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, flexShrink: 0,
};

const twvStyle: React.CSSProperties = {
  fontFamily: "monospace", fontSize: 11, color: "#90caf9",
  background: "#1a2a3a", border: "1px solid #2a3a4a", borderRadius: 3,
  padding: "2px 4px", textAlign: "center", cursor: "text", userSelect: "none",
  width: TWV_W, flexShrink: 0, boxSizing: "border-box",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
  color: "#7c6fa0", marginBottom: 6, borderBottom: "1px solid #2a1a4a", paddingBottom: 3,
};

const unitStyle: React.CSSProperties = {
  fontSize: 11, color: "#7a9ab8", width: UW, flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "#cce0ff", textAlign: "right", flexShrink: 0,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RbvBox({ value, prec = 3 }: { value: number | null; prec?: number }) {
  return <div style={rbvStyle}>{fmt(value, prec)}</div>;
}

function SpBox({ value, prec = 3, onCommit }: {
  value: number | null; prec?: number; onCommit: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function start() { setInput(value !== null ? fmt(value, prec) : ""); setEditing(true); }
  function commit() { const n = parseFloat(input); if (!isNaN(n)) onCommit(n); setEditing(false); }

  return editing ? (
    <input ref={ref} value={input}
      onChange={e => setInput(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      onBlur={() => setEditing(false)}
      style={spEditStyle}
    />
  ) : (
    <div onClick={start} title="Click to set" style={spDisplayStyle}>
      {value !== null ? fmt(value, prec) : "—"}
    </div>
  );
}

function TweakValue({ value, onCommit }: { value: number | null; onCommit: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  function start() { setInput(value !== null ? String(value) : ""); setEditing(true); }
  function commit() { const n = parseFloat(input); if (!isNaN(n)) onCommit(n); setEditing(false); }

  return editing ? (
    <input ref={ref} value={input}
      onChange={e => setInput(e.target.value)}
      onKeyDown={e => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const cur = parseFloat(input);
          if (!isNaN(cur)) setInput(String(parseFloat((e.key === "ArrowUp" ? cur * 10 : cur / 10).toPrecision(4))));
        }
      }}
      onBlur={() => setEditing(false)}
      style={{ ...twvStyle, cursor: "auto" } as React.CSSProperties}
    />
  ) : (
    <div onClick={start} title="Click to change step (↑ ×10, ↓ ÷10)" style={{ ...twvStyle, cursor: "text" }}>
      {value !== null ? String(value) : "—"}
    </div>
  );
}

function Badge({ label, color = "#90caf9", bg = "#1a2a4a", border = "#3a5a9a" }: {
  label: string; color?: string; bg?: string; border?: string;
}) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
      background: bg, border: `1px solid ${border}`, color, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

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

// ── Row layout helper ─────────────────────────────────────────────────────────

function Row({ children, mt = 0, onContextMenu }: { children: React.ReactNode; mt?: number; onContextMenu?: (e: React.MouseEvent) => void }) {
  return (
    <div onContextMenu={onContextMenu} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, marginTop: mt }}>
      {children}
    </div>
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

  function openRingInfo() {
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file: "/ui/29id/29id_BL_ring_info.ui", macros: {}, label: "Ring Info" },
    }));
  }

  function openEnergyMore() {
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file: "/ui/29id/29id_BL_Energy_more.ui", macros: { P: "S29ID:" }, label: "Energy More" },
    }));
  }

  // Each row: [field FW=110] [unit UW=32] [badge/status auto]
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={sectionHeaderStyle}>Mono</div>

      {/* Row 1: RBV | eV | Ready/Moving */}
      <Row onContextMenu={e => pvCtx("29idmono:ENERGY_MON", rbvRaw, e)}>
        <RbvBox value={rbv} prec={2} />
        <span style={unitStyle}>eV</span>
        <span style={{ fontSize: 10, color: ready ? "#4caf50" : "#f9a825", whiteSpace: "nowrap" }}>
          ● {ready ? "Ready" : "Moving"}
        </span>
      </Row>

      {/* Row 2: SP | eV | Grating badge */}
      <Row onContextMenu={e => pvCtx("29idmono:ENERGY_SP", spRaw, e)}>
        <SpBox value={sp} prec={3} onCommit={n => pvwsWriter.write("29idmono:ENERGY_SP", n)} />
        <span style={unitStyle}>eV</span>
        <div style={{ minWidth: 40 }}>
          {gLabel
            ? <span style={{ fontSize: 12, fontWeight: 700, color: "#90caf9" }}>{gLabel}</span>
            : <span style={{ fontSize: 10, color: "#546e8a" }}>—</span>}
        </div>
      </Row>

      {/* Row 3: Tweak ‹›  | eV | Mirror badge */}
      <Row onContextMenu={e => pvCtx("29id:MonoEnergyTweakValue", twvRaw, e)}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, width: FW, flexShrink: 0 }}>
          <button onClick={() => pvwsWriter.write("29id:MonoEnergyTweakDec.PROC", 1)}
            style={tweakBtnStyle} disabled={!conn}>‹</button>
          <TweakValue value={twv} onCommit={n => pvwsWriter.write("29id:MonoEnergyTweakValue", n)} />
          <button onClick={() => pvwsWriter.write("29id:MonoEnergyTweakInc.PROC", 1)}
            style={tweakBtnStyle} disabled={!conn}>›</button>
        </div>
        <span style={unitStyle}>eV</span>
        <div style={{ minWidth: 40 }}>
          {mLabel ? <span style={{ fontSize: 12, fontWeight: 700, color: "#ffa726" }}>{mLabel}</span> : null}
        </div>
      </Row>

      {/* Row 4: STOP | ⚙ | Temp alarm */}
      <Row mt={2}>
        <button
          onClick={() => pvwsWriter.write("29idmono:STOP_CMD.PROC", 1)}
          style={{
            background: "#7f1d1d", color: "#fecaca", border: "1px solid #ef5350",
            borderRadius: 3, padding: "3px 0", fontSize: 11, cursor: "pointer",
            width: FW, boxSizing: "border-box", flexShrink: 0,
          }}
        >STOP</button>
        <button onClick={openEnergyMore} title="Energy settings"
          style={{
            width: 23, height: 23, flexShrink: 0,
            background: "#0d2a4a", border: "1px solid #2a5a9a",
            color: "#90caf9", cursor: "pointer", fontSize: 14,
            borderRadius: 3, padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          ⚙
        </button>
        <div>
          {tempAlarm && (
            <span title="Temperature alarm!" style={{ fontSize: 11, color: "#ef5350", whiteSpace: "nowrap" }}>
              🌡 Temp!
            </span>
          )}
        </div>
      </Row>

      {/* Row 5: Ring current | mA | Ring Info button */}
      <Row mt={2} onContextMenu={e => pvCtx("S-DCCT:CurrentM", rngRaw, e)}>
        <RbvBox value={ring} prec={1} />
        <span style={unitStyle}>mA</span>
        <button
          onClick={openRingInfo}
          style={{
            background: "#0d2a4a", border: "1px solid #2a5a9a", color: "#90caf9",
            borderRadius: 3, fontSize: 11, fontFamily: "sans-serif",
            padding: "1px 6px", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >Ring Info</button>
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

  const rbv    = toDouble(rbvRaw);
  const sp     = toDouble(spRaw);
  const mode   = toStr(modeRaw) ?? "—";
  const modeIdx = toDouble(modeRaw);
  const des        = toDouble(desRaw);
  const desChoices = (desRaw as { display?: { choices?: string[] } })?.display?.choices;
  const qp     = toDouble(qpRaw);
  const on     = toBool(onRaw);
  const fb     = toStr(fbRaw) ?? "—";
  const busy   = (toDouble(busyRaw) ?? 0) !== 0;  // 0=Done, 1=Busy
  const hyst   = toDouble(hystRaw);
  const hystUp = hyst !== null && hyst !== 0;

  const desIdx = des !== null ? Math.round(des) : -1;

  // coffee cup: C=0 AND A=1 AND (B=0 OR B=1 OR B=3 OR B=4)
  // A=userCalcOut4 (hystUp), B=ActualModeM, C=BusyRecordM
  const showCoffee = !busy && hystUp && modeIdx !== null && [0, 1, 3, 4].includes(Math.round(modeIdx));

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={sectionHeaderStyle}>ID</div>

      {/* Row 1: On/Off | RBV keV | keV | Busy dot */}
      <Row onContextMenu={e => pvCtx("S29ID:EnergyM.VAL", rbvRaw, e)}>
        <div style={{ width: ID_LABEL_W, flexShrink: 0, textAlign: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: on ? "#4caf50" : "#ef5350" }}>
            {on ? "On" : "Off"}
          </span>
        </div>
        <RbvBox value={rbv} prec={4} />
        <span style={unitStyle}>keV</span>
        <span style={{ fontSize: 10, color: busy ? "#f9a825" : "#4caf50", whiteSpace: "nowrap" }}>
          ● {busy ? "Busy" : "Done"}
        </span>
      </Row>

      {/* Row 2: Ramp | SP keV | keV | Arrow + coffee */}
      <Row onContextMenu={e => pvCtx("S29ID:EnergySetC.VAL", spRaw, e)}>
        <div style={{ width: ID_LABEL_W, flexShrink: 0, alignSelf: "stretch" }}>
          <button
            onClick={() => pvwsWriter.write("S29ID:StartRampC.VAL", 1)}
            disabled={!conn}
            style={{
              background: "#1a4a1a", color: "#a5d6a7", border: "1px solid #4caf50",
              borderRadius: 3, fontSize: 11, cursor: "pointer",
              width: "100%", height: "100%",
            }}
          >Ramp</button>
        </div>
        <SpBox value={sp} prec={4} onCommit={n => pvwsWriter.write("S29ID:EnergySetC.VAL", n)} />
        <span style={unitStyle}>keV</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <span style={{ fontSize: 22, color: "#90caf9", lineHeight: 1 }} title={`ID hysteresis: ${hystUp ? "up" : "down"}`}>
            {hystUp ? "↑" : "↓"}
          </span>
          {showCoffee && (
            <span title="Hysteresis cycling in progress" style={{ fontSize: 20 }}>☕</span>
          )}
        </div>
      </Row>

      {/* Row 3: Mode label | ActualModeM RBV | DesiredModeC menu (flex) */}
      <Row onContextMenu={e => pvCtx("S29ID:ActualModeM", modeRaw, e)}>
        <div style={{ ...labelStyle, width: ID_LABEL_W }}>Mode</div>
        <div style={{ ...rbvStyle, textAlign: "left", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mode}
        </div>
        <select
          value={desIdx >= 0 ? desIdx : ""}
          onChange={e => pvwsWriter.write("S29ID:DesiredModeC.VAL", Number(e.target.value))}
          style={{
            flex: 1, minWidth: 0,
            background: "#1a3258", color: "#fff", border: "1px solid #2a5a9a",
            borderRadius: 3, fontSize: 12, padding: "4px 4px", cursor: "pointer",
          }}
        >
          {(desChoices ?? []).map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
      </Row>

      {/* Row 4: QP% label | QP RBV | "set energy" hint (flex) */}
      <Row onContextMenu={e => pvCtx("S29ID:QuasiRatioM.RVAL", qpRaw, e)}>
        <div style={{ ...labelStyle, width: ID_LABEL_W }}>QP %</div>
        <div style={{ ...rbvStyle, textAlign: "right" }}>
          {qp !== null ? qp.toFixed(1) : "—"}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 9, color: "#cce0ff", lineHeight: 1.3 }}>
          Set energy after<br />changing polarization
        </div>
      </Row>

      {/* Row 5: Done label | feedbackM spanning rest */}
      <Row onContextMenu={e => pvCtx("S29ID:feedbackM.VAL", fbRaw, e)}>
        <div style={{ ...rbvStyle, width: ID_LABEL_W, textAlign: "center", fontSize: 11, padding: "3px 6px" }}>
          {toStr(busyRaw) ?? "—"}
        </div>
        <div style={{
          flex: 1, minWidth: 0,
          fontFamily: "monospace", fontSize: 11, color: "#80deea",
          background: "#1a2a3a", border: "1px solid #2a3a4a", borderRadius: 3,
          padding: "3px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          boxSizing: "border-box",
        }}>
          {fb}
        </div>
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
