import { useState, useRef, useEffect } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./pvwsWriter";

interface MotorCardRowProps {
  /** PV prefix + motor name, e.g. "29idc:m1" */
  pv: string;
}

// ── PV value extractors (shared logic) ───────────────────────────────────────

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

// ── Status ────────────────────────────────────────────────────────────────────

type Status = "ok" | "moving" | "soft-limit" | "hw-limit" | "calibrate" | "disabled";

function deriveStatus(disabled: boolean, calibrate: boolean, hwLimit: boolean, softLimit: boolean, moving: boolean): Status {
  if (disabled)  return "disabled";
  if (calibrate) return "calibrate";
  if (hwLimit)   return "hw-limit";
  if (softLimit) return "soft-limit";
  if (moving)    return "moving";
  return "ok";
}

const STATUS_BORDER: Record<Status, string> = {
  "ok":         "2px solid #2a4a6a",
  "moving":     "2px solid #4caf50",
  "soft-limit": "2px solid #f9a825",
  "hw-limit":   "2px solid #e53935",
  "calibrate":  "2px solid #f9a825",
  "disabled":   "2px dashed #e53935",
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
  rbv: number | null; llm: number | null; hlm: number | null; lls: boolean; hls: boolean;
}) {
  const lo = llm ?? 0;
  const hi = hlm ?? 1;
  const range = hi - lo;
  const pct = (range > 0 && rbv !== null)
    ? Math.max(0, Math.min(100, ((rbv - lo) / range) * 100))
    : null;

  return (
    <div style={{ position: "relative", height: 5, background: "#2a4a6a", borderRadius: 3 }}>
      {lls && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#e53935", borderRadius: "3px 0 0 3px" }} />}
      {hls && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 3, background: "#e53935", borderRadius: "0 3px 3px 0" }} />}
      {pct !== null && (
        <div style={{
          position: "absolute",
          left: `calc(${pct}% - 4px)`,
          top: -2,
          width: 9,
          height: 9,
          background: "#90caf9",
          borderRadius: "50%",
          boxShadow: "0 0 3px rgba(144,202,249,0.8)",
        }} />
      )}
    </div>
  );
}

// ── MotorCardRow ──────────────────────────────────────────────────────────────

let pulseStyleInjected = false;
function ensurePulseStyle() {
  if (pulseStyleInjected) return;
  pulseStyleInjected = true;
  const el = document.createElement("style");
  el.textContent = `@keyframes pulse-border {
    0%   { box-shadow: 0 0 0 0   rgba(76,175,80,0.5); }
    50%  { box-shadow: 0 0 0 4px rgba(76,175,80,0.0); }
    100% { box-shadow: 0 0 0 0   rgba(76,175,80,0.5); }
  }`;
  document.head.appendChild(el);
}

