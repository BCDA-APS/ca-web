import { BLLayoutC } from "./BLLayoutC";
import { BLLayoutAB } from "./BLLayoutAB";

export function BeamlineLayout() {
  return (
    <div style={{ display: "flex", gap: 0 }}>
      <BLLayoutC />
      <BLLayoutAB />
    </div>
  );
}
