import { useConnection } from "@diamondlightsource/cs-web-lib";
import { colors } from "../../lib/theme";
import { UiRenderer } from "../../lib/UiRenderer";
import { MotorGrid } from "../../widgets/MotorGrid";
import { ChamberDiagram } from "./ChamberDiagram";
import { BeamlineEnergy } from "./BeamlineEnergy";
import { pvwsWriter } from "../../lib/pvwsWriter";
import type { DeploymentConfig } from "../types";

const ARPES_MOTORS = ["m1", "m2", "m3", "m4", "m5", "m6"];

const BLINK_STYLE = `
@keyframes cd-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.cd-moving-active { animation: cd-blink 1s step-end infinite; }
`;

function MovingIndicator() {
  const [, connected,, val] = useConnection("29idc-blink", "ca://29idc:alldoneBlink.VAL");
  const v = (val as any)?.value;
  const raw = v?.doubleValue ?? v?.floatValue ?? v?.intValue ?? v?.value ?? null;
  const active = connected && raw !== null && raw !== 0;
  return (
    <>
      <style>{BLINK_STYLE}</style>
      <div className={active ? "cd-moving-active" : undefined}
           style={{ position: "relative", width: 80, height: 26, visibility: active ? "visible" : "hidden" }}>
        <span style={{
          position: "absolute", left: 3, top: 3,
          fontSize: 18, fontWeight: 700, fontFamily: "sans-serif",
          color: "#006064", userSelect: "none",
        }}>Moving</span>
        <span style={{
          position: "absolute", left: 1, top: 1,
          fontSize: 18, fontWeight: 700, fontFamily: "sans-serif",
          color: "#80deea", userSelect: "none",
        }}>Moving</span>
      </div>
    </>
  );
}

function ArpesMotorsContent() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <MotorGrid prefix="29idc:" motors={ARPES_MOTORS} columns={3} />
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* Moving indicator — centered in remaining space */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <MovingIndicator />
        </div>
        {/* All Stop */}
        <button
          onClick={() => pvwsWriter.write("29idc:allstop.VAL", 1)}
          style={{
            padding: "5px 16px",
            background: "#7f1d1d",
            color: "#fecaca",
            border: "1px solid #ef5350",
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
  tabs: [
    { id: 1, icon: "⚛",  label: "29ID-C", color: "rgb(170,170,255)" },
    { id: 2, icon: "💠", label: "29ID-D" },
  ],
  panelDefaults: {
    "29idc-chamber": { x: 100, y:  55 },
    "29idc-motors":  { x: 640, y:  55 },
    "29idc-arpes":   { x: 100, y: 1000 },
    "29idc-energy":  { x: 640, y: 350 },
    "29idd-kappa":   { x: 100, y:  55 },
  },
  tabPanels: {
    1: [
      { id: "29idc-chamber", title: "29ID-C Chamber",  Content: ChamberDiagram },
      { id: "29idc-motors",  title: "29ID-C Motors",   Content: ArpesMotorsContent },
      { id: "29idc-arpes",   title: "29ID-C ARPES",    Content: ArpesContent },
      { id: "29idc-energy",  title: "Beamline Energy", Content: BeamlineEnergy },
    ],
    2: [{ id: "29idd-kappa", title: "29ID-D Kappa", Content: KappaContent }],
  },
};
