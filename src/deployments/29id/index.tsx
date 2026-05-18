import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble } from "../../lib/epics";
import { colors } from "../../lib/theme";
import { UiRenderer } from "../../lib/UiRenderer";
import { MotorGrid } from "../../widgets/MotorGrid";
import { ChamberDiagramV2 } from "./chamber/ChamberDiagramV2";
import { BeamlineEnergy } from "./energy/BeamlineEnergy";
import { BeamlineEnergyA } from "./energy/BeamlineEnergyA";
import { BeamlineLayout } from "./layout/BeamlineLayout";
import { BLLayoutD } from "./layout/BLLayoutD";
import { BLLayoutE } from "./layout/BLLayoutE";
import { Mirrors } from "./optics/Mirrors";
import { Slits } from "./optics/Slits";
import { Diagon } from "./optics/Diagon";
import { ScanRecords } from "./scan/ScanRecords";
import { StripChart, type TraceConfig } from "../../widgets/StripChart";
import { pvwsWriter } from "../../lib/pvwsWriter";
import type { DeploymentConfig, DeploymentConfigData } from "../../lib/deployment";
import rawConfig from "./config.json";

// Drop the build-time-only `paths` block; vite.config.ts reads it directly
// from config.json and it has no business in the runtime config bundle.
const { paths: _paths, ...deploymentFields } = rawConfig as DeploymentConfigData;
void _paths;

const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "29idc-chamber-v2", title: "ARPES Chamber",   Content: ChamberDiagramV2,  scale: "transform" },
    { id: "29idc-motors",     title: "29ID-C Motors",   Content: ArpesMotorsContent, scale: "transform" },
    { id: "29idc-arpes",      title: "29ID-C ARPES",    Content: ArpesContent,       scale: "transform" },
    { id: "29idc-energy",     title: "Beamline Energy", Content: BeamlineEnergy,     scale: "transform" },
    { id: "29idc-pressure-trend", title: "Pressure Trend",    Content: () => <StripChart id="29idc-pressure-trend" initialPvs={PRESSURE_TREND_PVS} />, defaultSize: { w: 700, h: 320 } },
    { id: "29idc-temp-trend",     title: "Temperature Trend", Content: () => <StripChart id="29idc-temp-trend"     initialPvs={TEMP_TREND_PVS} />,     defaultSize: { w: 700, h: 320 } },
  ],
  2: [{ id: "29idd-kappa", title: "29ID-D Kappa", Content: KappaContent, scale: "transform" }],
  3: [
    { id: "29id-beamline-layout", title: "Beamline Layout", Content: BeamlineLayout,  scale: "transform" },
    { id: "29id-mirrors",         title: "Mirrors",         Content: Mirrors,         scale: "transform" },
    { id: "29id-energy-a",        title: "Beamline Energy", Content: BeamlineEnergyA, scale: "transform" },
    { id: "29id-bllayout-d",      title: "D Layout",        Content: BLLayoutD,       scale: "transform" },
    { id: "29id-bllayout-e",      title: "E Layout",        Content: BLLayoutE,       scale: "transform" },
    { id: "29id-slits",           title: "Slits",           Content: Slits,           scale: "transform" },
    { id: "29id-diagon",          title: "DiaGon",          Content: Diagon,          scale: "transform" },
    { id: "29id-scan-records",    title: "Scan Records",    Content: ScanRecords, defaultSize: { w: 360, h: 320 }, scale: "transform" },
    { id: "29id-strip-tool",      title: "StripTool",       Content: () => <StripChart id="29id-strip-tool" initialPvs={CA_PVS} />, defaultSize: { w: 700, h: 320 } },
  ],
};

export const config: DeploymentConfig = { ...deploymentFields, tabPanels };

const CA_PVS: TraceConfig[] = [
  { pv: "29idb:ca1:read",  label: "CA1"  },
  { pv: "29idb:ca2:read",  label: "CA2"  },
  { pv: "29idb:ca3:read",  label: "CA3"  },
  { pv: "29idb:ca4:read",  label: "CA4"  },
  { pv: "29idb:ca5:read",  label: "CA5"  },
  { pv: "29idb:ca9:read",  label: "CA9"  },
  { pv: "29idb:ca10:read", label: "CA10" },
  { pv: "29idb:ca12:read", label: "CA12" },
  { pv: "29idb:ca13:read", label: "CA13" },
  { pv: "29idb:ca14:read", label: "CA14" },
  { pv: "29idb:ca15:read", label: "CA15", enabled: true },
];

