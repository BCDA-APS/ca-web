import { useState } from "react";
import type { AppOverlay } from "./OverlayPanel";
import type { SavedLayout, SavedOverlay } from "../lib/deployment";
import { layoutKey } from "../lib/layoutStorage";

export type { SavedLayout, SavedOverlay } from "../lib/deployment";

const DRAFTS_KEY = "panel:layouts";

function loadDrafts(): SavedLayout[] {
  try { return JSON.parse(localStorage.getItem(layoutKey(DRAFTS_KEY)) ?? "[]"); } catch { return []; }
}

export function SettingsPanel({ panelDefaults, hiddenPanels, overlays, sharedLayouts, onClose, onBumpLayout, onResetHidden, onRestoreHidden, onRestoreOverlays }: {
  panelDefaults: Record<string, { x: number; y: number }>;
  hiddenPanels: Set<string>;
  overlays: AppOverlay[];
  sharedLayouts: SavedLayout[];
  onClose: () => void;
  onBumpLayout: () => void;
  onResetHidden: () => void;
  onRestoreHidden: (hidden: string[]) => void;
  onRestoreOverlays: (ovs: SavedOverlay[]) => void;
}) {
  const panelIds = Object.keys(panelDefaults);
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [drafts, setDrafts] = useState<SavedLayout[]>(loadDrafts);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  function persistDrafts(next: SavedLayout[]) {
    localStorage.setItem(layoutKey(DRAFTS_KEY), JSON.stringify(next));
    setDrafts(next);
  }

  function buildLayout(name: string): SavedLayout {
    const positions: SavedLayout["positions"] = {};
    panelIds.forEach(id => {
      const s = localStorage.getItem(layoutKey(`panel:${id}`));
      if (s) try { positions[id] = JSON.parse(s); } catch { /* skip */ }
    });
    const savedOverlays: SavedOverlay[] = overlays.map(ov => {
      let pos = ov.pos;
      let locked = false;
      try {
        const s = localStorage.getItem(layoutKey(`overlay:${ov.file}`));
        if (s) { const p = JSON.parse(s); pos = { x: p.x, y: p.y }; locked = p.locked ?? false; }
      } catch { /* skip */ }
      return { file: ov.file, macros: ov.macros, label: ov.label, pos, locked };
    });
    return { name, positions, hidden: [...hiddenPanels], overlays: savedOverlays };
  }

  function saveDraft() {
    const name = nameInput.trim();
    if (!name) return;
    const layout = buildLayout(name);
    persistDrafts([...drafts.filter(l => l.name !== name), layout]);
    setNaming(false);
    setNameInput("");
  }

  function restoreLayout(layout: SavedLayout) {
    panelIds.forEach(id => {
      if (layout.positions[id])
        localStorage.setItem(layoutKey(`panel:${id}`), JSON.stringify(layout.positions[id]));
    });
    onRestoreHidden(layout.hidden ?? []);
    onRestoreOverlays(layout.overlays ?? []);
    onBumpLayout();
    onClose();
  }

  function resetToDefault() {
    panelIds.forEach(id => {
      const def = panelDefaults[id] ?? { x: 60, y: 60 };
      localStorage.setItem(layoutKey(`panel:${id}`), JSON.stringify({ ...def, locked: false }));
    });
    onResetHidden();
    onRestoreOverlays([]);
    onBumpLayout();
    onClose();
  }

  function copyAsJson(layout: SavedLayout) {
    const text = JSON.stringify(layout, null, 2);
    const done = () => { setCopiedName(layout.name); setTimeout(() => setCopiedName(null), 1500); };
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallback(text, done));
      } else {
        fallback(text, done);
      }
    } catch { fallback(text, done); }
  }

  function fallback(text: string, done: () => void) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch { /* ignore */ }
    document.body.removeChild(ta);
  }

  const menuItemStyle: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left",
    padding: "7px 14px", background: "none", border: "none",
    color: "#cce0ff", fontSize: 13, cursor: "pointer",
  };
  const hoverOn  = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "#1a3a5c"; };
  const hoverOff = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.background = "none"; };
  const sectionLabel: React.CSSProperties = {
    padding: "4px 14px 6px", color: "#546e8a", fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 1,
  };
  const tagStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
    color: "#7fa9d6", border: "1px solid #2b4a72", borderRadius: 3,
    padding: "0 4px", marginLeft: 8,
  };

  return (
    <div style={{ position: "fixed", top: 44, right: 16, zIndex: 10000, background: "#0f2035", border: "1px solid #1e3a5f", borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.6)", minWidth: 260, padding: "8px 0" }}>

      <div style={sectionLabel}>Layout</div>

      {naming ? (
        <div style={{ padding: "4px 14px 8px", display: "flex", gap: 6 }}>
          <input
            autoFocus
            value={nameInput}
            placeholder="Layout name…"
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") saveDraft();
              if (e.key === "Escape") { setNaming(false); setNameInput(""); }
            }}
            style={{ flex: 1, background: "#1e2a3a", border: "1px solid #4a90d9", color: "#fff", padding: "4px 6px", borderRadius: 3, fontSize: 12 }}
          />
          <button
            onClick={e => { e.stopPropagation(); saveDraft(); }}
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

      {sharedLayouts.length > 0 && <>
        <div style={{ margin: "6px 14px", borderTop: "1px solid #1e3a5f" }} />
        <div style={sectionLabel}>Shared (deployment)</div>
        {sharedLayouts.map(layout => (
          <div key={`shared-${layout.name}`} style={{ display: "flex", alignItems: "center" }}>
            <button style={{ ...menuItemStyle, flex: 1, padding: "5px 14px", display: "flex", alignItems: "center" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              onClick={e => { e.stopPropagation(); restoreLayout(layout); }}>
              <span>{layout.name}</span>
              <span style={tagStyle}>shared</span>
            </button>
          </div>
        ))}
      </>}

      {drafts.length > 0 && <>
        <div style={{ margin: "6px 14px", borderTop: "1px solid #1e3a5f" }} />
        <div style={sectionLabel}>My drafts</div>
        {drafts.map(layout => (
          <div key={`draft-${layout.name}`} style={{ display: "flex", alignItems: "center" }}>
            <button style={{ ...menuItemStyle, flex: 1, padding: "5px 14px" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              onClick={e => { e.stopPropagation(); restoreLayout(layout); }}>
              {layout.name}
            </button>
            <button
              title="Copy as JSON for config.json"
              onClick={e => { e.stopPropagation(); copyAsJson(layout); }}
              style={{ background: "none", border: "none", color: copiedName === layout.name ? "#81c784" : "#546e8a", cursor: "pointer", fontSize: 11, padding: "4px 6px", lineHeight: 1, flexShrink: 0, fontFamily: "monospace" }}
              onMouseEnter={e => { if (copiedName !== layout.name) (e.currentTarget as HTMLElement).style.color = "#90caf9"; }}
              onMouseLeave={e => { if (copiedName !== layout.name) (e.currentTarget as HTMLElement).style.color = "#546e8a"; }}
            >{copiedName === layout.name ? "copied" : "JSON"}</button>
            <button
              title="Delete"
              onClick={e => { e.stopPropagation(); persistDrafts(drafts.filter(l => l.name !== layout.name)); }}
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
