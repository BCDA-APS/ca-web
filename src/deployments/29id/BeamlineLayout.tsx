import { BLLayoutC } from "./BLLayoutC";
import { BLLayoutAB } from "./BLLayoutAB";
import { BLLayoutD } from "./BLLayoutD";
import { BLLayoutE } from "./BLLayoutE";

export function BeamlineLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
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
