import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { DeploymentConfig, PanelTemplate } from "../lib/deployment";

interface PanelEntry { id: string; title: string; tabId: number; tabLabel: string }

// Discriminated row type so the unified list can show static panels and
// spawnable templates side-by-side with consistent selection behavior.
type Row =
  | { kind: "panel"; entry: PanelEntry }
  | { kind: "template"; template: PanelTemplate };

function rowKey(r: Row): string {
  return r.kind === "panel" ? `panel/${r.entry.tabId}/${r.entry.id}` : `tmpl/${r.template.id}`;
}
function rowTitle(r: Row): string {
  return r.kind === "panel" ? r.entry.title : r.template.title;
}
function rowMeta(r: Row): string {
  return r.kind === "panel" ? r.entry.tabLabel : "";
}

export function PanelPickerDialog({ config, onClose, onOpen }: {
  config: DeploymentConfig;
  onClose: () => void;
  onOpen: (panelId: string, tabId: number) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  // When a template with prompts is "opened", we switch from list view to a
  // form view to collect the macro values before spawning.
  const [prompting, setPrompting] = useState<{ template: PanelTemplate; values: Record<string, string> } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { if (prompting) setPrompting(null); else onClose(); } }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prompting]);

  const panelEntries: PanelEntry[] = config.tabs
    .flatMap(tab =>
      (config.tabPanels[tab.id] ?? []).map(p => ({
        id: p.id, title: p.title, tabId: tab.id, tabLabel: tab.label,
      }))
    );
  const panelRows: Row[] = panelEntries.map(e => ({ kind: "panel", entry: e }));
  const templateRows: Row[] = (config.templates ?? []).map(t => ({ kind: "template", template: t }));
  const rows: Row[] = [...panelRows, ...templateRows].sort((a, b) =>
    rowTitle(a).localeCompare(rowTitle(b), undefined, { sensitivity: "base" })
  );

  const q = query.toLowerCase();
  const filtered = rows.filter(r =>
    rowTitle(r).toLowerCase().includes(q) ||
    rowMeta(r).toLowerCase().includes(q)
  );

  function activate(row: Row) {
    if (row.kind === "panel") {
      onOpen(row.entry.id, row.entry.tabId);
      onClose();
      return;
    }
    const t = row.template;
    if (!t.prompts || t.prompts.length === 0) {
      t.spawn({});
      onClose();
      return;
    }
    const initial: Record<string, string> = {};
    for (const p of t.prompts) initial[p.key] = p.default ?? "";
    setPrompting({ template: t, values: initial });
  }

  function handleOpen() {
    if (!selected) return;
    activate(selected);
  }

  function submitPrompt() {
    if (!prompting) return;
    prompting.template.spawn(prompting.values);
    setPrompting(null);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: "#1e2a3a", border: "1px solid #4a90d9",
    color: "#fff", padding: "6px 8px", borderRadius: 4,
    fontSize: 13, outline: "none",
  };
  const btnStyle = (primary: boolean, disabled = false): React.CSSProperties => ({
    background: primary ? "#1a3a5c" : "none",
    border: `1px solid ${primary ? "#4a90d9" : "#546e8a"}`,
    color: primary ? "#90caf9" : "#546e8a",
    borderRadius: 4, padding: "5px 16px",
    cursor: disabled ? "default" : "pointer",
    fontSize: 13, opacity: disabled ? 0.4 : 1,
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
          <span style={{ color: "#bbdefb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
            {prompting ? `Open ${prompting.template.title}` : "Open Panel"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        {prompting ? (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {prompting.template.prompts!.map(p => (
              <label key={p.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#90caf9", fontSize: 12 }}>{p.label}</span>
                <input
                  autoFocus
                  value={prompting.values[p.key] ?? ""}
                  placeholder={p.placeholder ?? ""}
                  aria-label={p.label}
                  onChange={e => setPrompting(s => s && ({ ...s, values: { ...s.values, [p.key]: e.target.value } }))}
                  onKeyDown={e => { if (e.key === "Enter") submitPrompt(); }}
                  style={inputStyle}
                />
              </label>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
              <button onClick={() => setPrompting(null)} style={btnStyle(false)}>Back</button>
              <button onClick={submitPrompt} style={btnStyle(true)}>Open</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              autoFocus
              placeholder="Search by title or tab…"
              aria-label="Search panels"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleOpen(); }}
              style={inputStyle}
            />

            <div style={{ height: 300, overflowY: "auto", border: "1px solid #1e3a5f", borderRadius: 4, background: "#0a1828" }}>
              {filtered.map(r => {
                const isSelected = selected !== null && rowKey(selected) === rowKey(r);
                return (
                  <div
                    key={rowKey(r)}
                    onClick={() => setSelected(r)}
                    onDoubleClick={() => { setSelected(r); activate(r); }}
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
                    <span>{rowTitle(r)}</span>
                    <span style={{ color: r.kind === "template" ? "#90caf9" : "#546e8a", fontSize: 11, fontFamily: "monospace", marginLeft: 12, flexShrink: 0 }}>
                      {rowMeta(r)}
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
              <button onClick={handleOpen} disabled={!selected} style={btnStyle(true, !selected)}>Open</button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
