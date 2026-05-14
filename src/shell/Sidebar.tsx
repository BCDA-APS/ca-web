import type { Tab } from "../lib/deployment";

export function Sidebar({ tabs, active, onSelect }: {
  tabs: Tab[];
  active: number;
  onSelect: (id: number) => void;
}) {
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
