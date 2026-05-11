import { BLLayoutC } from "./BLLayoutC";
import { BLLayoutAB } from "./BLLayoutAB";
import { BLLayoutD } from "./BLLayoutD";
import { BLLayoutE } from "./BLLayoutE";
import { colors, fontSize } from "../../lib/theme";

function showPanel(id: string) {
  window.dispatchEvent(new CustomEvent("show-panel", { detail: { id } }));
}

const shortcutBtn: React.CSSProperties = {
  background: colors.relatedBg, color: colors.relatedFg,
  border: `1px solid ${colors.relatedBorder}`, borderRadius: 4,
  padding: "2px 8px", fontSize: fontSize.label,
  cursor: "pointer", fontFamily: "sans-serif",
};

export function BeamlineLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
      {/* Shortcut buttons — top right corner */}
      <div style={{ position: "absolute", top: 0, right: 0, display: "flex", gap: 4 }}>
        <button style={shortcutBtn} onClick={() => showPanel("29id-mirrors")}>Mirrors</button>
        <button style={shortcutBtn} onClick={() => showPanel("29id-slits")}>Slits</button>
      </div>
      {/* Top row: E + D (beam goes right-to-left: D right-angle at x=405 from row left) */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        <div style={{ flexShrink: 0 }}><BLLayoutE /></div>
        <div style={{ flexShrink: 0 }}><BLLayoutD /></div>
      </div>
      {/* Bottom row: C + AB; marginLeft=152 → AB M3R center at 407 = D vertical center at 150+257=407 (exact) */}
      <div style={{ display: "flex", alignItems: "flex-start", marginLeft: 153, gap: 0 }}>
        <div style={{ flexShrink: 0, marginRight: -1 }}><BLLayoutC /></div>
        <div style={{ flexShrink: 0 }}><BLLayoutAB /></div>
      </div>
    </div>
  );
}
