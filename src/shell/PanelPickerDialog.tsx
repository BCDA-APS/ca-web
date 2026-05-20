import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { DeploymentConfig } from "../lib/deployment";

interface PanelEntry { id: string; title: string; tabId: number; tabLabel: string }

export function PanelPickerDialog({ config, onClose, onOpen }: {
  config: DeploymentConfig;
  onClose: () => void;
  onOpen: (panelId: string, tabId: number) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<PanelEntry | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const entries: PanelEntry[] = config.tabs
    .flatMap(tab =>
      (config.tabPanels[tab.id] ?? []).map(p => ({
        id: p.id, title: p.title, tabId: tab.id, tabLabel: tab.label,
      }))
    )
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) ||
      a.tabLabel.localeCompare(b.tabLabel)
    );

  const q = query.toLowerCase();
  const filtered = entries.filter(e =>
    e.title.toLowerCase().includes(q) ||
    e.tabLabel.toLowerCase().includes(q) ||
    e.id.toLowerCase().includes(q)
  );

  function handleOpen() {
    if (!selected) return;
    onOpen(selected.id, selected.tabId);
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
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9990 }} />

      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 9991, width: 520,
        background: "#0f2035", border: "1px solid #1e3a5f",
        borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        display: "flex", flexDirection: "column",
        fontFamily: "Liberation Sans, Arial, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "#1a3a5c", borderRadius: "8px 8px 0 0" }}>
          <span style={{ color: "#bbdefb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Open Panel</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            autoFocus
            placeholder="Search by title, tab, or id…"
            aria-label="Search panels"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            onKeyDown={e => { if (e.key === "Enter") handleOpen(); }}
            style={inputStyle}
          />

          <div style={{ height: 300, overflowY: "auto", border: "1px solid #1e3a5f", borderRadius: 4, background: "#0a1828" }}>
            {filtered.map(p => {
              const isSelected = selected?.id === p.id && selected?.tabId === p.tabId;
              return (
                <div
                  key={`${p.tabId}/${p.id}`}
                  onClick={() => setSelected(p)}
                  onDoubleClick={() => { setSelected(p); onOpen(p.id, p.tabId); onClose(); }}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "5px 10px", cursor: "pointer",
                    background: isSelected ? "#1a3a5c" : "transparent",
                    borderLeft: `3px solid ${isSelected ? "#4a90d9" : "transparent"}`,
                    color: "#cce0ff", fontSize: 13,
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#12253a"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span>{p.title}</span>
                  <span style={{ color: "#546e8a", fontSize: 11, fontFamily: "monospace", marginLeft: 12, flexShrink: 0 }}>
                    {p.tabLabel} · {p.id}
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "12px 10px", color: "#546e8a", fontSize: 12 }}>No panels match</div>
            )}
          </div>

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
