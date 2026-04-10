import { UiRenderer } from "../UiRenderer";
import { MotorGrid } from "../MotorGrid";
import type { DeploymentConfig } from "./types";

const ARPES_MOTORS = ["m1", "m2", "m3", "m4", "m5", "m6"];

function ArpesMotorsContent() {
  return <MotorGrid prefix="29idc:" motors={ARPES_MOTORS} columns={3} />;
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
    { id: 1, icon: "⚛",  label: "29ID-C" },
    { id: 2, icon: "💠", label: "29ID-D" },
  ],
  panelDefaults: {
    "29idc-motors": { x: 108, y:  56 },
    "29idc-arpes":  { x: 108, y: 400 },
    "29idd-kappa":  { x: 108, y:  56 },
  },
  tabPanels: {
    1: [
      { id: "29idc-motors", title: "29ID-C Motors", Content: ArpesMotorsContent },
      { id: "29idc-arpes",  title: "29ID-C ARPES",  Content: ArpesContent },
    ],
    2: [{ id: "29idd-kappa", title: "29ID-D Kappa", Content: KappaContent }],
  },
};
