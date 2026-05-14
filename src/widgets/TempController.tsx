import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";
import { ChanRbvBox, ChanSpBox } from "./EpicsWidgets";
import { pvwsWriter } from "../lib/pvwsWriter";

export interface TempChannelSpec {
  /** Display label, e.g. "Sample" */
  label: string;
  /** Readback PV (Kelvin). */
  pv: string;
}

export interface TempLoopSpec {
  /** Display label, e.g. "Loop 1" */
  label: string;
  /** Setpoint PV. */
  setpointPv: string;
  /** Heater output (0-100 %) PV. */
  heaterPv?: string;
  /** Heater range / max-output PV (controller-specific). */
  rangePv?: string;
  /** Ramp rate (K/min) PV. */
  rampPv?: string;
  /** PID P/I/D PVs. */
  pPv?: string;
  iPv?: string;
  dPv?: string;
}

export interface TempControllerProps {
  /** Panel title, e.g. "LakeShore 340 — Sample". */
  title: string;
  channels: TempChannelSpec[];
  loops?: TempLoopSpec[];
}

// ── ChannelRow ────────────────────────────────────────────────────────────────

function ChannelRow({ spec }: { spec: TempChannelSpec }) {
  const [, , , raw] = useConnection(`temp-${spec.pv}`, `ca://${spec.pv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 80, fontSize: fontSize.label, color: colors.label, textAlign: "right" }}>{spec.label}</span>
      <ChanRbvBox raw={raw} width={90} fallbackPrec={3} onContextMenu={e => pvCtx(spec.pv, raw, e)} />
      <span style={{ fontSize: fontSize.label, color: colors.unit }}>K</span>
    </div>
  );
}

// ── LoopBlock ─────────────────────────────────────────────────────────────────

function PidCell({ label, pv }: { label: string; pv: string }) {
  const [, conn, , raw] = useConnection(`pid-${pv}`, `ca://${pv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 16, fontSize: fontSize.label, color: colors.label, fontFamily: "monospace" }}>{label}</span>
      <ChanSpBox raw={raw} width={64} fallbackPrec={2}
        disabled={!conn}
        onCommit={n => pvwsWriter.write(pv, n)}
        onContextMenu={e => pvCtx(pv, raw, e)} />
    </div>
  );
}

function SetpointRow({ label, pv, prec = 2, unit }: { label: string; pv: string; prec?: number; unit?: string }) {
  const [, conn, , raw] = useConnection(`temp-sp-${pv}`, `ca://${pv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 60, fontSize: fontSize.label, color: colors.label }}>{label}</span>
      <ChanSpBox raw={raw} width={80} fallbackPrec={prec}
        disabled={!conn}
        onCommit={n => pvwsWriter.write(pv, n)}
        onContextMenu={e => pvCtx(pv, raw, e)} />
      {unit && <span style={{ fontSize: fontSize.label, color: colors.unit }}>{unit}</span>}
    </div>
  );
}

function ReadbackRow({ label, pv, prec = 1, unit }: { label: string; pv: string; prec?: number; unit?: string }) {
  const [, , , raw] = useConnection(`temp-rbv-${pv}`, `ca://${pv}`);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 60, fontSize: fontSize.label, color: colors.label }}>{label}</span>
      <ChanRbvBox raw={raw} width={80} fallbackPrec={prec}
        onContextMenu={e => pvCtx(pv, raw, e)} />
      {unit && <span style={{ fontSize: fontSize.label, color: colors.unit }}>{unit}</span>}
    </div>
  );
}

function LoopBlock({ spec }: { spec: TempLoopSpec }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4, padding: 8,
      border: `1px solid ${colors.sectionHdrBorder}`, borderRadius: 4,
      background: colors.cardBg,
    }}>
      <span style={{ fontSize: fontSize.label, color: colors.sectionHdr, fontWeight: 700 }}>{spec.label}</span>

      <SetpointRow label="Setpoint" pv={spec.setpointPv} unit="K" />
      {spec.heaterPv && <ReadbackRow label="Heater" pv={spec.heaterPv} unit="%" />}
      {spec.rampPv   && <SetpointRow label="Ramp"   pv={spec.rampPv}   unit="K/min" />}
      {spec.rangePv  && <SetpointRow label="Range"  pv={spec.rangePv}  prec={0} />}

      {(spec.pPv || spec.iPv || spec.dPv) && (
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          {spec.pPv && <PidCell label="P" pv={spec.pPv} />}
          {spec.iPv && <PidCell label="I" pv={spec.iPv} />}
          {spec.dPv && <PidCell label="D" pv={spec.dPv} />}
        </div>
      )}
    </div>
  );
}

// ── TempController ────────────────────────────────────────────────────────────

export function TempController({ title, channels, loops = [] }: TempControllerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, fontFamily: "sans-serif", minWidth: 320 }}>
      <h3 style={{
        margin: 0, fontSize: fontSize.badge, color: colors.sectionHdr,
        borderBottom: `1px solid ${colors.sectionHdrBorder}`, padding: "0 4px 3px",
      }}>{title}</h3>

      <section style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <h4 style={{ margin: "0 0 2px", fontSize: fontSize.label, color: colors.dim }}>Readback</h4>
        {channels.map(c => <ChannelRow key={c.pv} spec={c} />)}
      </section>

      {loops.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h4 style={{ margin: "0 0 2px", fontSize: fontSize.label, color: colors.dim }}>Control</h4>
          {loops.map(l => <LoopBlock key={l.setpointPv} spec={l} />)}
        </section>
      )}
    </div>
  );
}
