import { useState, useRef, useEffect } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./pvwsWriter";

interface MotorCardProps {
  /** PV prefix + motor name, e.g. "29idc:m1" */
  pv: string;
}

// ── PV value extractors ───────────────────────────────────────────────────────

function toDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number; stringValue?: string } }).value;
  if (val?.doubleValue !== undefined) return val.doubleValue;
  if (val?.stringValue !== undefined) {
    const n = parseFloat(val.stringValue);
    return isNaN(n) ? null : n;
  }
  return null;
}

function toStr(d: unknown): string | null {
  if (!d) return null;
  const val = (d as { value?: { stringValue?: string; doubleValue?: number } }).value;
  if (val?.stringValue !== undefined && val.stringValue !== "") return val.stringValue;
  if (val?.doubleValue !== undefined) return String(val.doubleValue);
  return null;
}

function fmt(n: number | null, prec = 4): string {
  if (n === null) return "—";
  return n.toFixed(prec);
}

// ── Status derivation ─────────────────────────────────────────────────────────

type Status = "ok" | "moving" | "soft-limit" | "hw-limit" | "calibrate" | "disabled";

function deriveStatus(
  disabled: boolean,
  calibrate: boolean,
  hwLimit: boolean,
  softLimit: boolean,
  moving: boolean,
): Status {
  if (disabled)   return "disabled";
  if (calibrate)  return "calibrate";
  if (hwLimit)    return "hw-limit";
  if (softLimit)  return "soft-limit";
  if (moving)     return "moving";
  return "ok";
}

const STATUS_BORDER: Record<Status, string> = {
  "ok":         "1px solid #3a3a3a",
  "moving":     "2px solid #4caf50",
  "soft-limit": "2px solid #f9a825",
  "hw-limit":   "2px solid #e53935",
  "calibrate":  "2px solid #f9a825",
  "disabled":   "1px dashed #e53935",
};

const STATUS_LABEL: Partial<Record<Status, string>> = {
  "moving":     "Moving",
  "soft-limit": "Soft lim",
  "hw-limit":   "HW lim",
  "calibrate":  "Calibrate",
  "disabled":   "Disabled",
};

const STATUS_LABEL_COLOR: Record<Status, string> = {
  "ok":         "transparent",
  "moving":     "#4caf50",
  "soft-limit": "#f9a825",
  "hw-limit":   "#e53935",
  "calibrate":  "#f9a825",
  "disabled":   "#e53935",
};

// ── PositionBar ───────────────────────────────────────────────────────────────

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
    <div style={{ position: "relative", height: 6, background: "#2a4a6a", borderRadius: 3, margin: "4px 0" }}>
      {/* left HW limit red cap */}
      {lls && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "#e53935", borderRadius: "3px 0 0 3px" }} />
      )}
      {/* right HW limit red cap */}
      {hls && (
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, background: "#e53935", borderRadius: "0 3px 3px 0" }} />
      )}
      {/* position thumb */}
      {pct !== null && (
        <div style={{
          position: "absolute",
          left: `calc(${pct}% - 4px)`,
          top: -1,
          width: 8,
          height: 8,
          background: "#90caf9",
          borderRadius: "50%",
          boxShadow: "0 0 3px rgba(144,202,249,0.8)",
        }} />
      )}
    </div>
  );
}

// ── MotorCard ─────────────────────────────────────────────────────────────────

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

