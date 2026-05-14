import { useState } from "react";
import { createPortal } from "react-dom";
import { PvInfoDialog } from "./PvInfoDialog";

export interface PvContextEvent {
  pvName: string;
  rawData: unknown;
  x: number;
  y: number;
}

export function PvContextMenu({ ctx, onClose }: { ctx: PvContextEvent; onClose: () => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const menuW = 200, menuH = 90;
  const x = Math.min(ctx.x, window.innerWidth  - menuW - 8);
  const y = Math.min(ctx.y, window.innerHeight - menuH - 8);

  return createPortal(
    <>
      <div onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 8900 }} />
      <div style={{ position: "fixed", left: x, top: y, zIndex: 8901, background: "#0f2035", border: "1px solid #2a5a9a", borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.7)", minWidth: menuW, overflow: "hidden" }}>
        <div style={{ background: "#1a3a5c", padding: "5px 10px", color: "#80deea", fontFamily: "monospace", fontSize: 11, fontWeight: 700, borderBottom: "1px solid #2a5a9a" }}>
          {ctx.pvName}
        </div>
        <button onClick={() => setShowInfo(true)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "none", border: "none", color: "#cce0ff", fontSize: 12, cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#1a3a5c")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}>
          Get info
        </button>
        <button onClick={() => { navigator.clipboard.writeText(ctx.pvName); onClose(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "none", border: "none", color: "#cce0ff", fontSize: 12, cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#1a3a5c")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}>
          Copy PV name
        </button>
      </div>
      {showInfo && <PvInfoDialog pvName={ctx.pvName} rawData={ctx.rawData} onClose={() => { setShowInfo(false); onClose(); }} />}
    </>,
    document.body
  );
}
