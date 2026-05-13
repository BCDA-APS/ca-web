import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { UiRenderer } from "../lib/UiRenderer";

export interface AppOverlay {
  id: number;
  file: string;
  macros: Record<string, string>;
  label: string;
  pos: { x: number; y: number };
  sourceFile?: string;
  tabId?: number;
}

export function OverlayPanel({ ov, onClose }: { ov: AppOverlay; onClose: () => void }) {
  const storageKey = `overlay:${ov.file}`;
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) { const p = JSON.parse(s); return { x: p.x, y: p.y }; }
    } catch { /* ignore */ }
    return ov.pos;
  });
  const [locked, setLocked] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s) return JSON.parse(s).locked ?? false;
    } catch { /* ignore */ }
    return false;
  });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ x: pos.x, y: pos.y, locked }));
  }, [storageKey, pos, locked]);

  function onMouseDown(e: React.MouseEvent) {
    if (locked) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setPos({ x: dragRef.current.origX + ev.clientX - dragRef.current.startX,
               y: dragRef.current.origY + ev.clientY - dragRef.current.startY });
    }
    function onUp() { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return createPortal(
    <div style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 9999, background: "rgb(222,222,227)", borderRadius: 4, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", border: "1px solid #b0b0b8" }}>
      <div onMouseDown={onMouseDown} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "rgb(200,200,207)", borderRadius: "4px 4px 0 0", cursor: locked ? "default" : "grab" }}>
        <span style={{ color: "#546e8a", fontSize: 11, fontFamily: "monospace" }}>{ov.label}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setLocked(l => !l)}
            title={locked ? "Unlock panel" : "Lock panel"}
            style={{ cursor: "pointer", background: "none", border: "none", padding: "2px 4px", lineHeight: 1, display: "flex", alignItems: "center", color: locked ? "#4a90d9" : "#546e8a" }}
          >
            {locked
              ? <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
              : <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 1C9.24 1 7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2H9V6c0-1.66 1.34-3 3-3 1.66 0 3 1.34 3 3h2c0-2.76-2.24-5-5-5zm0 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
            }
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#546e8a", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>
      </div>
      <UiRenderer file={ov.file} macros={ov.macros} />
    </div>,
    document.body
  );
}