export function MotorCard({ pv }: MotorCardProps) {
  useEffect(() => { ensurePulseStyle(); }, []);
  const id = `mc-${pv}`;

  // Subscriptions
  const [, connected, , descVal]  = useConnection(`${id}-desc`,  `ca://${pv}.DESC`);
  const [, ,         , rbvVal]    = useConnection(`${id}-rbv`,   `ca://${pv}.RBV`);
  const [, ,         , dmovVal]   = useConnection(`${id}-dmov`,  `ca://${pv}.DMOV`);
  const [, ,         , lvioVal]   = useConnection(`${id}-lvio`,  `ca://${pv}.LVIO`);
  const [, ,         , llsVal]    = useConnection(`${id}-lls`,   `ca://${pv}.LLS`);
  const [, ,         , hlsVal]    = useConnection(`${id}-hls`,   `ca://${pv}.HLS`);
  const [, ,         , setVal]    = useConnection(`${id}-set`,   `ca://${pv}.SET`);
  const [, ableConnected, , ableVal] = useConnection(`${id}-able`, `ca://${pv}_able.VAL`);
  const [, ,         , llmVal]    = useConnection(`${id}-llm`,   `ca://${pv}.LLM`);
  const [, ,         , hlmVal]    = useConnection(`${id}-hlm`,   `ca://${pv}.HLM`);
  const [, ,         , valVal]    = useConnection(`${id}-val`,   `ca://${pv}.VAL`);
  const [, ,         , twvVal]    = useConnection(`${id}-twv`,   `ca://${pv}.TWV`);

  // Derived values
  const desc     = toStr(descVal) || pv;
  const rbv      = toDouble(rbvVal);
  const dmov     = (toDouble(dmovVal) ?? 1) !== 0; // 1 = done, 0 = moving
  const lvio     = (toDouble(lvioVal) ?? 0) !== 0;
  const lls      = (toDouble(llsVal)  ?? 0) !== 0;
  const hls      = (toDouble(hlsVal)  ?? 0) !== 0;
  const calibrate = (toDouble(setVal) ?? 0) !== 0;
  // _able is a BO enum: "Enable"=0 (motor ok), "Disable"=1 (motor disabled)
  // Use the string label so we're not sensitive to the numeric encoding.
  const ableStr  = toStr(ableVal);
  const disabled = ableConnected && ableStr === "Disable";
  const val      = toDouble(valVal);
  const llm      = toDouble(llmVal);
  const hlm      = toDouble(hlmVal);
  const twv      = toDouble(twvVal);

  const moving   = connected && !dmov;
  const hwLimit  = lls || hls;
  const status   = deriveStatus(disabled, calibrate, hwLimit, lvio, moving);

  // Setpoint editing
  const [editingVal, setEditingVal] = useState(false);
  const [valInput, setValInput]     = useState("");
  const valRef = useRef<HTMLInputElement>(null);

  // Tweak step editing
  const [editingTwv, setEditingTwv] = useState(false);
  const [twvInput, setTwvInput]     = useState("");
  const twvRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingVal && valRef.current) valRef.current.focus();
  }, [editingVal]);

  useEffect(() => {
    if (editingTwv && twvRef.current) twvRef.current.focus();
  }, [editingTwv]);

  function startEdit() {
    if (disabled) return;
    setValInput(val !== null ? fmt(val) : "");
    setEditingVal(true);
  }

  function commitVal() {
    const n = parseFloat(valInput);
    if (!isNaN(n)) pvwsWriter.write(`${pv}.VAL`, n);
    setEditingVal(false);
    setValInput("");
  }

  function cancelVal() {
    setEditingVal(false);
    setValInput("");
  }

  function commitTwv() {
    const n = parseFloat(twvInput);
    if (!isNaN(n)) pvwsWriter.write(`${pv}.TWV`, n);
    setEditingTwv(false);
    setTwvInput("");
  }

  function cancelTwv() {
    setEditingTwv(false);
    setTwvInput("");
  }

  function startTwvEdit() {
    if (disabled) return;
    setTwvInput(twv !== null ? String(twv) : "");
    setEditingTwv(true);
  }

  function tweakBack()    { if (!disabled) pvwsWriter.write(`${pv}.TWR`, 1); }
  function tweakForward() { if (!disabled) pvwsWriter.write(`${pv}.TWF`, 1); }

  // Arrow keys on TWV: ↑ × 10, ↓ ÷ 10
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

  const twvDisplay = twv !== null ? String(twv) : "—";
  const opacity = connected ? 1 : 0.5;
  const cardBorder = STATUS_BORDER[status];
  const statusLabel = STATUS_LABEL[status];
  const statusColor = STATUS_LABEL_COLOR[status];

  return (
    <div style={{
      border: cardBorder,
      borderRadius: 5,
      background: disabled ? "#111e30" : "#1e3a5c",
      padding: "6px 8px",
      width: 150,
      boxSizing: "border-box",
      opacity,
      display: "flex",
      flexDirection: "column",
      gap: 3,
      transition: "border-color 0.2s",
      animation: moving ? "pulse-border 1.2s ease-in-out infinite" : undefined,
    }}>

      {/* Motor name + status on same line */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#cce0ff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {desc}
        </div>
        {statusLabel && (
          <div style={{ fontSize: 10, color: statusColor, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
            {statusLabel}
          </div>
        )}
      </div>

      {/* RBV — read-only readback */}
      <div style={{ ...styles.rbv, borderColor: calibrate ? "#f9a825" : "#2a3a4a" }}>
        {connected ? fmt(rbv) : "—"}
      </div>

      {/* VAL — editable setpoint */}
      {editingVal ? (
        <input
          ref={valRef}
          style={styles.input}
          value={valInput}
          onChange={e => setValInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")  commitVal();
            if (e.key === "Escape") cancelVal();
          }}
          onBlur={cancelVal}
        />
      ) : (
        <div
          style={{ ...styles.val, cursor: disabled ? "default" : "text" }}
          title={disabled ? "Motor disabled" : "Click to move"}
          onClick={startEdit}
        >
          {connected ? fmt(val) : "—"}
        </div>
      )}

      {/* Position bar */}
      <PositionBar rbv={rbv} llm={llm} hlm={hlm} lls={lls} hls={hls} />

      {/* Soft limits */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#d08030", fontFamily: "monospace" }}>
        <span>{llm !== null ? fmt(llm, 3) : "—"}</span>
        <span>{hlm !== null ? fmt(hlm, 3) : "—"}</span>
      </div>


      {/* Tweak row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
        <button
          style={{ ...styles.tweakBtn, flex: "0 0 auto" }}
          onClick={tweakBack}
          disabled={disabled || !connected}
          title="Tweak backward"
        >
          ‹
        </button>

        {editingTwv ? (
          <input
            ref={twvRef}
            style={{ ...styles.input, flex: 1, textAlign: "center" }}
            value={twvInput}
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
          onClick={tweakForward}
          disabled={disabled || !connected}
          title="Tweak forward"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  rbv: {
    fontFamily: "monospace",
    fontSize: 14,
    color: "#80deea",
    background: "#1a2a3a",
    border: "1px solid #2a3a4a",
    borderRadius: 3,
    padding: "4px 6px",
    textAlign: "right",
    userSelect: "none",
    transition: "border-color 0.2s",
  },
  val: {
    fontFamily: "monospace",
    fontSize: 14,
    color: "#fff",
    background: "#1a3258",
    border: "1px solid #2a5a9a",
    borderRadius: 3,
    padding: "4px 6px",
    textAlign: "right",
    userSelect: "none",
  },
  input: {
    background: "#1a3a4a",
    border: "1px solid #4a90d9",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 13,
    padding: "4px 6px",
    borderRadius: 3,
    width: "100%",
    boxSizing: "border-box",
  },
  tweakBtn: {
    background: "#2060a0",
    color: "#cce0ff",
    border: "1px solid #1a4a7a",
    borderRadius: 3,
    width: 28,
    height: 28,
    fontSize: 18,
    lineHeight: "1",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  twvDisplay: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#90caf9",
    background: "#1a2a3a",
    border: "1px solid #2a3a4a",
    borderRadius: 3,
    padding: "3px 6px",
    textAlign: "center",
    cursor: "text",
    userSelect: "none",
  },
};
