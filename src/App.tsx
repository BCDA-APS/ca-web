import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MotorRow } from "./MotorRow";
import { ReadbackRow } from "./ReadbackRow";
import { StripChartWidget } from "./StripChartWidget";
import { UiRenderer } from "./UiRenderer";

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

const LORENTZIAN = [
  { label: "Noisy", pv: "fr:userCalc1.VAL" },
];

const AREA_DETECTOR = [
  { label: "Acquire",     pv: "myad:cam1:Acquire_RBV" },
  { label: "Frame count", pv: "myad:cam1:ArrayCounter_RBV" },
  { label: "Exposure (s)",pv: "myad:cam1:AcquireTime_RBV" },
  { label: "Image size X",pv: "myad:cam1:SizeX_RBV" },
  { label: "Image size Y",pv: "myad:cam1:SizeY_RBV" },
];

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

function MotorGroup({ label, motors }: { label: string; motors: typeof MOTORS }) {
  return (
    <div style={styles.group}>
      <h2 style={styles.groupTitle}>{label}</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={{ ...styles.th, textAlign: "right" }}>Position</th>
            <th style={styles.th}>Setpoint</th>
            <th style={styles.th}>Tweak</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th} />
            <th style={styles.th} />
          </tr>
        </thead>
        <tbody>
          {motors.map(m => (
            <MotorRow
              key={m.pv}
              label={m.label}
              pv={m.pv}
              displays={MOTOR_DISPLAYS}
              macros={m.macros}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}


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
    <div style={styles.page}>
      {overlays.map(ov => (
        <AppOverlayPanel key={ov.id} ov={ov} onClose={() => setOverlays(prev => prev.filter(o => o.id !== ov.id))} />
      ))}
      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000, opacity: 0.85 }}>
        <img src="/aps-logo.png" alt="Argonne National Laboratory | APS" style={{ height: "40px", width: "auto", display: "block" }} />
      </div>
      <h1 style={styles.title}>Simulated IOC</h1>
      <MotorGroup label="Motors" motors={MOTORS} />

      {/* Lorentzian: readback table on the left, strip chart to the right */}
      <div style={styles.group}>
        <h2 style={styles.groupTitle}>Detector — Simulated Lorentzian</h2>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 32 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              {LORENTZIAN.map(r => (
                <ReadbackRow key={r.pv} label={r.label} pv={r.pv} />
              ))}
            </tbody>
          </table>
          <StripChartWidget pv="fr:userCalc1.VAL" label="Noisy" />
        </div>
      </div>

      <div style={styles.group}>
        <h2 style={styles.groupTitle}>Area Detector — myad:cam1</h2>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 32 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              {AREA_DETECTOR.map(r => (
                <ReadbackRow key={r.pv} label={r.label} pv={r.pv} />
              ))}
            </tbody>
          </table>
          <UiRenderer file="/ui/29id_cam.ui" macros={{ P: "myad:" }} />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#0d1b2a",
    minHeight: "100vh",
    padding: "24px 32px",
    fontFamily: "Liberation Sans, Arial, sans-serif",
    color: "#e0e0e0",
  },
  title: {
    color: "#90caf9",
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 24px 0",
    borderBottom: "1px solid #1e3a5f",
    paddingBottom: 12,
  },
  group: { marginBottom: 32 },
  groupTitle: {
    color: "#bbdefb",
    fontSize: 15,
    fontWeight: 600,
    margin: "0 0 8px 0",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  table: {
    borderCollapse: "collapse",
    width: "auto",
    background: "#0f2035",
    borderRadius: 6,
    overflow: "hidden",
  },
  th: {
    padding: "8px 12px",
    background: "#1a3a5c",
    color: "#90caf9",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "left",
  },
};
