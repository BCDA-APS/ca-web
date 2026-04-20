import { useState, useRef, useEffect } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../lib/pvwsWriter";
import { toDouble, toStr, fmt } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";

interface MotorCardFlatProps {
  pv: string;
}

type Status = "ok" | "moving" | "soft-limit" | "hw-limit" | "disabled";

const STATUS_BORDER: Record<Status, string> = {
  "ok":         `2px solid ${colors.cardBarBg}`,
  "moving":     `2px solid ${colors.statusOk}`,
  "soft-limit": `2px solid ${colors.statusWarn}`,
  "hw-limit":   `2px solid ${colors.statusError}`,
  "disabled":   `2px dashed ${colors.statusError}`,
};

let pulseInjected = false;
function ensurePulse() {
  if (pulseInjected) return;
  pulseInjected = true;
  const el = document.createElement("style");
  el.textContent = `@keyframes pulse-border {
    0%,100% { box-shadow: 0 0 0 0   rgba(76,175,80,0.5); }
    50%      { box-shadow: 0 0 0 4px rgba(76,175,80,0.0); }
  }`;
  document.head.appendChild(el);
}

export function MotorCardFlat({ pv }: MotorCardFlatProps) {
  useEffect(() => { ensurePulse(); }, []);
  const id = `mcf-${pv}`;

  const [, connected, , descVal]  = useConnection(`${id}-desc`, `ca://${pv}.DESC`);
  const [, ,          , rbvVal]   = useConnection(`${id}-rbv`,  `ca://${pv}.RBV`);
  const [, ,          , valVal]   = useConnection(`${id}-val`,  `ca://${pv}.VAL`);
  const [, ,          , dmovVal]  = useConnection(`${id}-dmov`, `ca://${pv}.DMOV`);
  const [, ,          , lvioVal]  = useConnection(`${id}-lvio`, `ca://${pv}.LVIO`);
  const [, ,          , llsVal]   = useConnection(`${id}-lls`,  `ca://${pv}.LLS`);
  const [, ,          , hlsVal]   = useConnection(`${id}-hls`,  `ca://${pv}.HLS`);
  const [, ableConn,  , ableVal]  = useConnection(`${id}-able`, `ca://${pv}_able.VAL`);
  const [, ,          , twvVal]   = useConnection(`${id}-twv`,  `ca://${pv}.TWV`);

  const desc     = toStr(descVal) || pv;
  const rbv      = toDouble(rbvVal);
  const val      = toDouble(valVal);
  const moving   = connected && (toDouble(dmovVal) ?? 1) === 0;
  const softLim  = (toDouble(lvioVal) ?? 0) !== 0;
  const hwLim    = (toDouble(llsVal) ?? 0) !== 0 || (toDouble(hlsVal) ?? 0) !== 0;
  const disabled = ableConn && toStr(ableVal) === "Disable";
  const twv      = toDouble(twvVal);

  const status: Status = disabled ? "disabled" : hwLim ? "hw-limit" : softLim ? "soft-limit" : moving ? "moving" : "ok";

  const [editingVal, setEditingVal] = useState(false);
  const [valInput, setValInput]     = useState("");
  const valRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingVal) valRef.current?.focus(); }, [editingVal]);

  function startEdit() {
    if (disabled) return;
    setValInput(val !== null ? fmt(val) : "");
    setEditingVal(true);
  }
  function commitVal() {
    const n = parseFloat(valInput);
    if (!isNaN(n)) pvwsWriter.write(`${pv}.VAL`, n);
    setEditingVal(false); setValInput("");
  }
  function cancelVal() { setEditingVal(false); setValInput(""); }

  const [editingTwv, setEditingTwv] = useState(false);
  const [twvInput, setTwvInput]     = useState("");
  const twvRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editingTwv) twvRef.current?.focus(); }, [editingTwv]);

  function startTwvEdit() {
    if (disabled) return;
    setTwvInput(twv !== null ? String(twv) : "");
    setEditingTwv(true);
  }
  function commitTwv() {
    const n = parseFloat(twvInput);
    if (!isNaN(n)) pvwsWriter.write(`${pv}.TWV`, n);
    setEditingTwv(false); setTwvInput("");
  }
  function cancelTwv() { setEditingTwv(false); setTwvInput(""); }
  function handleTwvKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter")  { commitTwv(); return; }
    if (e.key === "Escape") { cancelTwv(); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = parseFloat(twvInput);
      if (!isNaN(cur)) setTwvInput(String(parseFloat((e.key === "ArrowUp" ? cur * 10 : cur / 10).toPrecision(4))));
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 4,
      border: STATUS_BORDER[status],
      borderRadius: 4,
      background: disabled ? colors.cardBgDisabled : colors.cardBg,
      padding: "3px 6px",
      opacity: connected ? 1 : 0.5,
      animation: moving ? "pulse-border 1.2s ease-in-out infinite" : undefined,
    }}>

      {/* Name */}
      <div style={{ fontSize: fontSize.label, fontWeight: 600, color: colors.label, width: 70, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>
        {desc}
      </div>

      {/* VAL */}
      {editingVal ? (
        <input ref={valRef} style={{ ...S.field, ...S.valField }} value={valInput}
          onChange={e => setValInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commitVal(); if (e.key === "Escape") cancelVal(); }}
          onBlur={cancelVal} />
      ) : (
        <div style={{ ...S.field, ...S.valField, cursor: disabled ? "default" : "text" }}
          title={disabled ? "Motor disabled" : "Click to move"} onClick={startEdit}>
          {connected ? fmt(val) : "—"}
        </div>
      )}

      {/* RBV */}
      <div style={{ ...S.field, ...S.rbvField }}>{connected ? fmt(rbv) : "—"}</div>

      {/* Tweak */}
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
        <button style={S.tweakBtn} onClick={() => !disabled && pvwsWriter.write(`${pv}.TWR`, 1)} disabled={disabled || !connected}>‹</button>
        {editingTwv ? (
          <input ref={twvRef} style={{ ...S.field, width: 60, textAlign: "center", padding: "2px 4px" }}
            value={twvInput} onChange={e => setTwvInput(e.target.value)}
            onKeyDown={handleTwvKey} onBlur={cancelTwv} />
        ) : (
          <div style={{ ...S.field, ...S.twvField }} title="Click to change step (↑ ×10, ↓ ÷10)" onClick={startTwvEdit}>
            {twv !== null ? String(twv) : "—"}
          </div>
        )}
        <button style={S.tweakBtn} onClick={() => !disabled && pvwsWriter.write(`${pv}.TWF`, 1)} disabled={disabled || !connected}>›</button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  field: {
    fontFamily: "monospace",
    fontSize: 12,
    borderRadius: 3,
    padding: "2px 6px",
    border: `1px solid ${colors.rbvBorder}`,
    background: colors.rbvBg,
    color: colors.rbvText,
    boxSizing: "border-box",
  },
  valField: {
    background: colors.spBg,
    border: `1px solid ${colors.spBorder}`,
    color: colors.spText,
    width: 80,
    textAlign: "right",
    cursor: "text",
    userSelect: "none",
  },
  rbvField: {
    width: 80,
    textAlign: "right",
  },
  twvField: {
    width: 60,
    textAlign: "center",
    cursor: "text",
    userSelect: "none",
  },
  tweakBtn: {
    background: colors.tweakBg,
    color: colors.tweakFg,
    border: `1px solid ${colors.tweakBorder}`,
    borderRadius: 3,
    width: 22,
    height: 22,
    fontSize: 15,
    lineHeight: "1",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
};
