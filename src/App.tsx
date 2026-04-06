import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MotorRow } from "./MotorRow";
import { ReadbackRow } from "./ReadbackRow";
import { StripChartWidget } from "./StripChartWidget";
import { UiRenderer } from "./UiRenderer";

// ── Draggable panel ───────────────────────────────────────────────────────────

const PANEL_DEFAULTS: Record<string, { x: number; y: number }> = {
  motors:          { x: 24, y: 56 },
  lorentzian:      { x: 24, y: 460 },
  "area-detector": { x: 24, y: 670 },
};

// Global z-index counter so clicking a panel brings it to the front.
let gZ = 100;

interface PanelState { x: number; y: number; locked: boolean }

function DraggablePanel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const def = PANEL_DEFAULTS[id] ?? { x: 60, y: 60 };
  const [ps, setPs] = useState<PanelState>(() => {
    try {
      const s = localStorage.getItem(`panel:${id}`);
      if (s) return JSON.parse(s);
    } catch { /* ignore */ }
    return { ...def, locked: false };
  });
  const [zIdx, setZIdx] = useState(gZ);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Persist position + locked state
  useEffect(() => {
    localStorage.setItem(`panel:${id}`, JSON.stringify(ps));
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
        position: "fixed", left: ps.x, top: ps.y, zIndex: zIdx,
        background: "#0f2035", borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.6)", border: "1px solid #1e3a5f",
        fontFamily: "Liberation Sans, Arial, sans-serif",
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onHandleMouseDown}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 8px", background: "#1a3a5c", borderRadius: "6px 6px 0 0",
          cursor: ps.locked ? "default" : "grab", userSelect: "none",
        }}
      >
        <span style={{ color: "#bbdefb", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setPs(p => ({ ...p, locked: !p.locked }))}
          title={ps.locked ? "Unlock panel" : "Lock panel"}
          style={{
            cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            padding: "2px 7px", borderRadius: 3, lineHeight: "18px",
            border: ps.locked ? "1px solid #546e8a" : "1px solid #4caf50",
            background: ps.locked ? "transparent" : "rgba(76,175,80,0.15)",
            color: ps.locked ? "#7a9ab8" : "#81c784",
          }}
        >
          {ps.locked ? "LOCKED" : "LOCK"}
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "12px 16px", color: "#e0e0e0" }}>
        {children}
      </div>
    </div>
  );
}

// ── Motor panel ───────────────────────────────────────────────────────────────

const MOTOR_DISPLAYS = [
  { label: "Tiny",  file: "/ui/motors/motorx_tiny.ui" },
  { label: "Small", file: "/ui/motors/motorx.ui" },
  { label: "More",  file: "/ui/motors/motorx_more.ui" },
  { label: "Setup", file: "/ui/motors/motorx_setup.ui" },
  { label: "All",   file: "/ui/motors/motorx_all.ui" },
];

const MOTORS = [
  { label: "Motor 1", pv: "fr:m1", macros: { P: "fr:", M: "m1" } },
  { label: "Motor 2", pv: "fr:m2", macros: { P: "fr:", M: "m2" } },
  { label: "Motor 3", pv: "fr:m3", macros: { P: "fr:", M: "m3" } },
  { label: "Motor 4", pv: "fr:m4", macros: { P: "fr:", M: "m4" } },
  { label: "Motor 5", pv: "fr:m5", macros: { P: "fr:", M: "m5" } },
  { label: "Motor 6", pv: "fr:m6", macros: { P: "fr:", M: "m6" } },
  { label: "Motor 7", pv: "fr:m7", macros: { P: "fr:", M: "m7" } },
  { label: "Motor 8", pv: "fr:m8", macros: { P: "fr:", M: "m8" } },
];

const LORENTZIAN = [{ label: "Noisy", pv: "fr:userCalc1.VAL" }];

const AREA_DETECTOR = [
  { label: "Acquire",      pv: "myad:cam1:Acquire_RBV" },
  { label: "Frame count",  pv: "myad:cam1:ArrayCounter_RBV" },
  { label: "Exposure (s)", pv: "myad:cam1:AcquireTime_RBV" },
  { label: "Image size X", pv: "myad:cam1:SizeX_RBV" },
  { label: "Image size Y", pv: "myad:cam1:SizeY_RBV" },
];

