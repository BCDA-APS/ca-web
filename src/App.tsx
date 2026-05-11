import { useState, useEffect, useRef, Component } from "react";
import type { ErrorInfo } from "react";
import { createPortal } from "react-dom";
import { UiRenderer, parseArgs } from "./lib/UiRenderer";
import { config } from "./deployments";
import type { Tab } from "./deployments";

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

// Global z-index counter so clicking a panel brings it to the front.
let gZ = 10;

interface PanelState { x: number; y: number; locked: boolean }

function DraggablePanel({ id, title, defaultPos, onClose, children }: { id: string; title: string; defaultPos?: { x: number; y: number }; onClose?: () => void; children: React.ReactNode }) {
  const def = defaultPos ?? { x: 60, y: 60 };
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
        position: "absolute", left: ps.x, top: ps.y, zIndex: zIdx,
        background: "rgb(222,222,227)", borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)", border: "1px solid #b0b0b8",
        fontFamily: "Liberation Sans, Arial, sans-serif",
      }}
    >
      {/* Drag handle */}
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

      {/* Content */}
      <div style={{ padding: "12px 16px", color: "#e0e0e0" }}>
        {children}
      </div>
    </div>
  );
}

// ── Open-ui overlay (from motor ⋯ menu) ──────────────────────────────────────

interface AppOverlay { id: number; file: string; macros: Record<string, string>; label: string; pos: { x: number; y: number }; sourceFile?: string; tabId?: number }

