import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble } from "../../lib/epics";
import { colors } from "../../lib/theme";
import { UiRenderer } from "../../lib/UiRenderer";
import { MotorGrid } from "../../widgets/MotorGrid";
import { ChamberDiagram } from "./chamber/ChamberDiagram";
import { BeamlineEnergy } from "./energy/BeamlineEnergy";
import { BeamlineEnergyA } from "./energy/BeamlineEnergyA";
import { BeamlineLayout } from "./bl-layout/BeamlineLayout";
import { Mirrors } from "./optics/Mirrors";
import { Slits } from "./optics/Slits";
import { Diagon } from "./optics/Diagon";
import { ScanRecords } from "./scan/ScanRecords";
import { StripChart } from "../../widgets/StripChart";
import { ScanViewChart } from "../../widgets/ScanViewChart";
import { AHUTCH_STRIP_TOOL_PVS } from "./bl-layout/BeamlineLayout";
import { BlepsSector, type BlepsValveSpec, type BlepsInterlockSpec } from "../../widgets/BlepsSector";
import { DetectorSpectrum } from "../../widgets/DetectorSpectrum";
import { TempController } from "../../widgets/TempController";
import { CameraViewer } from "../../widgets/CameraViewer";
import { pvwsWriter } from "../../lib/pvwsWriter";
import type { DeploymentConfig, DeploymentConfigData, PanelTemplate, SpawnablePanelSpec } from "../../lib/deployment";
import rawConfig from "./config.json";

// Drop the build-time-only `paths` block; vite.config.ts reads it directly
// from config.json and it has no business in the runtime config bundle.
const { paths: _paths, ...deploymentFields } = rawConfig as DeploymentConfigData;
void _paths;

const tabPanels: DeploymentConfig["tabPanels"] = {
  1: [
    { id: "29idc-chamber",      title: "ARPES Chamber",      Content: ChamberDiagram },
    { id: "29idc-motors",          title: "ARPES Motors",      Content: ArpesMotorsContent },
    { id: "29idc-energy",          title: "Beamline Energy",    Content: BeamlineEnergy },
    { id: "29idc-cam-live",        title: "Beam Profile Cam",   Content: ArpesLiveCamContent },
    { id: "29idc-ses",             title: "Scienta SES",        Content: ArpesSesContent },
    { id: "29idc-stripchart-t",    title: "Temp Strip Chart",   Content: ArpesStripChartT },
    { id: "29idc-motors-detail",   title: "Motors (detail)",    Content: ArpesMotorsDetail },
  ],
  2: [
    { id: "29idd-kappa",           title: "29ID-D Kappa",       Content: KappaContent },
    { id: "29idd-mpa",             title: "MPA Detector",       Content: MpaContent },
    { id: "29idd-dxp-saturn",      title: "DXP Saturn (XRF)",   Content: DxpSaturnContent },
    { id: "29idd-si9700",          title: "Sample Temp (Si9700)", Content: Si9700Content },
    { id: "29idd-stripchart-t",    title: "Temp Strip Chart",   Content: DStripChartT },
    { id: "29idd-scan-progress",   title: "Scan Progress",      Content: DScanProgress },
    { id: "29idd-quantar",         title: "Quantar PLC",        Content: QuantarContent },
  ],
  3: [
    { id: "29id-beamline-layout",  title: "Beamline Layout",    Content: BeamlineLayout },
    { id: "29id-energy-a",         title: "Beamline Energy",    Content: BeamlineEnergyA },
    { id: "29id-diagon",           title: "DiaGon",             Content: Diagon },
    { id: "29id-bl-diag",          title: "Diagnostics",        Content: BlDiagContent },
    { id: "29id-apertures",        title: "Apertures",          Content: AperturesContent },
    { id: "29id-scan-progress",    title: "Scan Progress",      Content: ScanProgressContent },
    { id: "29id-pv-history",       title: "PV History",         Content: PvHistoryContent },
    { id: "29id-m3r-align",        title: "M3R Alignment",      Content: M3rAlignContent },
  ],
  4: [
    { id: "29ide-overview",        title: "29ID-E Overview",    Content: EOverviewContent },
    { id: "29ide-motors",          title: "29ID-E Motors",      Content: EMotorsContent },
    { id: "29ide-scan",            title: "29ID-E Scan",        Content: EScanContent },
    { id: "29ide-lightfield",      title: "LightField CCD",     Content: ELightFieldContent },
    { id: "29ide-apertures",       title: "29ID-E Apertures",   Content: EAperturesContent },
  ],
  5: [
    { id: "bleps-sector-a",        title: "Sector A — Front End", Content: BlepsSectorA },
    { id: "bleps-sector-b",        title: "Sector B",             Content: BlepsSectorB },
    { id: "bleps-sector-c",        title: "Sector C — ARPES",     Content: BlepsSectorC },
    { id: "bleps-sector-d",        title: "Sector D — Diffr.",    Content: BlepsSectorD },
    { id: "bleps-sector-e",        title: "Sector E — Coherent",  Content: BlepsSectorE },
    { id: "bleps-faults",          title: "Faults & Alarms",      Content: BlepsFaultsContent },
  ],
  6: [
    { id: "29id-scan-records",      title: "Scan Records",            Content: ScanRecords,        defaultSize: { w: 360, h: 320 } },
    { id: "29id-ahutch-stripchart", title: "A-Hutch StripTool",       Content: AhutchStripContent, defaultSize: { w: 840, h: 470 } },
    { id: "29id-test-scanview",     title: "A-Hutch ScanView",        Content: TestScanviewContent, defaultSize: { w: 840, h: 470 } },
  ],
};