export function MotorCardRow({ pv }: MotorCardRowProps) {
  useEffect(() => { ensurePulseStyle(); }, []);
  const id = `mcr-${pv}`;

  const [, connected, , descVal]     = useConnection(`${id}-desc`, `ca://${pv}.DESC`);
  const [, ,          , rbvVal]      = useConnection(`${id}-rbv`,  `ca://${pv}.RBV`);
  const [, ,          , valVal]      = useConnection(`${id}-val`,  `ca://${pv}.VAL`);
  const [, ,          , dmovVal]     = useConnection(`${id}-dmov`, `ca://${pv}.DMOV`);
  const [, ,          , lvioVal]     = useConnection(`${id}-lvio`, `ca://${pv}.LVIO`);
  const [, ,          , llsVal]      = useConnection(`${id}-lls`,  `ca://${pv}.LLS`);
  const [, ,          , hlsVal]      = useConnection(`${id}-hls`,  `ca://${pv}.HLS`);
  const [, ,          , setVal]      = useConnection(`${id}-set`,  `ca://${pv}.SET`);
  const [, ableConn,  , ableVal]     = useConnection(`${id}-able`, `ca://${pv}_able.VAL`);
  const [, ,          , llmVal]      = useConnection(`${id}-llm`,  `ca://${pv}.LLM`);
  const [, ,          , hlmVal]      = useConnection(`${id}-hlm`,  `ca://${pv}.HLM`);
  const [, ,          , twvVal]      = useConnection(`${id}-twv`,  `ca://${pv}.TWV`);

  const desc     = toStr(descVal) || pv;
  const rbv      = toDouble(rbvVal);
  const val      = toDouble(valVal);
  const dmov     = (toDouble(dmovVal) ?? 1) !== 0;
  const lvio     = (toDouble(lvioVal) ?? 0) !== 0;
  const lls      = (toDouble(llsVal)  ?? 0) !== 0;
  const hls      = (toDouble(hlsVal)  ?? 0) !== 0;
  const calibrate = (toDouble(setVal) ?? 0) !== 0;
  const ableStr  = toStr(ableVal);
  const disabled = ableConn && ableStr === "Disable";
  const llm      = toDouble(llmVal);
  const hlm      = toDouble(hlmVal);
  const twv      = toDouble(twvVal);

  const moving  = connected && !dmov;
  const hwLimit = lls || hls;
  const status  = deriveStatus(disabled, calibrate, hwLimit, lvio, moving);
  const statusLabel = STATUS_LABEL[status];
  const statusColor = STATUS_LABEL_COLOR[status];

  // VAL editing
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
    setEditingVal(false);
    setValInput("");
  }
  function cancelVal() { setEditingVal(false); setValInput(""); }

  // TWV editing
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
    setEditingTwv(false);
    setTwvInput("");
  }
  function cancelTwv() { setEditingTwv(false); setTwvInput(""); }

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

  return (
    <div style={{
      border: STATUS_BORDER[status],
      borderRadius: 5,
      background: disabled ? "#111e30" : "#1e3a5c",
      padding: "5px 8px",
      boxSizing: "border-box",
      opacity: connected ? 1 : 0.5,
      display: "flex",
      flexDirection: "column",
      gap: 4,
      animation: moving ? "pulse-border 1.2s ease-in-out infinite" : undefined,
    }}>

      {/* Name row */}
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

      {/* Main row: [RBV / VAL] | [tweaks / bar / limits] */}
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>

        {/* Left column: RBV + VAL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: "0 0 auto" }}>
          {/* RBV */}
          <div style={S.rbv}>
            {connected ? fmt(rbv) : "—"}
          </div>
          {/* VAL */}
          {editingVal ? (
            <input
              ref={valRef}
              style={S.input}
              value={valInput}
              onChange={e => setValInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") commitVal(); if (e.key === "Escape") cancelVal(); }}
              onBlur={cancelVal}
            />
          ) : (
            <div
              style={{ ...S.val, cursor: disabled ? "default" : "text", borderColor: calibrate ? "#f9a825" : "#2a5a9a" }}
              title={disabled ? "Motor disabled" : "Click to move"}
              onClick={startEdit}
            >
              {connected ? fmt(val) : "—"}
            </div>
          )}
        </div>

        {/* Right column: tweaks + bar + limits */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
          {/* Tweak row */}
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <button style={S.tweakBtn} onClick={() => !disabled && pvwsWriter.write(`${pv}.TWR`, 1)} disabled={disabled || !connected} title="Tweak backward">‹</button>
            {editingTwv ? (
              <input
                ref={twvRef}
                style={{ ...S.input, flex: 1, textAlign: "center", padding: "2px 4px" }}
                value={twvInput}
                onChange={e => setTwvInput(e.target.value)}
                onKeyDown={handleTwvKey}
                onBlur={cancelTwv}
              />
            ) : (
              <div style={{ ...S.twvDisplay, flex: 1 }} title="Click to change step (↑ ×10, ↓ ÷10)" onClick={startTwvEdit}>
                {twvDisplay}
              </div>
            )}
            <button style={S.tweakBtn} onClick={() => !disabled && pvwsWriter.write(`${pv}.TWF`, 1)} disabled={disabled || !connected} title="Tweak forward">›</button>
          </div>

          {/* Position bar */}
          <PositionBar rbv={rbv} llm={llm} hlm={hlm} lls={lls} hls={hls} />

          {/* Soft limits */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#d08030", fontFamily: "monospace" }}>
            <span>{llm !== null ? fmt(llm, 3) : "—"}</span>
            <span>{hlm !== null ? fmt(hlm, 3) : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  rbv: {
    fontFamily: "monospace",
    fontSize: 13,
    color: "#90caf9",
    background: "#1a2a3a",
    border: "1px solid #2a3a4a",
    borderRadius: 3,
    padding: "3px 6px",
    textAlign: "right",
    width: 80,
    boxSizing: "border-box",
  },
  val: {
    fontFamily: "monospace",
    fontSize: 13,
    color: "#fff",
    background: "#1a3258",
    border: "1px solid #2a5a9a",
    borderRadius: 3,
    padding: "3px 6px",
    textAlign: "right",
    width: 80,
    boxSizing: "border-box",
    cursor: "text",
    userSelect: "none",
  },
  input: {
    background: "#1a3a4a",
    border: "1px solid #4a90d9",
    color: "#fff",
    fontFamily: "monospace",
    fontSize: 12,
    padding: "3px 6px",
    borderRadius: 3,
    width: 80,
    boxSizing: "border-box",
  },
  tweakBtn: {
    background: "#2060a0",
    color: "#cce0ff",
    border: "1px solid #1a4a7a",
    borderRadius: 3,
    width: 24,
    height: 24,
    fontSize: 16,
    lineHeight: "1",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
  twvDisplay: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#90caf9",
    background: "#1a2a3a",
    border: "1px solid #2a3a4a",
    borderRadius: 3,
    padding: "2px 4px",
    textAlign: "center",
    cursor: "text",
    userSelect: "none",
  },
};
