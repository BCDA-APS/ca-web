import { useState, useEffect } from "react";
import type { AppOverlay } from "./OverlayPanel";
import type { SavedLayout, SavedOverlay, SavedCameraOverlay, SavedScanViewOverlay, SavedStripChartOverlay } from "../lib/deployment";
import {
  layoutGet,
  layoutSet,
  layoutDelete,
  listLayouts,
  readLayout,
  writeLayout,
  deleteLayout,
  slugifyLayoutName,
} from "../lib/layoutStorage";

export type { SavedLayout, SavedOverlay } from "../lib/deployment";

export function SettingsPanel({ panelDefaults, hiddenPanels, borrowedPanels, overlays, sharedLayouts, onClose, onBumpLayout, onResetHidden, onRestoreHidden, onRestoreBorrowed, onRestoreOverlays, onRestoreCameras, onRestoreScanViews, onRestoreStripCharts, onSwitchDeployment }: {
  panelDefaults: Record<string, { x: number; y: number }>;
  hiddenPanels: Set<string>;
  borrowedPanels: Map<string, Set<number>>;
  overlays: AppOverlay[];
  sharedLayouts: SavedLayout[];
  onClose: () => void;
  onBumpLayout: () => void;
  onResetHidden: () => void;
  onRestoreHidden: (hidden: string[]) => void;
  onRestoreBorrowed: (borrowed: Array<{ id: string; tabIds: number[] }>) => void;
  onRestoreOverlays: (ovs: SavedOverlay[]) => void;
  onRestoreCameras: (cams: SavedCameraOverlay[]) => void;
  onRestoreScanViews: (svs: SavedScanViewOverlay[]) => void;
  onRestoreStripCharts: (scs: SavedStripChartOverlay[]) => void;
  onSwitchDeployment: () => void;
}) {
  const panelIds = Object.keys(panelDefaults);
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [drafts, setDrafts] = useState<SavedLayout[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const names = await listLayouts();
      const loaded = await Promise.all(names.map(async n => {
        const data = await readLayout(n);
        return data ? ({ ...(data as unknown as SavedLayout), name: n }) : null;
      }));
      if (cancelled) return;
      setDrafts(loaded.filter((l): l is SavedLayout => l !== null));
    })();
    return () => { cancelled = true; };
  }, []);

  function buildLayout(name: string): SavedLayout {
    const positions: SavedLayout["positions"] = {};
    panelIds.forEach(id => {
      const p = layoutGet<{ x: number; y: number; w?: number; h?: number; locked: boolean }>(`panel:${id}`);
      if (p) positions[id] = p;
    });
    // Borrowed panel positions live under composite keys (panel:<id>@<tabId>);
    // capture them alongside native positions so restore reproduces the full
    // layout — not just the borrows' existence but their placement too.
    borrowedPanels.forEach((tabIds, id) => {
      tabIds.forEach(tabId => {
        const key = `${id}@${tabId}`;
        const p = layoutGet<{ x: number; y: number; w?: number; h?: number; locked: boolean }>(`panel:${key}`);
        if (p) positions[key] = p;
      });
    });
    // Split overlays by kind so restore knows which factory to invoke. Each
    // dynamic-instance kind has its own SavedX type carrying spawn params +
    // (for chart kinds) a snapshot of the widget's localStorage state so
    // user customization survives.
    const uiOverlays = overlays.filter(o => o.kind == null || o.kind === "ui");
    const cameraOverlays = overlays.filter(o => o.kind === "camera");
    const scanviewOverlays = overlays.filter(o => o.kind === "scanview");
    const stripchartOverlays = overlays.filter(o => o.kind === "stripchart");
    const savedOverlays: SavedOverlay[] = uiOverlays.map(ov => {
      const p = layoutGet<{ x: number; y: number; locked?: boolean }>(`overlay:${ov.file}`);
      const pos = p ? { x: p.x, y: p.y } : ov.pos;
      const locked = p?.locked ?? false;
      return { file: ov.file, macros: ov.macros, label: ov.label, pos, locked };
    });
    const savedCameras: SavedCameraOverlay[] = cameraOverlays.map(ov => ({
      label: ov.label,
      prefix: ov.initialPrefix,
      knownCameras: ov.knownCameras,
      pos: ov.pos,
      size: ov.size,
      tabId: ov.tabId,
    }));
    const savedScanViews: SavedScanViewOverlay[] = scanviewOverlays.map(ov => ({
      label: ov.label,
      recordPv: ov.recordPv ?? "",
      defaultDetectors: ov.defaultDetectors,
      pos: ov.pos,
      size: ov.size,
      tabId: ov.tabId,
      state: layoutGet<Record<string, unknown>>(`scanviewchart:scanview-${ov.id}`) ?? undefined,
    }));
    const savedStripCharts: SavedStripChartOverlay[] = stripchartOverlays.map(ov => ({
      label: ov.label,
      initialPvs: ov.initialPvs,
      pos: ov.pos,
      size: ov.size,
      tabId: ov.tabId,
      state: layoutGet<Record<string, unknown>>(`stripchart:stripchart-${ov.id}`) ?? undefined,
    }));
    const savedBorrowed = [...borrowedPanels.entries()].map(([id, tabIds]) => ({
      id, tabIds: [...tabIds],
    }));
    return {
      name, positions, hidden: [...hiddenPanels], borrowed: savedBorrowed,
      overlays: savedOverlays, cameras: savedCameras,
      scanviews: savedScanViews, stripcharts: savedStripCharts,
    };
  }

  async function saveDraft() {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    const slug = slugifyLayoutName(trimmed);
    if (!slug || slug === "current") return;
    const layout = buildLayout(trimmed);
    const ok = await writeLayout(slug, layout as unknown as Record<string, unknown>);
    if (!ok) return;
    setDrafts(prev => [...prev.filter(l => l.name !== trimmed), layout]);
    setNaming(false);
    setNameInput("");
  }

  function restoreLayout(layout: SavedLayout) {
    // Iterate ALL position keys (both native panel ids and composite
    // borrowed keys like "29idc-chamber@3") so borrowed panels restore
    // to their saved positions, not stale localStorage values.
    Object.keys(layout.positions).forEach(key => {
      layoutSet(`panel:${key}`, layout.positions[key]);
    });
    onRestoreHidden(layout.hidden ?? []);
    onRestoreBorrowed(layout.borrowed ?? []);
    onRestoreOverlays(layout.overlays ?? []);
    onRestoreCameras(layout.cameras ?? []);
    onRestoreScanViews(layout.scanviews ?? []);
    onRestoreStripCharts(layout.stripcharts ?? []);
    onBumpLayout();
    onClose();
  }

  function resetToDefault() {
    panelIds.forEach(id => {
      const def = panelDefaults[id] ?? { x: 60, y: 60 };
      layoutSet(`panel:${id}`, { ...def, locked: false });
    });
    // Clear composite-key entries for currently-borrowed panels so reset
    // truly returns to a clean slate (no stale positions hanging around
    // for the next time the user borrows the same panel).
    borrowedPanels.forEach((tabIds, id) => {
      tabIds.forEach(tabId => layoutDelete(`panel:${id}@${tabId}`));
    });
    onResetHidden();
    onRestoreOverlays([]);
    onRestoreCameras([]);
    onRestoreScanViews([]);
    onRestoreStripCharts([]);
    onBumpLayout();
    onClose();
  }

  async function removeDraft(layout: SavedLayout) {
    const slug = slugifyLayoutName(layout.name);
    if (!slug) return;
    const ok = await deleteLayout(slug);
    if (!ok) return;
    setDrafts(prev => prev.filter(l => l.name !== layout.name));
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
            aria-label="Layout name"
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
        <div style={sectionLabel}>Saved layouts</div>
        {drafts.map(layout => (
          <div key={`draft-${layout.name}`} style={{ display: "flex", alignItems: "center" }}>
            <button style={{ ...menuItemStyle, flex: 1, padding: "5px 14px" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              onClick={e => { e.stopPropagation(); restoreLayout(layout); }}>
              {layout.name}
            </button>
            <button
              title="Delete"
              onClick={e => { e.stopPropagation(); void removeDraft(layout); }}
              style={{ background: "none", border: "none", color: "#546e8a", cursor: "pointer", fontSize: 15, padding: "4px 10px", lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#ef5350"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#546e8a"; }}
            >×</button>
          </div>
        ))}
      </>}

      <div style={{ margin: "6px 14px", borderTop: "1px solid #1e3a5f" }} />
      <div style={sectionLabel}>Deployment</div>
      <button style={menuItemStyle} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
        onClick={e => { e.stopPropagation(); onSwitchDeployment(); }}>
        Switch deployment…
      </button>
    </div>
  );
}