function AppOverlayPanel({ ov, onClose }: { ov: AppOverlay; onClose: () => void }) {
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ tabs, active, onSelect }: { tabs: Tab[]; active: number; onSelect: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 40, left: 0, bottom: 0, width: 68, zIndex: 2000, background: "#0a1520", borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column", paddingTop: 8 }}>
      {tabs.map(tab => (
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

type SavedOverlay = { file: string; macros: Record<string, string>; label: string; pos: { x: number; y: number }; locked?: boolean };
type SavedLayout = { name: string; positions: Record<string, { x: number; y: number; locked: boolean }>; hidden?: string[]; overlays?: SavedOverlay[] };

function loadSavedLayouts(): SavedLayout[] {
  try { return JSON.parse(localStorage.getItem("panel:layouts") ?? "[]"); } catch { return []; }
}

function SettingsPanel({ panelDefaults, hiddenPanels, overlays, onClose, onBumpLayout, onResetHidden, onRestoreHidden, onRestoreOverlays }: { panelDefaults: Record<string, { x: number; y: number }>; hiddenPanels: Set<string>; overlays: AppOverlay[]; onClose: () => void; onBumpLayout: () => void; onResetHidden: () => void; onRestoreHidden: (hidden: string[]) => void; onRestoreOverlays: (ovs: SavedOverlay[]) => void }) {
  const panelIds = Object.keys(panelDefaults);
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
    panelIds.forEach(id => {
      const s = localStorage.getItem(`panel:${id}`);
      if (s) try { positions[id] = JSON.parse(s); } catch { /* skip */ }
    });
    const savedOverlays: SavedOverlay[] = overlays.map(ov => {
      let pos = ov.pos;
      let locked = false;
      try {
        const s = localStorage.getItem(`overlay:${ov.file}`);
        if (s) { const p = JSON.parse(s); pos = { x: p.x, y: p.y }; locked = p.locked ?? false; }
      } catch { /* skip */ }
      return { file: ov.file, macros: ov.macros, label: ov.label, pos, locked };
    });
    persistLayouts([...layouts.filter(l => l.name !== name), { name, positions, hidden: [...hiddenPanels], overlays: savedOverlays }]);
    setNaming(false);
    setNameInput("");
  }

  function restoreLayout(layout: SavedLayout) {
    panelIds.forEach(id => {
      if (layout.positions[id])
        localStorage.setItem(`panel:${id}`, JSON.stringify(layout.positions[id]));
    });
    onRestoreHidden(layout.hidden ?? []);
    onRestoreOverlays(layout.overlays ?? []);
    onBumpLayout();
    onClose();
  }

  function resetToDefault() {
    panelIds.forEach(id => {
      const def = panelDefaults[id] ?? { x: 60, y: 60 };
      localStorage.setItem(`panel:${id}`, JSON.stringify({ ...def, locked: false }));
    });
    onResetHidden();
    onRestoreOverlays([]);
    onBumpLayout();
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
    <div style={{ position: "fixed", top: 44, right: 16, zIndex: 10000, background: "#0f2035", border: "1px solid #1e3a5f", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", minWidth: 220, padding: "8px 0" }}>

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
  const [hints,    setHints]    = useState<string[]>([]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // When a file is selected, fetch it and extract $(MACRO) references as hints.
  useEffect(() => {
    if (!selected) { setHints([]); return; }
    fetch(`/ui/${selected.name}`)
      .then(r => r.text())
      .then(xml => {
        const found = new Set<string>();
        for (const m of xml.matchAll(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g))
          found.add(m[1]);
        setHints([...found].sort());
      })
      .catch(() => setHints([]));
  }, [selected]);

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
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
            {hints.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 58, flexWrap: "wrap" }}>
                <span style={{ color: "#546e8a", fontSize: 11 }}>Expected:</span>
                {hints.map(h => (
                  <span
                    key={h}
                    title={`Click to add ${h}=`}
                    onClick={() => setMacroStr(s => s ? `${s},${h}=` : `${h}=`)}
                    style={{ color: "#4a90d9", fontSize: 11, fontFamily: "monospace", cursor: "pointer", background: "#0a1828", borderRadius: 3, padding: "1px 5px", border: "1px solid #1e3a5f" }}
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
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

// ── PV right-click context menu ──────────────────────────────────────────────

interface PvContextEvent { pvName: string; rawData: unknown; x: number; y: number }

function PvInfoDialog({ pvName, rawData, onClose }: { pvName: string; rawData: unknown; onClose: () => void }) {
  const d = rawData as any;
  const val   = d?.value;
  const alarm = d?.alarm;
  const time  = d?.time;
  const disp  = d?.display;

  const typeName = val?.type?.name ?? (
    val?.doubleValue  !== undefined ? "DBF_DOUBLE"  :
    val?.floatValue   !== undefined ? "DBF_FLOAT"   :
    val?.intValue     !== undefined ? "DBF_LONG"    :
    val?.stringValue  !== undefined ? "DBF_STRING"  :
    val?.arrayValue   !== undefined ? "DBF_ARRAY"   : "—"
  );
  const rawNum   = val?.doubleValue ?? val?.floatValue ?? val?.intValue ?? null;
  const rawStr   = val?.stringValue ?? null;
  const dispVal  = rawStr ?? (rawNum !== null ? String(rawNum) : "—");
  const numVal   = rawNum !== null ? rawNum.toPrecision(16) : rawStr ?? "—";
  // cs-web-lib stores alarm quality as alarm.quality, timestamp as time.datetime
  const alarmQuality = alarm?.quality ?? "";
  const severityMap: Record<string, string> = { valid: "NO_ALARM", warning: "MINOR", alarm: "MAJOR", invalid: "INVALID" };
  const severity  = severityMap[alarmQuality] ?? (alarmQuality ? alarmQuality.toUpperCase() : "—");
  const alarmSt   = alarmQuality ? "OK" : "—";
  const precision = disp?.precision ?? "—";
  const units     = disp?.units ?? null;
  const count     = val?.arrayValue ? Object.keys(val.arrayValue).length - 1 : 1;

  let tsStr = "—";
  if (time?.datetime) {
    tsStr = new Date(time.datetime).toLocaleString();
  }

  const row = (label: string, value: string) => (
    <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
      <span style={{ color: "#90caf9", minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#e0e0e0", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</span>
    </div>
  );

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9100 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 9101, background: "#0f2035", border: "1px solid #1e3a5f", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 380, padding: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a3a5c", borderRadius: "8px 8px 0 0", padding: "8px 14px" }}>
          <span style={{ color: "#bbdefb", fontWeight: 700, fontSize: 13, fontFamily: "sans-serif" }}>PV Info</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ padding: "12px 16px", fontSize: 12, fontFamily: "sans-serif" }}>
          <div style={{ color: "#7a9ab8", marginBottom: 8, fontSize: 11 }}>! configuration values are fetched once</div>
          <div style={{ color: "#4fc3f7", fontWeight: 700, marginBottom: 4 }}>{pvName}</div>
          <div style={{ color: "#90caf9", marginBottom: 8, fontSize: 11 }}>Plugin: epics3 : loaded &amp; connected</div>
          <div style={{ borderTop: "1px solid #1e3a5f", marginBottom: 8 }} />
          {row("TimeStamp:", tsStr)}
          {row("Type:", typeName)}
          {row("Count:", String(count))}
          {row("Value:", dispVal)}
          {row("Value (num):", numVal)}
          {row("Severity:", severity)}
          {row("Alarm status:", alarmSt)}
          {units && row("Units:", units)}
          {row("Precision (channel):", String(precision))}
        </div>
      </div>
    </>,
    document.body
  );
}

function PvContextMenu({ ctx, onClose }: { ctx: PvContextEvent; onClose: () => void }) {
  const [showInfo, setShowInfo] = useState(false);
  // Keep menu within viewport
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [overlays, setOverlays] = useState<AppOverlay[]>([]);
  const [pvContext, setPvContext] = useState<PvContextEvent | null>(null);

  useEffect(() => {
    function handler(e: Event) { setPvContext((e as CustomEvent<PvContextEvent>).detail); }
    window.addEventListener("pv-context", handler);
    return () => window.removeEventListener("pv-context", handler);
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      setHiddenPanels(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
    window.addEventListener("show-panel", handler);
    return () => window.removeEventListener("show-panel", handler);
  }, []);
  const counter = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [layoutKey, setLayoutKey] = useState(0);
  const [activeTab, setActiveTab] = useState(config.tabs[0].id);
  const activeTabColor = config.tabs.find(t => t.id === activeTab)?.color ?? "#0a1520";
  const [hiddenPanels, setHiddenPanels] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem("panel-hidden");
      if (s) return new Set(JSON.parse(s));
    } catch { /* ignore */ }
    return new Set(config.defaultHiddenPanels ?? []);
  });

  useEffect(() => {
    localStorage.setItem("panel-hidden", JSON.stringify([...hiddenPanels]));
  }, [hiddenPanels]);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;   // always reflects the current tab, readable from any closure
  const uiFiles = useUiFiles();

  function openFromPicker(file: string, macros: Record<string, string>) {
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file, macros, label: file.split("/").pop() ?? file }
    }));
  }

  useEffect(() => {
    function handler(e: Event) {
      const { file, macros, label, replace, sourceFile, singleton } = (e as CustomEvent).detail;
      // Read the active tab from the ref — always current, even though this handler
      // is a stale closure (activeTabRef is a stable object, .current is always fresh).
      const tabId = activeTabRef.current;
      const id = ++counter.current;
      const offset = ((id - 1) % 6) * 24;
      if (replace && sourceFile) {
        // Close all overlays from the same source, then open the replacement.
        setOverlays(prev => [
          ...prev.filter(o => o.sourceFile !== sourceFile),
          { id, file, macros, label, pos: { x: 120, y: 80 }, sourceFile, tabId },
        ]);
      } else if (singleton) {
        // Only open if no overlay with the same file+macros is already present.
        const macrosKey = JSON.stringify(macros);
        setOverlays(prev => {
          if (prev.some(o => o.file === file && JSON.stringify(o.macros) === macrosKey)) return prev;
          return [...prev, { id, file, macros, label, pos: { x: 120 + offset, y: 80 + offset }, sourceFile, tabId }];
        });
      } else {
        setOverlays(prev => [...prev, { id, file, macros, label, pos: { x: 120 + offset, y: 80 + offset }, sourceFile, tabId }]);
      }
    }
    window.addEventListener("open-ui", handler);
    return () => window.removeEventListener("open-ui", handler);
  }, []);

  return (
    <AppErrorBoundary>
    <div
      style={{ background: "rgb(222,222,227)", minHeight: "100vh", minWidth: 2000, position: "relative", fontFamily: "Liberation Sans, Arial, sans-serif" }}
      onClick={() => settingsOpen && setSettingsOpen(false)}
    >

      {/* App-level overlays — only show overlays belonging to the active tab (or tab-less ones) */}
      {overlays.filter(ov => ov.tabId == null || ov.tabId === activeTab).map(ov => (
        <AppOverlayPanel key={ov.id} ov={ov} onClose={() => setOverlays(prev => prev.filter(o => o.id !== ov.id))} />
      ))}

      {/* Sidebar */}
      <Sidebar tabs={config.tabs} active={activeTab} onSelect={setActiveTab} />

      {/* Page title (fixed, acts as header) */}
      {/* APS logo — bottom right */}
      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000, opacity: 0.85 }}>
        <img src="/aps-logo.png" alt="Argonne National Laboratory | APS" style={{ height: "40px", width: "auto", display: "block" }} />
      </div>

      {/* Page title (fixed, acts as header) */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 2001, background: activeTabColor, borderBottom: "1px solid rgba(0,0,0,0.15)", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.3s" }}>
        <span style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>{config.title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
          {(config.quickLinks ?? []).map(ql => (
            <button
              key={ql.label}
              onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
                detail: { file: ql.file, macros: ql.macros ?? {}, label: ql.label }
              }))}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
            >
              {ql.label}
            </button>
          ))}
          <button
            onClick={() => setPickerOpen(true)}
            style={{ background: "none", border: "1px solid transparent", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
          >
            Open…
          </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            title="Settings"
            style={{ background: settingsOpen ? "rgba(0,0,0,0.15)" : "none", border: "1px solid " + (settingsOpen ? "rgba(255,255,255,0.4)" : "transparent"), borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "3px 7px" }}
          >
            ⚙
          </button>
          {settingsOpen && createPortal(<SettingsPanel
            panelDefaults={config.panelDefaults}
            hiddenPanels={hiddenPanels}
            overlays={overlays}
            onClose={() => setSettingsOpen(false)}
            onBumpLayout={() => setLayoutKey(k => k + 1)}
            onResetHidden={() => setHiddenPanels(new Set(config.defaultHiddenPanels ?? []))}
            onRestoreHidden={hidden => setHiddenPanels(new Set(hidden))}
            onRestoreOverlays={saved => {
              saved.forEach(ov => localStorage.setItem(`overlay:${ov.file}`, JSON.stringify({ x: ov.pos.x, y: ov.pos.y, locked: ov.locked ?? false })));
              const tabId = activeTabRef.current;
              setOverlays(saved.map(ov => ({ id: ++counter.current, file: ov.file, macros: ov.macros, label: ov.label, pos: ov.pos, tabId })));
            }}
          />, document.body)}
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

      {/* ── Active tab panels ── */}
      {(config.tabPanels[activeTab] ?? [])
        .filter(panel => !hiddenPanels.has(panel.id))
        .map(panel => (
          <DraggablePanel
            key={`${panel.id}-${layoutKey}`}
            id={panel.id}
            title={panel.title}
            defaultPos={config.panelDefaults[panel.id]}
            onClose={() => setHiddenPanels(prev => new Set([...prev, panel.id]))}
          >
            <panel.Content />
          </DraggablePanel>
        ))}

      {pvContext && <PvContextMenu ctx={pvContext} onClose={() => setPvContext(null)} />}
    </div>
    </AppErrorBoundary>
  );
}
