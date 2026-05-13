import { MotorRow } from "../../widgets/MotorRow";
import { MotorGrid } from "../../widgets/MotorGrid";
import { MotorCardRow } from "../../widgets/MotorCardRow";
import { MotorCardFlat } from "../../widgets/MotorCardFlat";
import { ReadbackRow } from "../../widgets/ReadbackRow";
import { StripChart } from "../../widgets/StripChart";
import { UiRenderer } from "../../lib/UiRenderer";
import type { DeploymentConfig } from "../../lib/deployment";
import rawConfig from "./config.json";

const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "motors",        title: "Motors",                          Content: MotorsContent },
    { id: "lorentzian",    title: "Detector — Simulated Lorentzian", Content: LorentzianContent },
    { id: "area-detector", title: "Area Detector — myad:cam1",       Content: AreaDetectorContent },
  ],
  2: [
    { id: "test",                 title: "Widget Test",        Content: TestContent },
    { id: "motor-card-test",      title: "Motor Cards",        Content: MotorCardTestContent },
    { id: "motor-card-row-test",  title: "Motor Cards (row)",  Content: MotorCardRowTestContent },
    { id: "motor-card-flat-test", title: "Motor Cards (flat)", Content: () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {["m1","m2","m3","m4","m5","m6"].map(m => <MotorCardFlat key={m} pv={`fr:${m}`} />)}
      </div>
    )},
  ],
};

export const config: DeploymentConfig = { ...rawConfig, tabPanels };

const MOTOR_DISPLAYS = [
  { label: "Tiny",  file: "/ui/motors/motorx_tiny.ui" },
  { label: "Small", file: "/ui/motors/motorx.ui" },
  { label: "More",  file: "/ui/motors/motorx_more.ui" },
  { label: "Setup", file: "/ui/motors/motorx_setup.ui" },
  { label: "All",   file: "/ui/motors/motorx_all.ui" },
];

const MOTORS = [
  { label: "Motor 1", pv: "fr:m1", macros: { P: "fr:", M: "m1" } },
  { label: "Motor 2", pv: "fr:m2", macros: { P: "fr:", M: "m2" } },
  { label: "Motor 3", pv: "fr:m3", macros: { P: "fr:", M: "m3" } },
  { label: "Motor 4", pv: "fr:m4", macros: { P: "fr:", M: "m4" } },
  { label: "Motor 5", pv: "fr:m5", macros: { P: "fr:", M: "m5" } },
  { label: "Motor 6", pv: "fr:m6", macros: { P: "fr:", M: "m6" } },
  { label: "Motor 7", pv: "fr:m7", macros: { P: "fr:", M: "m7" } },
  { label: "Motor 8", pv: "fr:m8", macros: { P: "fr:", M: "m8" } },
];

const tableStyle = {
  borderCollapse: "collapse" as const, width: "auto",
  background: "#0a1828", borderRadius: 4, overflow: "hidden",
};

const thStyle = {
  padding: "7px 12px", background: "#1a3a5c", color: "#90caf9",
  fontSize: 12, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: 0.8, textAlign: "left" as const,
};

function MotorsContent() {
  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Position</th>
          <th style={thStyle}>Setpoint</th>
          <th style={thStyle}>Tweak</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle} />
          <th style={thStyle} />
        </tr>
      </thead>
      <tbody>
        {MOTORS.map(m => (
          <MotorRow key={m.pv} label={m.label} pv={m.pv} displays={MOTOR_DISPLAYS} macros={m.macros} />
        ))}
      </tbody>
    </table>
  );
}

function LorentzianContent() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Value</th></tr></thead>
        <tbody>
          <ReadbackRow label="Noisy" pv="fr:userCalc1.VAL" />
        </tbody>
      </table>
      <StripChart id="nefarian-lorentzian"
        initialPvs={[{ pv: "fr:userCalc1.VAL", label: "Noisy", enabled: true }]} />
    </div>
  );
}

function AreaDetectorContent() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
      <table style={tableStyle}>
        <thead><tr><th style={thStyle}>Name</th><th style={thStyle}>Value</th></tr></thead>
        <tbody>
          <ReadbackRow label="Acquire"      pv="myad:cam1:Acquire_RBV" />
          <ReadbackRow label="Frame count"  pv="myad:cam1:ArrayCounter_RBV" />
          <ReadbackRow label="Exposure (s)" pv="myad:cam1:AcquireTime_RBV" />
          <ReadbackRow label="Image size X" pv="myad:cam1:SizeX_RBV" />
          <ReadbackRow label="Image size Y" pv="myad:cam1:SizeY_RBV" />
        </tbody>
      </table>
      <UiRenderer file="/ui/29id/29id_cam.ui" macros={{ P: "myad:" }} />
    </div>
  );
}

function TestContent() {
  return <UiRenderer file="/ui/test.ui" macros={{}} />;
}

function MotorCardTestContent() {
  return <MotorGrid prefix="fr:" motors={["m1","m2","m3","m4","m5","m6"]} columns={3} />;
}

function MotorCardRowTestContent() {
  const col1 = ["m1","m2","m3"];
  const col2 = ["m4","m5","m6"];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {col1.map(m => <MotorCardRow key={m} pv={`fr:${m}`} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {col2.map(m => <MotorCardRow key={m} pv={`fr:${m}`} />)}
      </div>
    </div>
  );
}
