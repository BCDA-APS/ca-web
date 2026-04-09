import { useState, useEffect, useRef, Component } from "react";
import type { ErrorInfo } from "react";
import { createPortal } from "react-dom";
import { MotorRow } from "./MotorRow";
import { ReadbackRow } from "./ReadbackRow";
import { StripChartWidget } from "./StripChartWidget";
import { UiRenderer, parseArgs } from "./UiRenderer";

// ── Top-level error boundary ──────────────────────────────────────────────────
// Catches crashes caused by unexpected PV data during IOC reconnection.
// Auto-resets after a short delay so the user doesn't need to reload the page.

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary] caught:", error, info);
    // Auto-reset after 3 s to recover from transient IOC reconnection crashes.
    this.resetTimer = setTimeout(() => this.setState({ error: null }), 3000);
  }
  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#0d1b2a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "sans-serif", color: "#90caf9" }}>
          <div style={{ fontSize: 14 }}>Recovering from render error…</div>
          <div style={{ fontSize: 11, color: "#546e8a", maxWidth: 400, textAlign: "center" }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ background: "#1a3a5c", border: "1px solid #4a90d9", color: "#90caf9", borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>
            Retry now
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Draggable panel ───────────────────────────────────────────────────────────

const PANEL_DEFAULTS: Record<string, { x: number; y: number }> = {
  motors:          { x: 108, y:  56 },
  lorentzian:      { x: 108, y: 460 },
  "area-detector": { x: 108, y: 800 },
  test:            { x: 108, y:  56 },
  "29idc-arpes":   { x: 108, y:  56 },
  "29idd-kappa":   { x: 108, y:  56 },
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
            cursor: "pointer", background: "none", border: "none",
            padding: "2px 4px", lineHeight: 1, display: "flex", alignItems: "center",
            color: ps.locked ? "#4a90d9" : "#546e8a",
          }}
        >
          {ps.locked
            ? /* closed padlock */
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            : /* open padlock */
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 1C9.24 1 7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2H9V6c0-1.66 1.34-3 3-3 1.66 0 3 1.34 3 3h2c0-2.76-2.24-5-5-5zm0 15c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
              </svg>
          }
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 1, icon: "⌂",  label: "Home" },
  { id: 2, icon: "🔬", label: "Test" },
  { id: 3, icon: "⚛",  label: "29ID-C" },
  { id: 4, icon: "⚛",  label: "29ID-D" },
];