// ── Open-ui overlay (from motor ⋯ menu) ──────────────────────────────────────

interface AppOverlay { id: number; file: string; macros: Record<string, string>; label: string; pos: { x: number; y: number } }

function AppOverlayPanel({ ov, onClose }: { ov: AppOverlay; onClose: () => void }) {
  const [pos, setPos] = useState(ov.pos);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
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
    <div style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 9999, background: "#1a1a2e", borderRadius: 4, boxShadow: "0 4px 20px rgba(0,0,0,0.6)", border: "1px solid #444" }}>
      <div onMouseDown={onMouseDown} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "#0f2035", borderRadius: "4px 4px 0 0", cursor: "grab" }}>
        <span style={{ color: "#90caf9", fontSize: 11, fontFamily: "monospace" }}>{ov.label}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>
      <UiRenderer file={ov.file} macros={ov.macros} />
    </div>,
    document.body
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [overlays, setOverlays] = useState<AppOverlay[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    function handler(e: Event) {
      const { file, macros, label } = (e as CustomEvent).detail;
      const id = ++counter.current;
      const offset = ((id - 1) % 6) * 24;
      setOverlays(prev => [...prev, { id, file, macros, label, pos: { x: 120 + offset, y: 80 + offset } }]);
    }
    window.addEventListener("open-ui", handler);
    return () => window.removeEventListener("open-ui", handler);
  }, []);

  return (
    <div style={{ background: "#0d1b2a", minHeight: "100vh", fontFamily: "Liberation Sans, Arial, sans-serif" }}>

      {/* App-level overlays from motor ⋯ menu */}
      {overlays.map(ov => (
        <AppOverlayPanel key={ov.id} ov={ov} onClose={() => setOverlays(prev => prev.filter(o => o.id !== ov.id))} />
      ))}

      {/* APS logo */}
      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000, opacity: 0.85 }}>
        <img src="/aps-logo.png" alt="Argonne National Laboratory | APS" style={{ height: "40px", width: "auto", display: "block" }} />
      </div>

      {/* Page title (fixed, acts as header) */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "#0a1520", borderBottom: "1px solid #1e3a5f", padding: "8px 24px" }}>
        <span style={{ color: "#90caf9", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>Simulated IOC</span>
      </div>

      {/* ── Draggable panels ── */}

      <DraggablePanel id="motors" title="Motors">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Position</th>
              <th style={thStyle}>Setpoint</th>
              <th style={thStyle}>Tweak</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle} />
              <th style={thStyle} />
            </tr>
          </thead>
          <tbody>
            {MOTORS.map(m => (
              <MotorRow key={m.pv} label={m.label} pv={m.pv} displays={MOTOR_DISPLAYS} macros={m.macros} />
            ))}
          </tbody>
        </table>
      </DraggablePanel>

      <DraggablePanel id="lorentzian" title="Detector — Simulated Lorentzian">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Value</th></tr></thead>
            <tbody>{LORENTZIAN.map(r => <ReadbackRow key={r.pv} label={r.label} pv={r.pv} />)}</tbody>
          </table>
          <StripChartWidget pv="fr:userCalc1.VAL" label="Noisy" />
        </div>
      </DraggablePanel>

      <DraggablePanel id="area-detector" title="Area Detector — myad:cam1">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Value</th></tr></thead>
            <tbody>{AREA_DETECTOR.map(r => <ReadbackRow key={r.pv} label={r.label} pv={r.pv} />)}</tbody>
          </table>
          <UiRenderer file="/ui/29id_cam.ui" macros={{ P: "myad:" }} />
        </div>
      </DraggablePanel>

    </div>
  );
}

const tableStyle: React.CSSProperties = {
  borderCollapse: "collapse", width: "auto",
  background: "#0a1828", borderRadius: 4, overflow: "hidden",
};
const thStyle: React.CSSProperties = {
  padding: "7px 12px", background: "#1a3a5c", color: "#90caf9",
  fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "left",
};
