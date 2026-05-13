import { useState } from "react";
import type { AppOverlay } from "./OverlayPanel";

export type SavedOverlay = {
  file: string;
  macros: Record<string, string>;
  label: string;
  pos: { x: number; y: number };
  locked?: boolean;
};

export type SavedLayout = {
  name: string;
  positions: Record<string, { x: number; y: number; locked: boolean }>;
  hidden?: string[];
  overlays?: SavedOverlay[];
};

function loadSavedLayouts(): SavedLayout[] {
  try { return JSON.parse(localStorage.getItem("panel:layouts") ?? "[]"); } catch { return []; }
}

export function SettingsPanel({ panelDefaults, hiddenPanels, overlays, onClose, onBumpLayout, onResetHidden, onRestoreHidden, onRestoreOverlays }: {
  panelDefaults: Record<string, { x: number; y: number }>;
  hiddenPanels: Set<string>;
  overlays: AppOverlay[];
  onClose: () => void;
  onBumpLayout: () => void;
  onResetHidden: () => void;
  onRestoreHidden: (hidden: string[]) => void;
  onRestoreOverlays: (ovs: SavedOverlay[]) => void;
}) {
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

      <div style={{ padding: "4px 14px 6px", color: "#546e8a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Layout</div>

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

      <button style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
        onClick={e => { e.stopPropagation(); resetToDefault(); }}>
        Reset to default positions
      </button>

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