function AhutchStripContent() {
  return <StripChart id="29id-ahutch-stripchart" initialPvs={AHUTCH_STRIP_TOOL_PVS} />;
}

function TestScanviewContent() {
  return <ScanViewChart id="29id-test-scanview" recordPv="29idTest:scan1" defaultDetectors={[6, 7, 8, 9, 10]} />;
}

// Mirrors and Slits are spawn-on-demand so staff can open multiple
// copies side-by-side. Each click pushes a fresh independent instance.
// panelKey ties them to spawnablePanels below for saved-layout restore.
const templates: PanelTemplate[] = [
  {
    id: "tmpl-mirrors",
    title: "Mirrors",
    spawn: () => window.dispatchEvent(new CustomEvent("open-panel", { detail: {
      label: "Mirrors", panelKey: "mirrors",
    }})),
  },
  {
    id: "tmpl-slits",
    title: "Slits",
    spawn: () => window.dispatchEvent(new CustomEvent("open-panel", { detail: {
      label: "Slits", panelKey: "slits",
    }})),
  },
];

const spawnablePanels: Record<string, SpawnablePanelSpec> = {
  mirrors: { Content: Mirrors, scale: "transform" },
  slits:   { Content: Slits,   scale: "transform" },
};

export const config: DeploymentConfig = { ...deploymentFields, tabPanels, templates, spawnablePanels };

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
          onClick={() => window.dispatchEvent(new CustomEvent("open-ui", { detail: { file: "/ui/29idc_motors_more.ui", macros: {}, label: "ARPES Motors" } }))}
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

function KappaContent() {
  return (
    <UiRenderer
      file="/ui/29id/29idd_Kappa.ui"
      macros={{ P: "29idd:", M1: "m1", M2: "m2", M3: "m3", M4: "m7", M5: "m6" }}
    />
  );
}

// ── Phase 1 — UiRenderer passthroughs ─────────────────────────────────────────

function BlDiagContent()       { return <UiRenderer file="/ui/29id/29id_BL_Diag.ui"        macros={{}} />; }
function AperturesContent()    { return <UiRenderer file="/ui/29id/29id_Apertures.ui"      macros={{}} />; }
function ScanProgressContent() { return <UiRenderer file="/ui/29id/29id_scanProgress.ui"   macros={{ P: "29idb:", B: "scanProgress:" }} />; }
function PvHistoryContent()    { return <UiRenderer file="/ui/29id/29id_pvHistory3.ui"     macros={{}} />; }
function M3rAlignContent()     { return <UiRenderer file="/ui/29id/29id_m3r_align.ui"      macros={{ P: "29id_m3r:" }} />; }

function ArpesSesContent()        { return <UiRenderer file="/ui/29id/29idc_SES.ui"            macros={{}} />; }
function ArpesStripChartT()       { return <UiRenderer file="/ui/29id/29idc_stripChart_T.ui"   macros={{}} />; }
function ArpesMotorsDetail()      { return <UiRenderer file="/ui/29id/29idc_motors_more.ui"    macros={{}} />; }

function DStripChartT()         { return <UiRenderer file="/ui/29id/29idd_stripChart_T.ui"    macros={{}} />; }
function DScanProgress()        { return <UiRenderer file="/ui/29id/29idd_scanProgress.ui"    macros={{ P: "29idd:", B: "scanProgress:" }} />; }
function QuantarContent()       { return <UiRenderer file="/ui/29id/29idd_quantar_plc.ui"     macros={{}} />; }

