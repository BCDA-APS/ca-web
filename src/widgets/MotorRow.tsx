import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../lib/pvwsWriter";
import { toDouble, toStr } from "../lib/epics";
import { colors } from "../lib/theme";

interface DisplayItem {
  label: string;
  file: string;
}

interface MotorRowProps {
  label: string;
  pv: string;
  displays?: DisplayItem[];
  macros?: Record<string, string>;
}

export function MotorRow({ label, pv, displays, macros }: MotorRowProps) {
  const id = `motor-${pv}`;
  const [, connected, , rbvValue]  = useConnection(`${id}-rbv`,  `ca://${pv}.RBV`);
  const [, , ,          dmovValue] = useConnection(`${id}-dmov`, `ca://${pv}.DMOV`);
  const [, , ,          descValue] = useConnection(`${id}-desc`, `ca://${pv}.DESC`);
  const [, , ,          twvValue]  = useConnection(`${id}-twv`,  `ca://${pv}.TWV`);

  const [editing, setEditing]             = useState(false);
  const [setpointInput, setSetpointInput] = useState("");
  const [editingTweak, setEditingTweak]   = useState(false);
  const [tweakInput, setTweakInput]       = useState("");

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const position = toDouble(rbvValue);
  const dmov     = (toDouble(dmovValue) ?? 0) !== 0;
  const desc     = toStr(descValue) || label;
  const posStr   = connected && position !== null ? position.toFixed(4) : "—";
  const twv      = toDouble(twvValue);
  const twvStr   = twv !== null ? String(twv) : "0";

  function sendMove() {
    const val = parseFloat(setpointInput);
    if (!isNaN(val)) pvwsWriter.write(`${pv}.VAL`, val);
    setEditing(false);
    setSetpointInput("");
  }

  function cancelEdit() {
    setEditing(false);
    setSetpointInput("");
  }

  function sendStop() { pvwsWriter.write(`${pv}.STOP`, 1); }
  function sendTweakForward()  { pvwsWriter.write(`${pv}.TWF`, 1); }
  function sendTweakBackward() { pvwsWriter.write(`${pv}.TWR`, 1); }

  function submitTweak() {
    const val = parseFloat(tweakInput);
    if (!isNaN(val)) pvwsWriter.write(`${pv}.TWV`, val);
    setEditingTweak(false);
    setTweakInput("");
  }

  const statusColor = !connected ? "#888" : dmov ? colors.statusOk : "#ff9800";
  const statusLabel = !connected ? "—" : dmov ? "Done" : "Moving";

  return (
    <tr>
      <td style={styles.labelCell}>{desc}</td>
      <td style={styles.valueCell}>{posStr}</td>
      <td style={styles.setpointCell}>
        {editing ? (
          <input
            autoFocus
            style={styles.input}
            value={setpointInput}
            placeholder={posStr}
            onChange={e => setSetpointInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter")  sendMove();
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={cancelEdit}
          />
        ) : (
          <button style={styles.editBtn} onClick={() => setEditing(true)}>
            {posStr}
          </button>
        )}
      </td>
      <td style={styles.tweakCell}>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button style={styles.tweakBtn} onClick={sendTweakBackward} disabled={!connected}>◀</button>
          {editingTweak ? (
            <input
              autoFocus
              style={styles.tweakInput}
              value={tweakInput}
              placeholder={twvStr}
              onChange={e => setTweakInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter")  submitTweak();
                if (e.key === "Escape") { setEditingTweak(false); setTweakInput(""); }
              }}
              onBlur={() => { setEditingTweak(false); setTweakInput(""); }}
            />
          ) : (
            <button style={styles.tweakValBtn} onClick={() => setEditingTweak(true)}>{twvStr}</button>
          )}
          <button style={styles.tweakBtn} onClick={sendTweakForward} disabled={!connected}>▶</button>
        </div>
      </td>
      <td style={{ ...styles.statusCell, color: statusColor }}>{statusLabel}</td>
      <td style={styles.stopCell}>
        <button style={styles.stopBtn} onClick={sendStop} disabled={!connected}>
          STOP
        </button>
      </td>
      {displays && displays.length > 0 && (
        <td style={styles.detailCell}>
          <button
            ref={btnRef}
            style={styles.detailBtn}
            onClick={e => {
              e.stopPropagation();
              const r = btnRef.current!.getBoundingClientRect();
              setMenuPos(menuPos ? null : { x: r.left, y: r.bottom + 2 });
            }}
          >
            ⋯
          </button>
        </td>
      )}
      {menuPos && displays && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setMenuPos(null)} />
          <div style={{
            position: "fixed", left: menuPos.x, top: menuPos.y, zIndex: 9999,
            background: "#f0f0f0", border: "1px solid #999", borderRadius: 2,
            boxShadow: "2px 2px 6px rgba(0,0,0,0.3)", minWidth: 160,
          }}>
            {displays.map(d => (
              <div
                key={d.file}
                style={{ padding: "6px 14px", cursor: "pointer", fontFamily: "sans-serif", fontSize: 12, color: "#000", whiteSpace: "nowrap" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#0078d7", e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.background = "", e.currentTarget.style.color = "")}
                onClick={() => {
                  setMenuPos(null);
                  window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: d.file, macros: macros ?? {}, label: `${desc} — ${d.label}` } }));
                }}
              >
                {d.label}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </tr>
  );
}

const styles: Record<string, React.CSSProperties> = {
  labelCell:    { padding: "6px 8px", color: colors.label, fontWeight: 500, width: 120 },
  valueCell:    { padding: "6px 4px", fontFamily: "monospace", textAlign: "right", width: 65, color: colors.relatedFg },
  setpointCell: { padding: "4px 4px", width: 90 },
  input:        { background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.spText, padding: "4px 6px", fontFamily: "monospace", width: "100%", borderRadius: 3, boxSizing: "border-box" },
  editBtn:      { background: colors.spBg, border: `1px solid ${colors.spBorder}`, color: colors.spText, fontFamily: "monospace", padding: "4px 6px", borderRadius: 3, cursor: "text", width: "100%", textAlign: "right" },
  tweakCell:    { padding: "4px 4px" },
  tweakBtn:     { background: colors.tweakBg, color: colors.tweakFg, border: `1px solid ${colors.tweakBorder}`, borderRadius: 3, width: 22, height: 22, fontSize: 16, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  tweakValBtn:  { background: colors.spBg, border: `1px solid ${colors.spBorder}`, color: colors.spText, fontFamily: "monospace", padding: "3px 5px", borderRadius: 3, cursor: "text", minWidth: 50, textAlign: "center", fontSize: 11 },
  tweakInput:   { background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.spText, padding: "3px 5px", fontFamily: "monospace", width: 60, borderRadius: 3, fontSize: 11 },
  statusCell:   { padding: "6px 12px", textAlign: "center", width: 70, fontWeight: 600 },
  stopCell:     { padding: "4px 8px", width: 80 },
  stopBtn:      { background: "#c62828", color: "#fff", border: "none", borderRadius: 3, padding: "4px 12px", cursor: "pointer", fontWeight: 700, width: "100%" },
  detailCell:   { padding: "4px 4px", width: 36 },
  detailBtn:    { background: colors.cardBg, color: colors.relatedFg, border: `1px solid ${colors.cardBarBg}`, borderRadius: 3, padding: "4px 8px", cursor: "pointer", fontWeight: 700 },
};
