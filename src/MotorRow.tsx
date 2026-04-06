import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./pvwsWriter";
import { UiRenderer } from "./UiRenderer";

interface MotorRowProps {
  label: string;
  pv: string; // e.g. "fr:m1"
  uiFile?: string;
  macros?: Record<string, string>;
}

function toDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number; stringValue?: string } }).value;
  if (val?.doubleValue !== undefined) return val.doubleValue;
  if (val?.stringValue !== undefined) return parseFloat(val.stringValue);
  return null;
}

function toStr(d: unknown): string | null {
  if (!d) return null;
  const val = (d as { value?: { stringValue?: string; doubleValue?: number } }).value;
  if (val?.stringValue !== undefined && val.stringValue !== "") return val.stringValue;
  if (val?.doubleValue !== undefined) return String(val.doubleValue);
  return null;
}

export function MotorRow({ label, pv, uiFile, macros }: MotorRowProps) {
  const id = `motor-${pv}`;
  const [, connected, , rbvValue]  = useConnection(`${id}-rbv`,  `ca://${pv}.RBV`);
  const [, , ,          dmovValue] = useConnection(`${id}-dmov`, `ca://${pv}.DMOV`);
  const [, , ,          descValue] = useConnection(`${id}-desc`, `ca://${pv}.DESC`);

  const [editing, setEditing]           = useState(false);
  const [setpointInput, setSetpointInput] = useState("");

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPos, setOverlayPos]   = useState({ x: 120, y: 80 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onOverlayMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: overlayPos.x, origY: overlayPos.y };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setOverlayPos({
        x: dragRef.current.origX + ev.clientX - dragRef.current.startX,
        y: dragRef.current.origY + ev.clientY - dragRef.current.startY,
      });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const position = toDouble(rbvValue);
  const dmov     = (toDouble(dmovValue) ?? 0) !== 0;
  const desc     = toStr(descValue) || label;
  const posStr   = connected && position !== null ? position.toFixed(5) : "—";

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

  function sendStop() {
    pvwsWriter.write(`${pv}.STOP`, 1);
  }

  const statusColor = !connected ? "#888" : dmov ? "#4caf50" : "#ff9800";
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
      <td style={{ ...styles.statusCell, color: statusColor }}>{statusLabel}</td>
      <td style={styles.stopCell}>
        <button style={styles.stopBtn} onClick={sendStop} disabled={!connected}>
          STOP
        </button>
      </td>
      {uiFile && (
        <td style={styles.detailCell}>
          <button style={styles.detailBtn} onClick={() => { setOverlayPos({ x: 120, y: 80 }); setOverlayOpen(true); }}>
            ⋯
          </button>
        </td>
      )}
      {overlayOpen && uiFile && createPortal(
        <div style={{ position: "fixed", top: overlayPos.y, left: overlayPos.x, zIndex: 9999, background: "#1a1a2e", borderRadius: 4, boxShadow: "0 4px 20px rgba(0,0,0,0.6)", border: "1px solid #444" }}>
          <div onMouseDown={onOverlayMouseDown} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#0f2035", borderRadius: "4px 4px 0 0", cursor: "grab" }}>
            <span style={{ color: "#90caf9", fontSize: 11, fontFamily: "monospace" }}>{desc}</span>
            <button onClick={() => setOverlayOpen(false)} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
          </div>
          <UiRenderer file={uiFile} macros={macros ?? {}} />
        </div>,
        document.body
      )}
    </tr>
  );
}

const styles: Record<string, React.CSSProperties> = {
  labelCell:    { padding: "6px 12px", color: "#cce0ff", fontWeight: 500, width: 180 },
  valueCell:    { padding: "6px 12px", fontFamily: "monospace", textAlign: "right", width: 110, color: "#90caf9" },
  setpointCell: { padding: "4px 8px", width: 200 },
  input:        { background: "#1e2a3a", border: "1px solid #4a90d9", color: "#fff", padding: "4px 8px", fontFamily: "monospace", width: "100%", borderRadius: 3, boxSizing: "border-box" },
  editBtn:      { background: "#1e2a3a", border: "1px solid #2a4a6a", color: "#90caf9", fontFamily: "monospace", padding: "4px 8px", borderRadius: 3, cursor: "text", width: "100%", textAlign: "right" },
  statusCell:   { padding: "6px 12px", textAlign: "center", width: 70, fontWeight: 600 },
  stopCell:     { padding: "4px 8px", width: 80 },
  stopBtn:      { background: "#c62828", color: "#fff", border: "none", borderRadius: 3, padding: "4px 12px", cursor: "pointer", fontWeight: 700, width: "100%" },
  detailCell:   { padding: "4px 4px", width: 36 },
  detailBtn:    { background: "#1e3a5c", color: "#90caf9", border: "1px solid #2a4a6a", borderRadius: 3, padding: "4px 8px", cursor: "pointer", fontWeight: 700 },
};