function EOverviewContent()     { return <UiRenderer file="/ui/29id/29ide_graphic.ui"         macros={{}} />; }
function EMotorsContent()       { return <UiRenderer file="/ui/29id/29ide_motorx.ui"          macros={{ P: "29ide:" }} />; }
function EScanContent()         { return <UiRenderer file="/ui/29id/29ide_scan.ui"            macros={{ P: "29ide:" }} />; }
function EAperturesContent()    { return <UiRenderer file="/ui/29id/29ide_Apertures.ui"       macros={{}} />; }

function BlepsFaultsContent()   { return <UiRenderer file="/ui/29id/29id_bleps_FaultsAlarms.ui" macros={{}} />; }

// ── Phase 2 — native React panels ─────────────────────────────────────────────

// Helper builders for the BLEPS sector specs (keeps the wiring concise).
function gv(n: number): BlepsValveSpec {
  const num = String(n).padStart(2, "0");
  return {
    label: `GV${num}`,
    openedPv: `29id:BLEPS:GV${num}:OPENED:STS`,
    closedPv: `29id:BLEPS:GV${num}:CLOSED:STS`,
  };
}
function ilk(prefix: "IG" | "IP" | "VAC" | "FLOW", n: number): BlepsInterlockSpec {
  const num = String(n).padStart(2, "0");
  const suffix = prefix === "VAC" || prefix === "FLOW" ? "TRIP" : "STS";
  return {
    label: `${prefix}${num}`,
    pv: `29id:BLEPS:${prefix}${num}:${suffix}`,
    // For TRIP records, 0 = OK, non-zero = tripped. STS records: 1 = OK.
    okLow: suffix === "TRIP",
  };
}

function BlepsSectorA() {
  return (
    <BlepsSector
      title="Sector A — Front End"
      valves={[gv(1), gv(2)]}
      interlocks={[
        ilk("IG", 1), ilk("IG", 2), ilk("IG", 3),
        ilk("IP", 1), ilk("IP", 2), ilk("IP", 3),
        ilk("VAC", 1), ilk("VAC", 2), ilk("VAC", 3),
        ilk("FLOW", 1), ilk("FLOW", 2), ilk("FLOW", 3),
      ]}
    />
  );
}
function BlepsSectorB() {
  return (
    <BlepsSector
      title="Sector B — Mono / 2B"
      valves={[gv(3), gv(4), gv(5), gv(15)]}
      interlocks={[
        ilk("IG", 3), ilk("IG", 4), ilk("IG", 5), ilk("IG", 6), ilk("IG", 15),
        ilk("IP", 4), ilk("IP", 5), ilk("IP", 6), ilk("IP", 7), ilk("IP", 8), ilk("IP", 9), ilk("IP", 15),
        ilk("VAC", 3), ilk("VAC", 4), ilk("VAC", 5), ilk("VAC", 6), ilk("VAC", 7),
        ilk("FLOW", 4),
      ]}
    />
  );
}
function BlepsSectorC() {
  return (
    <BlepsSector
      title="Sector C — ARPES"
      valves={[gv(6), gv(7), gv(8), gv(9), gv(10), gv(16)]}
      interlocks={[
        ilk("IG", 6), ilk("IG", 7), ilk("IG", 8), ilk("IG", 9), ilk("IG", 10),
        ilk("IP", 8), ilk("IP", 9), ilk("IP", 10), ilk("IP", 11), ilk("IP", 12),
        ilk("IP", 13), ilk("IP", 14), ilk("IP", 15), ilk("IP", 21), ilk("IP", 22), ilk("IP", 23),
        ilk("VAC", 7), ilk("VAC", 8), ilk("VAC", 9), ilk("VAC", 10), ilk("VAC", 11),
      ]}
    />
  );
}
function BlepsSectorD() {
  return (
    <BlepsSector
      title="Sector D — Diffraction / Kappa"
      valves={[gv(11), gv(12), gv(13), gv(14), gv(17)]}
      interlocks={[
        ilk("IG", 6), ilk("IG", 11), ilk("IG", 12), ilk("IG", 13), ilk("IG", 14), ilk("IG", 16),
        ilk("IP", 8), ilk("IP", 9), ilk("IP", 15), ilk("IP", 16), ilk("IP", 17),
        ilk("IP", 18), ilk("IP", 19), ilk("IP", 20), ilk("IP", 24),
        ilk("VAC", 7), ilk("VAC", 12), ilk("VAC", 13), ilk("VAC", 14), ilk("VAC", 15),
      ]}
    />
  );
}
function BlepsSectorE() {
  return (
    <BlepsSector
      title="Sector E — Coherent"
      valves={[gv(14), gv(17), gv(18), gv(19), gv(20)]}
      interlocks={[
        ilk("IG", 6), ilk("IG", 13), ilk("IG", 14), ilk("IG", 16), ilk("IG", 18),
        ilk("IP", 8), ilk("IP", 9), ilk("IP", 15), ilk("IP", 16),
        ilk("IP", 19), ilk("IP", 20), ilk("IP", 24),
        ilk("VAC", 7), ilk("VAC", 15), ilk("VAC", 16), ilk("VAC", 17),
      ]}
    />
  );
}

