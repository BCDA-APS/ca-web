import { BeamlineLayout } from "./BeamlineLayout";
import { MonoSection, IdSection } from "./EnergyShared";

export function BeamlineEnergy() {
  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "sans-serif", minWidth: 520 }}>
      <div style={{ display: "flex", gap: 16, padding: "10px 14px 0" }}>
        <MonoSection />
        <div style={{ width: 1, background: "#b0b0b8", alignSelf: "stretch", flexShrink: 0 }} />
        <IdSection />
      </div>
      <div style={{ borderTop: "1px solid #b0b0b8", margin: "10px 0 0" }} />
      <div style={{ padding: "6px 0 10px" }}>
        <BeamlineLayout />
      </div>
    </div>
  );
}
