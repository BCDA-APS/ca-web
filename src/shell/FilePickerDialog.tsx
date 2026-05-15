import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { parseArgs } from "../lib/UiRenderer";

export interface UiFile { name: string; dir: string }

export function useUiFiles(): UiFile[] {
  const [files, setFiles] = useState<UiFile[]>([]);
  useEffect(() => {
    fetch("/api/ui-files").then(r => r.json()).then(setFiles).catch(() => {});
  }, []);
  return files;
}

export function FilePickerDialog({ files, onClose, onOpen }: {
  files: UiFile[];
  onClose: () => void;
  onOpen: (file: string, macros: Record<string, string>) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [selected, setSelected] = useState<UiFile | null>(null);
  const [macroStr, setMacroStr] = useState("");
  const [hints,    setHints]    = useState<string[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          <span style={{ color: "#bbdefb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Open Display</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
        </div>

        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            autoFocus
            placeholder="Search by name or module…"
            aria-label="Search displays"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            style={inputStyle}
          />

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

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#90caf9", fontSize: 12, flexShrink: 0 }}>Macros:</span>
              <input
                placeholder="P=fr:,M=m1"
                aria-label="Macros"
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
