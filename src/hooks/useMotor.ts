import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../lib/pvwsWriter";
import { toDouble, toStr } from "../lib/epics";

export type MotorStatus = "ok" | "moving" | "soft-limit" | "hw-limit" | "calibrate" | "disabled";

export interface MotorState {
  connected: boolean;
  desc: string;
  rbv: number | null;
  rbvRaw: unknown;
  val: number | null;
  twv: number | null;
  llm: number | null;
  hlm: number | null;
  prec: number;
  status: MotorStatus;
  disabled: boolean;
  moving: boolean;
  calibrate: boolean;
  lls: boolean;
  hls: boolean;
  writeVal: (n: number) => void;
  writeTwv: (n: number) => void;
  tweakBack: () => void;
  tweakForward: () => void;
}

export function useMotor(pv: string): MotorState {
  // Prefix is distinct from MotorRow's `motor-` so the two can coexist for
  // the same PV without overwriting each other's connection registration.
  const id = `motor-card-${pv}`;

  const [, connected, , descVal] = useConnection(`${id}-desc`, `ca://${pv}.DESC`);
  const [, ,         , rbvVal]   = useConnection(`${id}-rbv`,  `ca://${pv}.RBV`);
  const [, ,         , dmovVal]  = useConnection(`${id}-dmov`, `ca://${pv}.DMOV`);
  const [, ,         , lvioVal]  = useConnection(`${id}-lvio`, `ca://${pv}.LVIO`);
  const [, ,         , llsVal]   = useConnection(`${id}-lls`,  `ca://${pv}.LLS`);
  const [, ,         , hlsVal]   = useConnection(`${id}-hls`,  `ca://${pv}.HLS`);
  const [, ,         , setVal]   = useConnection(`${id}-set`,  `ca://${pv}.SET`);
  const [, ableConn, , ableVal]  = useConnection(`${id}-able`, `ca://${pv}_able.VAL`);
  const [, ,         , llmVal]   = useConnection(`${id}-llm`,  `ca://${pv}.LLM`);
  const [, ,         , hlmVal]   = useConnection(`${id}-hlm`,  `ca://${pv}.HLM`);
  const [, ,         , valVal]   = useConnection(`${id}-val`,  `ca://${pv}.VAL`);
  const [, ,         , twvVal]   = useConnection(`${id}-twv`,  `ca://${pv}.TWV`);

  const prec      = (rbvVal as { display?: { precision?: number } } | null)?.display?.precision ?? 3;
  const desc      = toStr(descVal) || pv;
  const rbv       = toDouble(rbvVal);
  const dmov      = (toDouble(dmovVal) ?? 1) !== 0;
  const lvio      = (toDouble(lvioVal) ?? 0) !== 0;
  const lls       = (toDouble(llsVal)  ?? 0) !== 0;
  const hls       = (toDouble(hlsVal)  ?? 0) !== 0;
  const calibrate = (toDouble(setVal)  ?? 0) !== 0;
  const disabled  = Boolean(ableConn) && toStr(ableVal) === "Disable";

  const moving    = Boolean(connected) && !dmov;
  const hwLimit   = lls || hls;

  let status: MotorStatus = "ok";
  if (disabled)        status = "disabled";
  else if (calibrate)  status = "calibrate";
  else if (hwLimit)    status = "hw-limit";
  else if (lvio)       status = "soft-limit";
  else if (moving)     status = "moving";

  return {
    connected: Boolean(connected),
    desc,
    rbv,
    rbvRaw: rbvVal,
    val: toDouble(valVal),
    twv: toDouble(twvVal),
    llm: toDouble(llmVal),
    hlm: toDouble(hlmVal),
    prec,
    status,
    disabled,
    moving,
    calibrate,
    lls,
    hls,
    writeVal:     (n) => pvwsWriter.write(`${pv}.VAL`, n),
    writeTwv:     (n) => pvwsWriter.write(`${pv}.TWV`, n),
    tweakBack:    ()  => pvwsWriter.write(`${pv}.TWR`, 1),
    tweakForward: ()  => pvwsWriter.write(`${pv}.TWF`, 1),
  };
}
