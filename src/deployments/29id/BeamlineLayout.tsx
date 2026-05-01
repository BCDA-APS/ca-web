import { BLLayoutC } from "./BLLayoutC";
import { BLLayoutAB } from "./BLLayoutAB";

export function BeamlineLayout() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, marginRight: -1 }}><BLLayoutC /></div>
      <div style={{ flexShrink: 0 }}><BLLayoutAB /></div>
    </div>
  );
}
