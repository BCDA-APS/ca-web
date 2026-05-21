import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { layoutGet, layoutSet } from "../lib/layoutStorage";
import { PanelSizeContext } from "../lib/deployment";
import { nextZ } from "./zStack";

interface PanelState { x: number; y: number; w?: number; h?: number; locked: boolean }

const MIN_W = 200;
const MIN_H = 120;
// Don't let the title bar get hidden behind the top banner (≈40px tall +
// bit of padding). With wsDown there's also a 32px error bar above the
// banner — this clamp ignores that edge case (rare) but keeps users from
// stranding a panel where they can't grab the title to move it back.
const MIN_Y = 44;
const MIN_X = 0;

export function DraggablePanel({ id, title, defaultPos, defaultSize, scale, aspectLock, transient, onState, onClose, children }: {
  id: string;
  title: string;
  defaultPos?: { x: number; y: number };
  defaultSize?: { w: number; h: number };
  scale?: "transform" | "fit" | "none";
  aspectLock?: boolean;
  /** When true, panel state is NOT read from / written to layoutStorage.
   * Used for transient overlay-style panels (camera overlays) where the
   * panel id is per-instance and persisted state would only cause
   * collisions across sessions. */
  transient?: boolean;
  /** Called whenever the panel's persistable state changes (drag / resize /
   * lock toggle). Independent of `transient`. Lets external owners (e.g.
   * App.tsx camera overlay records) lift state up for serialization. */
  onState?: (s: { x: number; y: number; w?: number; h?: number; locked: boolean }) => void;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const def = defaultPos ?? { x: 60, y: 60 };
  const [ps, setPs] = useState<PanelState>(() => {
    if (!transient) {
      const saved = layoutGet<PanelState>(`panel:${id}`);
      if (saved) return saved;
    }
    return { ...def, locked: false, w: defaultSize?.w, h: defaultSize?.h };
  });
  const [zIdx, setZIdx] = useState(() => nextZ());
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // Natural (unscaled) content size, captured once on first render in
  // scale="transform" mode. Used as the transform basis so the content
  // can always fit the panel exactly, regardless of defaultSize.
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (scale !== "transform" || naturalSize) return;
    const el = measureRef.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w > 0 && h > 0) setNaturalSize({ w, h });
  }, [scale, naturalSize, children]);

  useEffect(() => {
    if (!transient) layoutSet(`panel:${id}`, ps);
    if (onState) onState(ps);
  }, [id, ps, transient, onState]);

  // Bring this panel to the front whenever someone fires show-panel for our
  // id. Lets external buttons (e.g. ChamberDiagram Gauge/Pump) raise an
  // already-visible panel in addition to un-hiding a hidden one.
  useEffect(() => {
    function onShow(e: Event) {
      if ((e as CustomEvent).detail?.id === id) setZIdx(nextZ());
    }
    window.addEventListener("show-panel", onShow);
    return () => window.removeEventListener("show-panel", onShow);
  }, [id]);

  function bringToFront() {
    setZIdx(nextZ());
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
        x: Math.max(MIN_X, dragRef.current!.ox + ev.clientX - dragRef.current!.sx),
        y: Math.max(MIN_Y, dragRef.current!.oy + ev.clientY - dragRef.current!.sy),
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

  function onResizeMouseDown(e: React.MouseEvent) {
    if (ps.locked) return;
    e.preventDefault();
    e.stopPropagation();
    bringToFront();
    const startW = ps.w ?? rootRef.current?.offsetWidth ?? MIN_W;
    const startH = ps.h ?? rootRef.current?.offsetHeight ?? MIN_H;
    const sx = e.clientX, sy = e.clientY;
    // Aspect-lock the resize drag. Explicit prop wins; otherwise locked only
    // when content is CSS-scaled (non-uniform resize there just makes empty
    // letterbox space). Set aspectLock:true on a "fit" panel that has a
    // natural aspect ratio (e.g. CameraViewer with the detector image).
    const aspectLocked = aspectLock ?? (scale === "transform");
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (aspectLocked) {
        // Project the mouse delta onto the panel's diagonal vector so both
        // dimensions grow/shrink by the same factor along that direction.
        const t = (dx * startW + dy * startH) / (startW * startW + startH * startH);
        const minT = Math.max(MIN_W / startW, MIN_H / startH) - 1;
        const tt = Math.max(minT, t);
        setPs(p => ({
          ...p,
          w: Math.round(startW * (1 + tt)),
          h: Math.round(startH * (1 + tt)),
        }));
      } else {
        setPs(p => ({
          ...p,
          w: Math.max(MIN_W, startW + dx),
          h: Math.max(MIN_H, startH + dy),
        }));
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div
      ref={rootRef}
      onMouseDown={bringToFront}
      style={{
        position: "absolute", left: ps.x, top: ps.y, zIndex: zIdx,
        width: ps.w, height: ps.h,
        display: "flex", flexDirection: "column",
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
          flexShrink: 0,
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

      <div style={{
        flex: 1, minWidth: 0, minHeight: 0,
        display: "flex", flexDirection: "column",
        padding: "12px 16px", color: "#e0e0e0",
        boxSizing: "border-box", overflow: "hidden",
      }}>
        <PanelSizeContext.Provider value={
          ps.w !== undefined && ps.h !== undefined
            ? { w: Math.max(50, ps.w - 32), h: Math.max(50, ps.h - 30 - 24) }
            : null
        }>
          {(() => {
            // CSS transform mode: uniformly scale content to fit the panel,
            // using the auto-measured natural content size as the basis. Lets
            // static-size form panels visually expand without per-component
            // refactoring.
            if (scale === "transform") {
              // First render (and on remeasure): render unscaled and capture size.
              if (!naturalSize || ps.w === undefined || ps.h === undefined) {
                // alignSelf:flex-start prevents the flex column parent from
                // stretching this wrapper to full panel width; we want it to
                // size to its intrinsic content so the measurement is accurate.
                return (
                  <div ref={measureRef} style={{ display: "inline-block", alignSelf: "flex-start" }}>
                    {children}
                  </div>
                );
              }
              const innerW = Math.max(50, ps.w - 32);
              const innerH = Math.max(50, ps.h - 30 - 24);
              const s = Math.max(0.25, Math.min(innerW / naturalSize.w, innerH / naturalSize.h));
              return (
                <div style={{
                  width: naturalSize.w, height: naturalSize.h,
                  transform: `scale(${s})`, transformOrigin: "top left",
                }}>
                  {children}
                </div>
              );
            }
            return children;
          })()}
        </PanelSizeContext.Provider>
      </div>

      {!ps.locked && (
        <div
          onMouseDown={onResizeMouseDown}
          title="Resize"
          style={{
            position: "absolute", right: 0, bottom: 0,
            width: 16, height: 16, cursor: "nwse-resize",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14">
            <line x1="14" y1="3"  x2="3"  y2="14" stroke="#888" strokeWidth="1.4"/>
            <line x1="14" y1="7"  x2="7"  y2="14" stroke="#888" strokeWidth="1.4"/>
            <line x1="14" y1="11" x2="11" y2="14" stroke="#888" strokeWidth="1.4"/>
          </svg>
        </div>
      )}
    </div>
  );
}
