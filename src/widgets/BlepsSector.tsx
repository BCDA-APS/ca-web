import { useEffect, useState } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toDouble, toStr, pvCtx } from "../lib/epics";
import { colors, fontSize } from "../lib/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BlepsValveSpec {
  /** Display label, e.g. "GV01" */
  label: string;
  /** Open-status PV (binary; 1 = open). Without `:OPENED:STS` suffix is fine. */
  openedPv: string;
  /** Optional closed-status PV. If absent, derived from openedPv === 0. */
  closedPv?: string;
}

export interface BlepsGaugeSpec {
  /** Display label, e.g. "IG01" */
  label: string;
  /** Pressure PV (Torr or mbar). */
  pv: string;
  /** Unit string for display, default "Torr". */
  unit?: string;
}

export interface BlepsInterlockSpec {
  /** Display label, e.g. "FE Shutter" */
  label: string;
  /** Binary status PV (1 = OK, 0 = tripped) — `okLow` inverts. */
  pv: string;
  /** If true, treat 0 as OK and non-zero as tripped (some EPS records are inverted). */
  okLow?: boolean;
}

export interface BlepsSectorProps {
  /** Sector banner label, e.g. "29-ID-A". */
  title: string;
  valves?: BlepsValveSpec[];
  gauges?: BlepsGaugeSpec[];
  interlocks?: BlepsInterlockSpec[];
  /** Summary PV — overall sector fault/trip latch. */
  summaryPv?: string;
}

// ── Single-PV cells ───────────────────────────────────────────────────────────

function ClosedSubscriber({ pv, onValue }: { pv: string; onValue: (n: number | null) => void }) {
  const [, , , raw] = useConnection(`bleps-${pv}`, `ca://${pv}`);
  const v = toDouble(raw);
  useEffect(() => { onValue(v); }, [v, onValue]);
  return null;
}

function ValveCell({ spec }: { spec: BlepsValveSpec }) {
  const [, , , openRaw] = useConnection(`bleps-${spec.openedPv}`, `ca://${spec.openedPv}`);
  const [closedVal, setClosedVal] = useState<number | null>(null);
  const open = toDouble(openRaw) === 1;
  const closed = spec.closedPv ? closedVal === 1 : toDouble(openRaw) === 0;
  const state: "open" | "closed" | "fault" | "unknown" =
    open && !closed ? "open"
    : closed && !open ? "closed"
    : openRaw === null ? "unknown"
    : "fault";
  const bg = state === "open"   ? colors.statusOk
           : state === "closed" ? colors.dim
           : state === "fault"  ? colors.statusError
           : colors.cardBgDisabled;
  return (
    <>
      {spec.closedPv && <ClosedSubscriber pv={spec.closedPv} onValue={setClosedVal} />}
      <div
        onContextMenu={e => pvCtx(spec.openedPv, openRaw, e)}
        title={`${spec.openedPv} → ${state}`}
        style={{
          width: 64, padding: "4px 6px", borderRadius: 3, background: bg, color: "#fff",
          fontSize: fontSize.label, fontFamily: "monospace", textAlign: "center",
          cursor: "context-menu", flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700 }}>{spec.label}</div>
        <div style={{ fontSize: fontSize.small, opacity: 0.85 }}>
          {state === "open" ? "OPEN" : state === "closed" ? "CLOSED" : state === "fault" ? "FAULT" : "—"}
        </div>
      </div>
    </>
  );
}

function GaugeCell({ spec }: { spec: BlepsGaugeSpec }) {
  const [, , , raw] = useConnection(`bleps-${spec.pv}`, `ca://${spec.pv}`);
  const v = toDouble(raw);
  const txt = v === null ? "—" : Math.abs(v) >= 0.01 && Math.abs(v) < 1e5 ? v.toPrecision(3) : v.toExponential(2);
  return (
    <div
      onContextMenu={e => pvCtx(spec.pv, raw, e)}
      style={{
        display: "flex", flexDirection: "column", gap: 2, width: 92,
        padding: "4px 6px", borderRadius: 3,
        background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`,
        cursor: "context-menu", flexShrink: 0,
      }}
    >
      <span style={{ fontSize: fontSize.small, color: colors.label, fontFamily: "sans-serif" }}>{spec.label}</span>
      <span style={{ fontSize: fontSize.mono, color: colors.rbvText, fontFamily: "monospace", textAlign: "right" }}>{txt}</span>
      <span style={{ fontSize: fontSize.small, color: colors.unit, textAlign: "right" }}>{spec.unit ?? "Torr"}</span>
    </div>
  );
}

function InterlockCell({ spec }: { spec: BlepsInterlockSpec }) {
  const [, , , raw] = useConnection(`bleps-${spec.pv}`, `ca://${spec.pv}`);
  const v = toDouble(raw);
  const ok = v === null ? null : spec.okLow ? v === 0 : v !== 0;
  const bg = ok === true ? colors.statusOk : ok === false ? colors.statusError : colors.cardBgDisabled;
  return (
    <div
      onContextMenu={e => pvCtx(spec.pv, raw, e)}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 8px",
        borderRadius: 3, background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`,
        cursor: "context-menu", flexShrink: 0,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: bg, boxShadow: `0 0 4px ${bg}` }} />
      <span style={{ fontSize: fontSize.label, color: colors.label, fontFamily: "sans-serif" }}>{spec.label}</span>
    </div>
  );
}

function SummaryBanner({ pv }: { pv: string }) {
  const [, , , raw] = useConnection(`bleps-summary-${pv}`, `ca://${pv}`);
  const s = toStr(raw);
  const tripped = s !== null ? !/ok|none|0|nominal/i.test(s) : (toDouble(raw) ?? 0) !== 0;
  return (
    <div
      onContextMenu={e => pvCtx(pv, raw, e)}
      style={{
        padding: "6px 10px", borderRadius: 3, color: "#fff",
        background: tripped ? colors.statusError : colors.statusOk,
        fontSize: fontSize.label, fontFamily: "sans-serif", fontWeight: 700,
        cursor: "context-menu",
      }}
    >
      {tripped ? `TRIP: ${s ?? "fault"}` : "All OK"}
    </div>
  );
}

// ── Sector ────────────────────────────────────────────────────────────────────

export function BlepsSector({ title, valves = [], gauges = [], interlocks = [], summaryPv }: BlepsSectorProps) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10, padding: 10,
      fontFamily: "sans-serif", minWidth: 360,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{
          margin: 0, fontSize: fontSize.badge, color: colors.sectionHdr,
          borderBottom: `1px solid ${colors.sectionHdrBorder}`, padding: "0 4px 3px",
        }}>{title}</h3>
        {summaryPv && <SummaryBanner pv={summaryPv} />}
      </div>

      {valves.length > 0 && (
        <section>
          <h4 style={{ margin: "0 0 4px", fontSize: fontSize.label, color: colors.dim }}>Valves</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {valves.map(v => <ValveCell key={v.openedPv} spec={v} />)}
          </div>
        </section>
      )}

      {gauges.length > 0 && (
        <section>
          <h4 style={{ margin: "0 0 4px", fontSize: fontSize.label, color: colors.dim }}>Pressure</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {gauges.map(g => <GaugeCell key={g.pv} spec={g} />)}
          </div>
        </section>
      )}

      {interlocks.length > 0 && (
        <section>
          <h4 style={{ margin: "0 0 4px", fontSize: fontSize.label, color: colors.dim }}>Interlocks</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {interlocks.map(i => <InterlockCell key={i.pv} spec={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}
