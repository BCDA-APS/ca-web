import { useState, useRef, useEffect } from "react";
import { fmt, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";
import { useMotor, type MotorStatus } from "../hooks/useMotor";

interface MotorCardProps {
  /** PV prefix + motor name, e.g. "29idc:m1" */
  pv: string;
  /** Override precision for soft limit display (defaults to PV channel precision) */
  softLimitPrec?: number;
}

const STATUS_BORDER: Record<MotorStatus, string> = {
  "ok":         "2px solid #3a3a3a",
  "moving":     `2px solid ${colors.statusOk}`,
  "soft-limit": `2px solid ${colors.statusWarn}`,
  "hw-limit":   `2px solid ${colors.statusError}`,
  "calibrate":  `2px solid ${colors.statusWarn}`,
  "disabled":   `2px dashed ${colors.statusError}`,
};

const STATUS_LABEL: Partial<Record<MotorStatus, string>> = {
  "moving":     "Moving",
  "soft-limit": "Soft lim",
  "hw-limit":   "HW lim",
  "calibrate":  "Calibrate",
  "disabled":   "Disabled",
};

const STATUS_LABEL_COLOR: Record<MotorStatus, string> = {
  "ok":         "transparent",
  "moving":     colors.statusOk,
  "soft-limit": colors.statusWarn,
  "hw-limit":   colors.statusError,
  "calibrate":  colors.statusWarn,
  "disabled":   colors.statusError,
};

function PositionBar({ rbv, llm, hlm, lls, hls }: {
  rbv: number | null;
  llm: number | null;
  hlm: number | null;
  lls: boolean;
  hls: boolean;
}) {
  const lo = llm ?? 0;
  const hi = hlm ?? 1;
  const range = hi - lo;
  const pct = (range > 0 && rbv !== null)
    ? Math.max(0, Math.min(100, ((rbv - lo) / range) * 100))
    : null;

  return (
    <div style={{ position: "relative", height: 6, background: colors.cardBarBg, borderRadius: 3, margin: "4px 0" }}>
      {lls && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: colors.statusError, borderRadius: "3px 0 0 3px" }} />
      )}
      {hls && (
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, background: colors.statusError, borderRadius: "0 3px 3px 0" }} />
      )}
      {pct !== null && (
        <div style={{
          position: "absolute",
          left: `calc(${pct}% - 4px)`,
          top: -1,
          width: 8,
          height: 8,
          background: colors.cardBarThumb,
          borderRadius: "50%",
          boxShadow: `0 0 3px rgba(144,202,249,0.8)`,
        }} />
      )}
    </div>
  );
}

const PULSE_STYLE = `
@keyframes pulse-border {
  0%   { box-shadow: 0 0 0 0   rgba(76, 175, 80, 0.5); }
  50%  { box-shadow: 0 0 0 4px rgba(76, 175, 80, 0.0); }
  100% { box-shadow: 0 0 0 0   rgba(76, 175, 80, 0.5); }
}
`;

let pulseStyleInjected = false;
function ensurePulseStyle() {
  if (pulseStyleInjected) return;
  pulseStyleInjected = true;
  const el = document.createElement("style");
  el.textContent = PULSE_STYLE;
  document.head.appendChild(el);
}