function Sidebar({ active, onSelect }: { active: number; onSelect: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 40, left: 0, bottom: 0, width: 68, zIndex: 40, background: "#0a1520", borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column", paddingTop: 8 }}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            background: active === tab.id ? "#1a3a5c" : "none",
            border: "none",
            borderLeft: `3px solid ${active === tab.id ? "#4a90d9" : "transparent"}`,
            color: active === tab.id ? "#90caf9" : "#546e8a",
            cursor: "pointer",
            padding: "12px 0",
            width: "100%",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{tab.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Settings panel ────────────────────────────────────────────────────────────

const PANEL_IDS = Object.keys(PANEL_DEFAULTS);

type SavedLayout = { name: string; positions: Record<string, { x: number; y: number; locked: boolean }> };

function loadSavedLayouts(): SavedLayout[] {
  try { return JSON.parse(localStorage.getItem("panel:layouts") ?? "[]"); } catch { return []; }
}

function SettingsPanel({ onClose, onReset }: { onClose: () => void; onReset: () => void }) {
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [layouts, setLayouts] = useState<SavedLayout[]>(loadSavedLayouts);

  function persistLayouts(next: SavedLayout[]) {
    localStorage.setItem("panel:layouts", JSON.stringify(next));
    setLayouts(next);
  }

  function saveLayout() {
    const name = nameInput.trim();
    if (!name) return;
    const positions: SavedLayout["positions"] = {};
    PANEL_IDS.forEach(id => {
      const s = localStorage.getItem(`panel:${id}`);
      if (s) try { positions[id] = JSON.parse(s); } catch { /* skip */ }
    });
    persistLayouts([...layouts.filter(l => l.name !== name), { name, positions }]);
    setNaming(false);
    setNameInput("");
  }

  function restoreLayout(layout: SavedLayout) {
    PANEL_IDS.forEach(id => {
      if (layout.positions[id])
        localStorage.setItem(`panel:${id}`, JSON.stringify(layout.positions[id]));
    });
    onReset();
    onClose();
  }

  function resetToDefault() {
    PANEL_IDS.forEach(id => {
      const def = PANEL_DEFAULTS[id] ?? { x: 60, y: 60 };
      localStorage.setItem(`panel:${id}`, JSON.stringify({ ...def, locked: false }));
    });
    onReset();
    onClose();
  }

  const menuItemStyle: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left",
    padding: "7px 14px", background: "none", border: "none",
    color: "#cce0ff", fontSize: 13, cursor: "pointer",
  };
  const hoverOn  = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "#1a3a5c"; };
  const hoverOff = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "none"; };

  return (
    <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200, background: "#0f2035", border: "1px solid #1e3a5f", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", minWidth: 220, padding: "8px 0" }}>

      {/* Section header */}
      <div style={{ padding: "4px 14px 6px", color: "#546e8a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Layout</div>

      {/* Save current layout */}
      {naming ? (
        <div style={{ padding: "4px 14px 8px", display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={nameInput}
            placeholder="Layout name…"
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") saveLayout();
              if (e.key === "Escape") { setNaming(false); setNameInput(""); }
            }}
            style={{ flex: 1, background: "#1e2a3a", border: "1px solid #4a90d9", color: "#fff", padding: "4px 6px", borderRadius: 3, fontSize: 12 }}
          />
          <button
            onClick={e => { e.stopPropagation(); saveLayout(); }}
            style={{ background: "#1a3a5c", border: "1px solid #4a90d9", color: "#90caf9", borderRadius: 3, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}
          >Save</button>
        </div>
      ) : (
        <button style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
          onClick={e => { e.stopPropagation(); setNaming(true); }}>
          Save current layout…
        </button>
      )}

      {/* Reset to defaults */}
      <button style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
        onClick={e => { e.stopPropagation(); resetToDefault(); }}>
        Reset to default positions
      </button>

      {/* Saved layouts list */}
      {layouts.length > 0 && <>
        <div style={{ margin: "6px 14px", borderTop: "1px solid #1e3a5f" }} />
        <div style={{ padding: "4px 14px 6px", color: "#546e8a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Saved layouts</div>
        {layouts.map(layout => (
          <div key={layout.name} style={{ display: "flex", alignItems: "center" }}>
            <button style={{ ...menuItemStyle, flex: 1, padding: "5px 14px" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              onClick={e => { e.stopPropagation(); restoreLayout(layout); }}>
              {layout.name}
            </button>
            <button
              title="Delete"
              onClick={e => { e.stopPropagation(); persistLayouts(layouts.filter(l => l.name !== layout.name)); }}
              style={{ background: "none", border: "none", color: "#546e8a", cursor: "pointer", fontSize: 15, padding: "4px 10px", lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef5350"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#546e8a"; }}
            >×</button>
          </div>
        ))}
      </>}
    </div>
  );
}

// ── File picker ───────────────────────────────────────────────────────────────

interface UiFile { name: string; dir: string }

function useUiFiles(): UiFile[] {
  const [files, setFiles] = useState<UiFile[]>([]);
  useEffect(() => {
    fetch("/api/ui-files").then(r => r.json()).then(setFiles).catch(() => {});
  }, []);
  return files;
}

function FilePickerDialog({ files, onClose, onOpen }: {
  files: UiFile[];
  onClose: () => void;
  onOpen: (file: string, macros: Record<string, string>) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<UiFile | null>(null);
  const [macroStr, setMacroStr] = useState("");

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.toLowerCase();
  const filtered = files.filter(f =>
    f.name.toLowerCase().includes(q) || f.dir.toLowerCase().includes(q)
  );
  const capped    = filtered.slice(0, 100);
  const overflow  = filtered.length > 100;

  function handleOpen() {
    if (!selected) return;
    onOpen(`/ui/${selected.name}`, parseArgs(macroStr));
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "#1e2a3a", border: "1px solid #4a90d9",
    color: "#fff", padding: "6px 8px", borderRadius: 4,
    fontSize: 13, outline: "none",
  };
  const btnStyle = (primary: boolean): React.CSSProperties => ({
    background: primary ? "#1a3a5c" : "none",
    border: `1px solid ${primary ? "#4a90d9" : "#546e8a"}`,
    color: primary ? "#90caf9" : "#546e8a",
    borderRadius: 4, padding: "5px 16px",
    cursor: primary && !selected ? "default" : "pointer",
    fontSize: 13, opacity: primary && !selected ? 0.4 : 1,
  });

  return createPortal(
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9990 }} />

      {/* Dialog */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 9991, width: 520,
        background: "#0f2035", border: "1px solid #1e3a5f",
        borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column",
        fontFamily: "Liberation Sans, Arial, sans-serif",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "#1a3a5c", borderRadius: "8px 8px 0 0" }}>
          <span style={{ color: "#bbdefb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Open Display</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Search */}
          <input
            autoFocus
            placeholder="Search by name or module…"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            style={inputStyle}
          />

          {/* File list */}
          <div style={{ height: 300, overflowY: "auto", border: "1px solid #1e3a5f", borderRadius: 4, background: "#0a1828" }}>
            {capped.map(f => (
              <div
                key={`${f.dir}/${f.name}`}
                onClick={() => setSelected(f)}
                onDoubleClick={() => { setSelected(f); handleOpen(); }}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 10px", cursor: "pointer",
                  background: selected?.name === f.name && selected?.dir === f.dir ? "#1a3a5c" : "transparent",
                  borderLeft: `3px solid ${selected?.name === f.name && selected?.dir === f.dir ? "#4a90d9" : "transparent"}`,
                  color: "#cce0ff", fontSize: 13,
                }}
                onMouseEnter={e => { if (selected?.name !== f.name || selected?.dir !== f.dir) (e.currentTarget as HTMLElement).style.background = "#12253a"; }}
                onMouseLeave={e => { if (selected?.name !== f.name || selected?.dir !== f.dir) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ fontFamily: "monospace", fontSize: 12 }}>{f.name}</span>
                <span style={{ color: "#546e8a", fontSize: 11, fontFamily: "monospace", marginLeft: 12, flexShrink: 0 }}>{f.dir}</span>
              </div>
            ))}
            {overflow && (
              <div style={{ padding: "6px 10px", color: "#546e8a", fontSize: 11, fontStyle: "italic" }}>
                Showing 100 of {filtered.length} — refine your search
              </div>
            )}
            {filtered.length === 0 && (
              <div style={{ padding: "12px 10px", color: "#546e8a", fontSize: 12 }}>No files match</div>
            )}
          </div>

          {/* Macros */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#90caf9", fontSize: 12, flexShrink: 0 }}>Macros:</span>
            <input
              placeholder="P=fr:,M=m1"
              value={macroStr}
              onChange={e => setMacroStr(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleOpen(); }}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
            <button onClick={onClose} style={btnStyle(false)}>Cancel</button>
            <button onClick={handleOpen} disabled={!selected} style={btnStyle(true)}>Open</button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [overlays, setOverlays] = useState<AppOverlay[]>([]);
  const counter = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [layoutKey, setLayoutKey] = useState(0);
  const [activeTab, setActiveTab] = useState(1);
  const uiFiles = useUiFiles();

  function openFromPicker(file: string, macros: Record<string, string>) {
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file, macros, label: file.split("/").pop() ?? file }
    }));
  }

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
    <AppErrorBoundary>
    <div
      style={{ background: "#0d1b2a", minHeight: "100vh", fontFamily: "Liberation Sans, Arial, sans-serif" }}
      onClick={() => settingsOpen && setSettingsOpen(false)}
    >

      {/* App-level overlays from motor ⋯ menu */}
      {overlays.map(ov => (
        <AppOverlayPanel key={ov.id} ov={ov} onClose={() => setOverlays(prev => prev.filter(o => o.id !== ov.id))} />
      ))}

      {/* Sidebar */}
      <Sidebar active={activeTab} onSelect={setActiveTab} />

      {/* Page title (fixed, acts as header) */}
      {/* APS logo — bottom right */}
      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000, opacity: 0.85 }}>
        <img src="/aps-logo.png" alt="Argonne National Laboratory | APS" style={{ height: "40px", width: "auto", display: "block" }} />
      </div>

      {/* Page title (fixed, acts as header) */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "#0a1520", borderBottom: "1px solid #1e3a5f", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#90caf9", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>29ID Beamline</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setPickerOpen(true)}
            style={{ background: "none", border: "1px solid transparent", borderRadius: 4, color: "#90caf9", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
          >
            Open…
          </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            title="Settings"
            style={{ background: settingsOpen ? "#1a3a5c" : "none", border: "1px solid " + (settingsOpen ? "#4a7ab5" : "transparent"), borderRadius: 4, color: "#90caf9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "3px 7px" }}
          >
            ⚙
          </button>
          {settingsOpen && (
            <SettingsPanel
              onClose={() => setSettingsOpen(false)}
              onReset={() => setLayoutKey(k => k + 1)}
            />
          )}
        </div>
        </div>
      </div>

      {pickerOpen && (
        <FilePickerDialog
          files={uiFiles}
          onClose={() => setPickerOpen(false)}
          onOpen={openFromPicker}
        />
      )}

      {/* ── Tab 1: Main ── */}
      {activeTab === 1 && <>

      <DraggablePanel key={`motors-${layoutKey}`} id="motors" title="Motors">
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

      <DraggablePanel key={`lorentzian-${layoutKey}`} id="lorentzian" title="Detector — Simulated Lorentzian">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Value</th></tr></thead>
            <tbody>{LORENTZIAN.map(r => <ReadbackRow key={r.pv} label={r.label} pv={r.pv} />)}</tbody>
          </table>
          <StripChartWidget pv="fr:userCalc1.VAL" label="Noisy" />
        </div>
      </DraggablePanel>

      <DraggablePanel key={`area-detector-${layoutKey}`} id="area-detector" title="Area Detector — myad:cam1">
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
          <table style={tableStyle}>
            <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Value</th></tr></thead>
            <tbody>{AREA_DETECTOR.map(r => <ReadbackRow key={r.pv} label={r.label} pv={r.pv} />)}</tbody>
          </table>
          <UiRenderer file="/ui/29id/29id_cam.ui" macros={{ P: "myad:" }} />
        </div>
      </DraggablePanel>

      </>}

      {/* ── Tab 2: Test ── */}
      {activeTab === 2 && (
        <DraggablePanel key={`test-${layoutKey}`} id="test" title="Widget Test">
          <UiRenderer file="/ui/test.ui" macros={{}} />
        </DraggablePanel>
      )}

      {/* ── Tab 3: 29ID-C ── */}
      {activeTab === 3 && (
        <DraggablePanel key={`29idc-arpes-${layoutKey}`} id="29idc-arpes" title="29ID-C ARPES">
          <UiRenderer file="/ui/29id/29idc_ARPES.ui" macros={{}} />
        </DraggablePanel>
      )}

      {/* ── Tab 4: 29ID-D ── */}
      {activeTab === 4 && (
        <DraggablePanel key={`29idd-kappa-${layoutKey}`} id="29idd-kappa" title="29ID-D Kappa">
          <UiRenderer file="/ui/29id/29idd_Kappa.ui" macros={{ P: "29idd:", M1: "m1", M2: "m2", M3: "m3", M4: "m7", M5: "m6" }} />
        </DraggablePanel>
      )}

    </div>
    </AppErrorBoundary>
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
