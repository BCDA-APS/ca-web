import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble } from "../../lib/epics";
import { colors } from "../../lib/theme";
import { UiRenderer } from "../../lib/UiRenderer";
import { MotorGrid } from "../../widgets/MotorGrid";
import { ChamberDiagramV2 } from "./ChamberDiagramV2";
import { BeamlineEnergy } from "./BeamlineEnergy";
import { BeamlineEnergyA } from "./BeamlineEnergyA";
import { BeamlineLayout } from "./BeamlineLayout";
import { BLLayoutD } from "./BLLayoutD";
import { BLLayoutE } from "./BLLayoutE";
import { Mirrors } from "./Mirrors";
import { Slits } from "./Slits";
import { Diagon } from "./Diagon";
import { ScanRecords } from "./ScanRecords";
import { pvwsWriter } from "../../lib/pvwsWriter";
import type { DeploymentConfig } from "../types";

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

export const config: DeploymentConfig = {
  title: "29ID Beamline",
  quickLinks: [
    { label: "29ID", file: "/ui/29id/29id.ui", macros: {} },
  ],
  tabs: [
    { id: 3, icon: "✴️", label: "29ID-A", color: "rgb(174,203,255)" },
    { id: 1, icon: "⚛",  label: "29ID-C", color: "rgb(170,170,255)" },
    { id: 2, icon: "💠", label: "29ID-D" },
  ],
  panelDefaults: {
    "29idc-chamber-v2":    { x: 100, y:  55 },
    "29idc-motors":  { x: 650, y:  55 },
    "29idc-arpes":   { x: 100, y: 1000 },
    "29idc-energy":  { x: 100, y: 500 },
    "29idd-kappa":   { x: 100, y:  55 },
    "29id-energy-a":        { x:  85, y:  55 },
    "29id-beamline-layout": { x:  85, y: 530 },
    "29id-mirrors":         { x: 600, y:  55 },
    "29id-bllayout-d":      { x: 100, y: 200 },
    "29id-bllayout-e":      { x: 100, y: 400 },
    "29id-slits":           { x: 400, y:  55 },
    "29id-diagon":          { x: 100, y: 200 },
    "29id-scan-records":    { x: 700, y:  55 },
  },
  defaultHiddenPanels: ["29id-mirrors", "29id-bllayout-d", "29id-bllayout-e", "29id-slits", "29id-diagon", "29id-scan-records"],
  tabPanels: {
    1: [
      { id: "29idc-chamber-v2", title: "Chamber",  Content: ChamberDiagramV2 },
      { id: "29idc-motors",  title: "29ID-C Motors",   Content: ArpesMotorsContent },
      { id: "29idc-arpes",   title: "29ID-C ARPES",    Content: ArpesContent },
      { id: "29idc-energy",  title: "Beamline Energy", Content: BeamlineEnergy },
    ],
    2: [{ id: "29idd-kappa", title: "29ID-D Kappa", Content: KappaContent }],
    3: [
      { id: "29id-beamline-layout", title: "Beamline Layout", Content: BeamlineLayout },
      { id: "29id-mirrors",         title: "Mirrors",         Content: Mirrors },
      { id: "29id-energy-a",        title: "Beamline Energy", Content: BeamlineEnergyA },
      { id: "29id-bllayout-d",      title: "D Layout",        Content: BLLayoutD },
      { id: "29id-bllayout-e",      title: "E Layout",        Content: BLLayoutE },
      { id: "29id-slits",           title: "Slits",           Content: Slits },
      { id: "29id-diagon",          title: "DiaGon",          Content: Diagon },
      { id: "29id-scan-records",    title: "ScanRecords",    Content: ScanRecords },
    ],
  },
};
