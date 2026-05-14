import { useState, useEffect, useRef } from "react";
import { layoutGet, layoutSet } from "../lib/layoutStorage";

// Global z-index counter so clicking a panel brings it to the front.
let gZ = 10;

interface PanelState { x: number; y: number; locked: boolean }

export function DraggablePanel({ id, title, defaultPos, onClose, children }: {
  id: string;
  title: string;
  defaultPos?: { x: number; y: number };
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const def = defaultPos ?? { x: 60, y: 60 };
  const [ps, setPs] = useState<PanelState>(() => {
    const saved = layoutGet<PanelState>(`panel:${id}`);
    return saved ?? { ...def, locked: false };
  });
  const [zIdx, setZIdx] = useState(gZ);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    layoutSet(`panel:${id}`, ps);
  }, [id, ps]);

  function bringToFront() {
    const z = ++gZ;
    setZIdx(z);
  }

  function onHandleMouseDown(e: React.MouseEvent) {
    if (ps.locked) return;
    e.preventDefault();
    bringToFront();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: ps.x, oy: ps.y };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setPs(p => ({
        ...p,
        x: dragRef.current!.ox + ev.clientX - dragRef.current!.sx,
        y: dragRef.current!.oy + ev.clientY - dragRef.current!.sy,
      }));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      onMouseDown={bringToFront}
      style={{
        position: "absolute", left: ps.x, top: ps.y, zIndex: zIdx,
        background: "rgb(222,222,227)", borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)", border: "1px solid #b0b0b8",
        fontFamily: "Liberation Sans, Arial, sans-serif",
      }}
    >
      <div
        onMouseDown={onHandleMouseDown}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 8px", background: "rgb(200,200,207)", borderRadius: "6px 6px 0 0",
          cursor: ps.locked ? "default" : "grab", userSelect: "none",
        }}
      >
        <span style={{ color: "#546e8a", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setPs(p => ({ ...p, locked: !p.locked }))}
          title={ps.locked ? "Unlock panel" : "Lock panel"}
          style={{
            cursor: "pointer", background: "none", border: "none",
            padding: "2px 4px", lineHeight: 1, display: "flex", alignItems: "center",
            color: ps.locked ? "#4a90d9" : "#546e8a",
          }}
        >
          {ps.locked
            ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 1C9.24 1 7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2H9V6c0-1.66 1.34-3 3-3 1.66 0 3 1.34 3 3h2c0-2.76-2.24-5-5-5zm0 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
              </svg>
          }
        </button>
        {onClose && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            title="Close panel"
            style={{
              cursor: "pointer", background: "none", border: "none",
              padding: "2px 4px", lineHeight: 1, display: "flex", alignItems: "center",
              color: "#546e8a",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        )}
        </div>
      </div>

      <div style={{ padding: "12px 16px", color: "#e0e0e0" }}>
        {children}
      </div>
    </div>
  );
}
