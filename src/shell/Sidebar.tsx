import { useState, useRef, useEffect } from "react";
import type { Tab } from "../lib/deployment";

// Icon options for the "+" picker. First entry is the default selection.
// Rendered as a 3x3 grid in the sidebar (3 columns via CSS).
const ICON_CHOICES = [
  "🔬", "🧪", "🧬",
  "⚗️", "🌡️", "💎",
  "💡", "📊", "📈",
];

export function Sidebar({ tabs, active, onSelect, userTabIds, onCreate, onRemove }: {
  tabs: Tab[];
  active: number;
  onSelect: (id: number) => void;
  /** Subset of `tabs` that are user-created — these get an X-on-hover
   * remove button. Deployment-defined tabs don't. */
  userTabIds: Set<number>;
  onCreate: (label: string, icon: string) => void;
  onRemove: (id: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftIcon, setDraftIcon] = useState(ICON_CHOICES[0]);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);

  function commit() {
    const t = draft.trim();
    if (t) onCreate(t, draftIcon);
    setDraft("");
    setDraftIcon(ICON_CHOICES[0]);
    setCreating(false);
  }

  function cancel() {
    setDraft("");
    setDraftIcon(ICON_CHOICES[0]);
    setCreating(false);
  }

  return (
    <div style={{ position: "fixed", top: 40, left: 0, bottom: 0, width: 68, zIndex: 2000, background: "#0a1520", borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column", paddingTop: 8 }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        const isUser = userTabIds.has(tab.id);
        return (
          <div key={tab.id}
            style={{ position: "relative" }}
            onMouseEnter={() => setHoverId(tab.id)}
            onMouseLeave={() => setHoverId(h => h === tab.id ? null : h)}>
            <button
              onClick={() => onSelect(tab.id)}
              style={{
                background: isActive ? "#1a3a5c" : "none",
                border: "none",
                borderLeft: `3px solid ${isActive ? "#4a90d9" : "transparent"}`,
                color: isActive ? "#90caf9" : "#546e8a",
                cursor: "pointer",
                padding: "12px 0",
                width: "100%",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1, color: tab.color }}>{tab.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{tab.label}</span>
            </button>
            {isUser && hoverId === tab.id && (
              <button
                title={`Remove tab "${tab.label}"`}
                aria-label={`Remove tab ${tab.label}`}
                onClick={e => { e.stopPropagation(); onRemove(tab.id); }}
                style={{
                  position: "absolute", top: 4, right: 4,
                  width: 16, height: 16, padding: 0, lineHeight: 1,
                  background: "rgba(0,0,0,0.4)", border: "1px solid #4a90d9",
                  color: "#cce0ff", borderRadius: 3, cursor: "pointer",
                  fontSize: 11,
                }}
              >×</button>
            )}
          </div>
        );
      })}

      {/* "+" / inline name + icon picker */}
      {creating ? (
        <div style={{ padding: "6px 4px", display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Icon picker: 2x3 grid of choices, selected one highlighted. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
            {ICON_CHOICES.map(icon => {
              const isSel = icon === draftIcon;
              return (
                <button key={icon}
                  onClick={() => setDraftIcon(icon)}
                  title={`Use ${icon}`}
                  aria-label={`Choose icon ${icon}`}
                  style={{
                    background: isSel ? "#1a3a5c" : "transparent",
                    border: `1px solid ${isSel ? "#4a90d9" : "transparent"}`,
                    color: "#cce0ff", borderRadius: 3,
                    padding: "2px 0", cursor: "pointer",
                    fontSize: 14, lineHeight: 1,
                  }}>{icon}</button>
              );
            })}
          </div>
          <input
            ref={inputRef}
            value={draft}
            placeholder="Name"
            aria-label="New tab name"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") cancel();
            }}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#1e2a3a", border: "1px solid #4a90d9",
              color: "#fff", padding: "3px 5px", borderRadius: 3,
              fontSize: 11, outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 2 }}>
            <button onClick={commit}
              style={{ flex: 1, background: "#1a3a5c", border: "1px solid #4a90d9", color: "#90caf9", borderRadius: 3, padding: "2px 0", cursor: "pointer", fontSize: 10 }}>
              Save
            </button>
            <button onClick={cancel}
              style={{ background: "none", border: "1px solid #546e8a", color: "#546e8a", borderRadius: 3, padding: "2px 6px", cursor: "pointer", fontSize: 10 }}>
              ×
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          title="New tab"
          style={{
            background: "none", border: "none",
            borderLeft: "3px solid transparent",
            color: "#546e8a", cursor: "pointer",
            padding: "12px 0", width: "100%",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            fontSize: 18, lineHeight: 1,
          }}
        >+</button>
      )}
    </div>
  );
}