function MpaContent() {
  // Composite: spectrum + 2D image. PV prefix per 29idd_mpa.ui convention.
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <DetectorSpectrum
        title="MPA Spectrum"
        spectrumPv="29idd:mpa:Spectrum"
        startPv="29idd:mpa:Start"
        stopPv="29idd:mpa:Stop"
        erasePv="29idd:mpa:Erase"
        acquiringPv="29idd:mpa:Acquiring"
        realTimePv="29idd:mpa:RealTime_RBV"
        liveTimePv="29idd:mpa:LiveTime_RBV"
        channels={1024}
      />
      <CameraViewer
        title="MPA Image"
        adPrefix="29idd:mpa:cam1:"
        imagePv="29idd:mpa:image1:ArrayData"
        imageW={256}
        imageH={256}
        width={300}
        height={300}
      />
    </div>
  );
}

function DxpSaturnContent() {
  // DXP Saturn typically exposes mca1.VAL as the spectrum plus dxp1: PVs for ROIs.
  return (
    <DetectorSpectrum
      title="DXP Saturn — channel 1"
      spectrumPv="29iddxp1:mca1.VAL"
      startPv="29iddxp1:mca1.ERST"
      stopPv="29iddxp1:mca1.STOP"
      erasePv="29iddxp1:mca1.ERAS"
      acquiringPv="29iddxp1:mca1.ACQG"
      realTimePv="29iddxp1:mca1.ERTM"
      liveTimePv="29iddxp1:mca1.ELTM"
      icrPv="29iddxp1:dxp1:InputCountRate"
      ocrPv="29iddxp1:dxp1:OutputCountRate"
      deadTimePv="29iddxp1:dxp1:DeadTime"
      rois={[
        { label: "ROI 0", countPv: "29iddxp1:mca1.R0" },
        { label: "ROI 1", countPv: "29iddxp1:mca1.R1" },
        { label: "ROI 2", countPv: "29iddxp1:mca1.R2" },
        { label: "ROI 3", countPv: "29iddxp1:mca1.R3" },
      ]}
      channels={2048}
    />
  );
}

function Si9700Content() {
  return (
    <TempController
      title="Sample Temperature — Si9700"
      channels={[
        { label: "Sensor A", pv: "29idd:tc1:getVal_A.VAL" },
        { label: "Sensor B", pv: "29idd:tc1:getVal_B.VAL" },
      ]}
      loops={[
        {
          label: "Loop 1",
          setpointPv: "29idd:tc1:setVal_SP.VAL",
          heaterPv:   "29idd:tc1:getVal_HTROUT.VAL",
          rangePv:    "29idd:tc1:setVal_MaxHTROUT.VAL",
          pPv: "29idd:tc1:setVal_P.VAL",
          iPv: "29idd:tc1:setVal_I.VAL",
          dPv: "29idd:tc1:setVal_D.VAL",
        },
      ]}
    />
  );
}

function ArpesLiveCamContent() {
  // No MJPEG URL configured by default; falls back to waveform render.
  return (
    <CameraViewer
      title="29ID-C Beam Profile"
      adPrefix="29idc_cam1:cam1:"
      imagePv="29idc_cam1:image1:ArrayData"
      imageW={640}
      imageH={480}
      width={480}
      height={360}
    />
  );
}

function ELightFieldContent() {
  return (
    <CameraViewer
      title="29ID-E LightField CCD"
      adPrefix="29idLF1:cam1:"
      imagePv="29idLF1:image1:ArrayData"
      imageW={1024}
      imageH={1024}
      width={400}
      height={400}
    />
  );
}