export function MotorCard({ pv, softLimitPrec }: MotorCardProps) {
  useEffect(() => { ensurePulseStyle(); }, []);
  const m = useMotor(pv);

  const [editingVal, setEditingVal] = useState(false);
  const [valInput, setValInput]     = useState("");
  const valRef = useRef<HTMLInputElement>(null);

  const [editingTwv, setEditingTwv] = useState(false);
  const [twvInput, setTwvInput]     = useState("");
  const twvRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingVal && valRef.current) valRef.current.focus(); }, [editingVal]);
  useEffect(() => { if (editingTwv && twvRef.current) twvRef.current.focus(); }, [editingTwv]);

  function startEdit() {
    if (m.disabled) return;
    setValInput(m.val !== null ? fmt(m.val, m.prec) : "");
    setEditingVal(true);
  }
  function commitVal() {
    const n = parseFloat(valInput);
    if (!isNaN(n)) m.writeVal(n);
    setEditingVal(false);
    setValInput("");
  }
  function cancelVal() { setEditingVal(false); setValInput(""); }

  function commitTwv() {
    const n = parseFloat(twvInput);
    if (!isNaN(n)) m.writeTwv(n);
    setEditingTwv(false);
    setTwvInput("");
  }
  function cancelTwv() { setEditingTwv(false); setTwvInput(""); }

  function startTwvEdit() {
    if (m.disabled) return;
    setTwvInput(m.twv !== null ? String(m.twv) : "");
    setEditingTwv(true);
  }

  function handleTwvKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter")  { commitTwv(); return; }
    if (e.key === "Escape") { cancelTwv(); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const cur = parseFloat(twvInput);
      if (!isNaN(cur)) {
        const next = e.key === "ArrowUp" ? cur * 10 : cur / 10;
        setTwvInput(String(parseFloat(next.toPrecision(4))));
      }
    }
  }

  const twvDisplay = m.twv !== null ? String(m.twv) : "—";
  const opacity = m.connected ? 1 : 0.5;
  const statusLabel = STATUS_LABEL[m.status];
  const statusColor = STATUS_LABEL_COLOR[m.status];

  return (
    <div style={{
      border: STATUS_BORDER[m.status],
      borderRadius: 5,
      background: m.disabled ? colors.cardBgDisabled : colors.cardBg,
      padding: "6px 8px",
      width: 125,
      boxSizing: "border-box",
      opacity,
      display: "flex",
      flexDirection: "column",
      gap: 3,
      transition: "border-color 0.2s",
      animation: m.moving ? "pulse-border 1.2s ease-in-out infinite" : undefined,
    }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.label, fontWeight: 600, color: colors.label, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {m.desc}
        </div>
        {statusLabel && (
          <div style={{ fontSize: fontSize.small, color: statusColor, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
            {statusLabel}
          </div>
        )}
      </div>

      <div
        style={{ ...styles.rbv, borderColor: m.calibrate ? colors.statusWarn : colors.rbvBorder, cursor: "context-menu" }}
        onContextMenu={e => pvCtx(`${pv}.RBV`, m.rbvRaw, e)}
      >
        {m.connected ? fmt(m.rbv, m.prec) : "—"}
      </div>

      {editingVal ? (
        <input
          ref={valRef}
          style={styles.input}
          value={valInput}
          aria-label={`${pv} setpoint`}
          onChange={e => setValInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")  commitVal();
            if (e.key === "Escape") cancelVal();
          }}
          onBlur={cancelVal}
        />
      ) : (
        <div
          style={{ ...styles.val, cursor: m.disabled ? "default" : "text" }}
          title={m.disabled ? "Motor disabled" : "Click to move"}
          onClick={startEdit}
        >
          {m.connected ? fmt(m.val, m.prec) : "—"}
        </div>
      )}

      <PositionBar rbv={m.rbv} llm={m.llm} hlm={m.hlm} lls={m.lls} hls={m.hls} />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#d08030", fontFamily: "monospace" }}>
        <span>{m.llm !== null ? fmt(m.llm, softLimitPrec ?? m.prec) : "—"}</span>
        <span>{m.hlm !== null ? fmt(m.hlm, softLimitPrec ?? m.prec) : "—"}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
        <button
          style={{ ...styles.tweakBtn, flex: "0 0 auto" }}
          onClick={m.tweakBack}
          disabled={m.disabled || !m.connected}
          title="Tweak backward"
        ><span style={{ marginTop: -4 }}>‹</span></button>

        {editingTwv ? (
          <input
            ref={twvRef}
            style={{ ...styles.input, flex: 1, textAlign: "center" }}
            value={twvInput}
            aria-label={`${pv} tweak step`}
            onChange={e => setTwvInput(e.target.value)}
            onKeyDown={handleTwvKey}
            onBlur={cancelTwv}
          />
        ) : (
          <div
            style={{ ...styles.twvDisplay, flex: 1 }}
            title="Click to change step (↑ ×10, ↓ ÷10)"
            onClick={startTwvEdit}
          >
            {twvDisplay}
          </div>
        )}

        <button
          style={{ ...styles.tweakBtn, flex: "0 0 auto" }}
          onClick={m.tweakForward}
          disabled={m.disabled || !m.connected}
          title="Tweak forward"
        ><span style={{ marginTop: -4 }}>›</span></button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rbv: {
    fontFamily: "monospace",
    fontSize: fontSize.mono,
    color: colors.rbvText,
    background: colors.rbvBg,
    border: `1px solid ${colors.rbvBorder}`,
    borderRadius: 3,
    padding: "4px 6px",
    textAlign: "right",
    userSelect: "none",
    transition: "border-color 0.2s",
  },
  val: {
    fontFamily: "monospace",
    fontSize: fontSize.mono,
    color: colors.spText,
    background: colors.spBg,
    border: `1px solid ${colors.spBorder}`,
    borderRadius: 3,
    padding: "4px 6px",
    textAlign: "right",
    userSelect: "none",
  },
  input: {
    background: colors.inputBg,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.spText,
    fontFamily: "monospace",
    fontSize: 13,
    padding: "4px 6px",
    borderRadius: 3,
    width: "100%",
    boxSizing: "border-box",
  },
  tweakBtn: {
    background: colors.tweakBg,
    color: colors.tweakFg,
    border: `1px solid ${colors.tweakBorder}`,
    borderRadius: 3,
    width: 22,
    height: 22,
    fontSize: 16,
    lineHeight: "1",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  twvDisplay: {
    fontFamily: "monospace",
    fontSize: fontSize.label,
    color: colors.spText,
    background: colors.spBg,
    border: `1px solid ${colors.spBorder}`,
    borderRadius: 3,
    padding: "3px 6px",
    textAlign: "center",
    cursor: "text",
    userSelect: "none",
  },
};