const PRESSURE_TREND_PVS: TraceConfig[] = [
  { pv: "29idc:VS11C.VAL",  label: "Gauge", enabled: true },
  { pv: "29idc:IP11C1.VAL", label: "Pump",  enabled: true },
];

const TEMP_TREND_PVS: TraceConfig[] = [
  { pv: "29idARPES:LS335:TC1:INA", label: "Sample",     enabled: true },
  { pv: "29idARPES:LS335:TC1:INB", label: "Cold fngr",  enabled: true },
];

const ARPES_MOTORS = ["m1", "m2", "m3", "m4", "m5", "m6"];

const SYNC_MOTORS = [
  { motor: "m1", syncPv: "29idc:m1.SYNC", statPv: "29idc:m1.STAT", label: "X" },
  { motor: "m2", syncPv: "29idc:m2.SYNC", statPv: "29idc:m2.STAT", label: "Y" },
  { motor: "m3", syncPv: "29idc:m3.SYNC", statPv: "29idc:m3.STAT", label: "Z" },
  { motor: "m4", syncPv: "29idc:m4.SYNC", statPv: "29idc:m4.STAT", label: "TH" },
];

function SyncButtons() {
  const [,,, s1] = useConnection("sync-stat-m1", "ca://29idc:m1.STAT");
  const [,,, s2] = useConnection("sync-stat-m2", "ca://29idc:m2.STAT");
  const [,,, s3] = useConnection("sync-stat-m3", "ca://29idc:m3.STAT");
  const [,,, s4] = useConnection("sync-stat-m4", "ca://29idc:m4.STAT");
  const stats = [toDouble(s1), toDouble(s2), toDouble(s3), toDouble(s4)];
  const active = SYNC_MOTORS.filter((_, i) => stats[i] === 14);
  if (active.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 8 }}>
      <span style={{ fontSize: 12, fontFamily: "sans-serif", color: colors.label }}>Sync encoders:</span>
      {active.map(m => (
        <button
          key={m.motor}
          onClick={() => pvwsWriter.write(m.syncPv, 1)}
          style={{
            padding: "3px 7px",
            background: colors.relatedBg,
            color: colors.relatedFg,
            border: `1px solid ${colors.relatedBorder}`,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "sans-serif",
            cursor: "pointer",
          }}
        >{m.label}</button>
      ))}
    </div>
  );
}

function ArpesMotorsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <MotorGrid prefix="29idc:" motors={ARPES_MOTORS} columns={3} softLimitPrec={3} />
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* SYNC buttons — visible only when motor has LINK alarm (STAT=14) */}
        <SyncButtons />
        <div style={{ flex: 1 }} />
        {/* All Stop */}
        <button
          onClick={() => pvwsWriter.write("29idc:allstop.VAL", 1)}
          style={{
            padding: "5px 16px",
            background: colors.statusError,
            color: "#fff",
            border: `1px solid ${colors.statusError}`,
            borderRadius: 4,
            fontSize: 12,
            fontFamily: "sans-serif",
            cursor: "pointer",
          }}
        >
          All Stop
        </button>
        {/* Gear — related display */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/29idc_motors_more.ui", macros: {}, label: "29ID-C Motors" } }))}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28,
            background: colors.relatedBg,
            color: colors.relatedFg,
            border: `1px solid ${colors.relatedBorder}`,
            borderRadius: 4,
            fontSize: 16,
            cursor: "pointer",
            padding: 0,
            marginLeft: 4,
          }}
        ><span style={{ display: "block", lineHeight: 1, marginTop: -2 }}>⚙</span></button>
      </div>
    </div>
  );
}

function ArpesContent() {
  return <UiRenderer file="/ui/29id/29idc_ARPES.ui" macros={{}} />;
}

function KappaContent() {
  return (
    <UiRenderer
      file="/ui/29id/29idd_Kappa.ui"
      macros={{ P: "29idd:", M1: "m1", M2: "m2", M3: "m3", M4: "m7", M5: "m6" }}
    />
  );
}
