import { useState, useId } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble, pvCtx } from "../../../lib/epics";
import { colors, fontSize } from "../../../lib/theme";
import { ChanRbvBox, ChanSpBox, TweakValue, TweakButton } from "../../../widgets/EpicsWidgets";

// ── Layout constants ──────────────────────────────────────────────────────────

const FW    = 90;              // readback / setpoint field width
const BTN   = 22;              // tweak ± button size
const TWV_W = FW - 2*BTN - 4; // = 42  (gap=2 on each side of step field)
const COL_GAP = 8;             // gap between H and V columns

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "2b",    label: "Slit 2B",   sn: "2", abbr: "2B"  },
  { id: "1a",    label: "Slit 1A",   sn: "1", abbr: "1A"  },
  { id: "schem", label: "Schematic", sn: "",  abbr: ""    },
] as const;

// ── SlitGroup ─────────────────────────────────────────────────────────────────
// One axis × one quantity (e.g. H Size or V Center)

function SlitGroup({ widgetId, rbvPv, spPv, tweakPfx, label }: {
  widgetId: string;
  rbvPv:    string;   // e.g. "29idb:Slit1Ht2.C"
  spPv:     string;   // e.g. "29idb:Slit1Hsize.VAL"
  tweakPfx: string;   // e.g. "29idb:Slit1Hsize"  (appended with _tweak.A/B, _tweakVal.VAL)
  label:    string;   // e.g. "1A-H Size"
}) {
  // Per-instance widgetId so two spawned Slits panels don't share
  // useConnection ids (would tear down each other's subscriptions on
  // unmount). Same fix as Mirrors and the chart widgets.
  const [, conn,, rbv]  = useConnection(`${widgetId}-${rbvPv}`,          `ca://${rbvPv}`);
  const [,,, sp]         = useConnection(`${widgetId}-${spPv}`,           `ca://${spPv}`);
  const [,,, twvRaw]     = useConnection(`${widgetId}-${tweakPfx}v`,      `ca://${tweakPfx}_tweakVal.VAL`);

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 2,
      background: colors.cardBg, border: "2px solid #3a3a3a", borderRadius: 5,
      padding: "6px 8px", boxSizing: "border-box",
    }}>
      <span style={{ fontSize: fontSize.small, color: colors.label }}>{label}</span>
      <ChanRbvBox raw={rbv} width={FW} onContextMenu={e => pvCtx(rbvPv, rbv, e)} />
      <ChanSpBox  raw={sp}  width={FW}
        onCommit={n => pvwsWriter.write(spPv, n)}
        disabled={!conn}
        onContextMenu={e => pvCtx(spPv, sp, e)}
      />
      <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
        <TweakButton size={BTN} onClick={() => pvwsWriter.write(`${tweakPfx}_tweak.A`, 1)} disabled={!conn}>−</TweakButton>
        <TweakValue
          value={toDouble(twvRaw)}
          prec={3}
          onCommit={n => pvwsWriter.write(`${tweakPfx}_tweakVal.VAL`, n)}
          style={{ width: TWV_W, height: BTN }}
        />
        <TweakButton size={BTN} onClick={() => pvwsWriter.write(`${tweakPfx}_tweak.B`, 1)} disabled={!conn}>+</TweakButton>
      </div>
    </div>
  );
}

// ── SlitPanel ─────────────────────────────────────────────────────────────────

function SlitPanel({ widgetId, sn, abbr }: { widgetId: string; sn: string; abbr: string }) {
  const hPfx = `29idb:Slit${sn}H`;
  const vPfx = `29idb:Slit${sn}V`;

  const syncBtn: React.CSSProperties = {
    background: "rgb(255,160,100)", color: "#fff",
    border: "1px solid rgb(180,80,0)", borderRadius: 4,
    padding: "3px 14px", fontSize: fontSize.label,
    fontWeight: 700, cursor: "pointer", fontFamily: "sans-serif",
  };
  const moreBtn: React.CSSProperties = {
    background: colors.relatedBg, color: colors.relatedFg,
    border: `1px solid ${colors.relatedBorder}`, borderRadius: 4,
    padding: "3px 10px", fontSize: fontSize.label,
    cursor: "pointer", fontFamily: "sans-serif",
  };

  return (
    <div style={{ padding: "10px 10px", display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Size row ── */}
      <div style={{ display: "flex", gap: COL_GAP }}>
        <SlitGroup widgetId={widgetId} rbvPv={`${hPfx}t2.C`} spPv={`${hPfx}size.VAL`} tweakPfx={`${hPfx}size`} label={`${abbr}-H Size`} />
        <SlitGroup widgetId={widgetId} rbvPv={`${vPfx}t2.C`} spPv={`${vPfx}size.VAL`} tweakPfx={`${vPfx}size`} label={`${abbr}-V Size`} />
      </div>

      {/* ── Center row ── */}
      <div style={{ display: "flex", gap: COL_GAP }}>
        <SlitGroup widgetId={widgetId} rbvPv={`${hPfx}t2.D`} spPv={`${hPfx}center.VAL`} tweakPfx={`${hPfx}center`} label={`${abbr}-H Center`} />
        <SlitGroup widgetId={widgetId} rbvPv={`${vPfx}t2.D`} spPv={`${vPfx}center.VAL`} tweakPfx={`${vPfx}center`} label={`${abbr}-V Center`} />
      </div>

      {/* ── Buttons ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button style={syncBtn} onClick={() => pvwsWriter.write("29idb:userStringSeq5.PROC", 1)}>Sync All</button>
        <button style={moreBtn}
          onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
            detail: { file: "/ui/29id/29id_Apertures_more.ui", macros: {}, label: "Apertures More" }
          }))}>
          More
        </button>
      </div>
    </div>
  );
}

// ── Schematic ─────────────────────────────────────────────────────────────────

function Schematic() {
  const W = 210, H = 170;
  const cx = 95, cy = 78;    // aperture center
  const aw = 52, ah = 44;    // aperture opening
  const bt = 26;              // blade thickness
  const stroke = "#999";
  const sw = 0.5;

  // Aperture and full-assembly corners
  const apLeft  = cx - aw/2;        // 69
  const apRight = cx + aw/2;        // 121
  const apTop   = cy - ah/2;        // 56
  const apBot   = cy + ah/2;        // 100
  const fLeft   = cx - aw/2 - bt;   // 43
  const fRight  = cx + aw/2 + bt;   // 147
  const fTop    = cy - ah/2 - bt;   // 30
  const fBot    = cy + ah/2 + bt;   // 126

  // V blades (Top/Bottom) claim full width including corners
  const vColor = "rgb(215,175,215)";
  // H blades (In/Out) fill the middle section between V blades
  const hColor = "rgb(180,110,180)";

  return (
    <div style={{ padding: 10 }}>
      <svg width={W} height={H} style={{ display: "block", fontFamily: "sans-serif" }}>

        {/* ── 4 independent blade rectangles ── */}
        {/* Out: full height left strip — owns TL and BL corners */}
        <rect x={fLeft}   y={fTop}  width={apLeft-fLeft}   height={fBot-fTop}  fill={hColor} stroke={stroke} strokeWidth={sw} />
        {/* In: right strip top-to-apBot — owns TR corner, not BR */}
        <rect x={apRight} y={fTop}  width={fRight-apRight} height={apBot-fTop} fill={hColor} stroke={stroke} strokeWidth={sw} />
        {/* Bottom: bottom strip apLeft-to-fRight — owns BR corner, not BL */}
        <rect x={apLeft}  y={apBot} width={fRight-apLeft}  height={fBot-apBot} fill={vColor} stroke={stroke} strokeWidth={sw} />
        {/* Top: middle top strip only — no corners */}
        <rect x={apLeft}  y={fTop}  width={aw}             height={apTop-fTop} fill={vColor} stroke={stroke} strokeWidth={sw} />

        {/* ── Aperture outline ── */}
        <rect x={apLeft} y={apTop} width={aw} height={ah} fill="none" stroke="#555" strokeWidth={1} />

        {/* ── Labels ── */}
        {/* Top */}
        <text x={cx} y={fTop - 10} textAnchor="middle" fontSize={9} fontWeight={600} fill="#333">Top</text>
        <text x={cx} y={fTop - 1}  textAnchor="middle" fontSize={8} fill="#555">m9, CA5</text>
        {/* Bottom */}
        <text x={cx} y={fBot + 11} textAnchor="middle" fontSize={9} fontWeight={600} fill="#333">Bottom</text>
        <text x={cx} y={fBot + 21} textAnchor="middle" fontSize={8} fill="#555">m12, CA3</text>
        {/* Out */}
        <text x={fLeft - 4} y={cy - 7} textAnchor="end" fontSize={9} fontWeight={600} fill="#333">Out</text>
        <text x={fLeft - 4} y={cy + 4} textAnchor="end" fontSize={8} fill="#555">m11, CA2</text>
        {/* In */}
        <text x={fRight + 4} y={cy - 7} textAnchor="start" fontSize={9} fontWeight={600} fill="#333">In</text>
        <text x={fRight + 4} y={cy + 4} textAnchor="start" fontSize={8} fill="#555">m10, CA4</text>

        {/* ── Reference frame ── */}
        {(() => {
          const ox = W - 30, oy = H - 28, al = 18;
          return (
            <g>
              {/* x arrow */}
              <line x1={ox} y1={oy} x2={ox + al} y2={oy} stroke="rgb(0,160,0)" strokeWidth={1.5} markerEnd="url(#ah-x)" />
              {/* y arrow */}
              <line x1={ox} y1={oy} x2={ox}      y2={oy - al} stroke="red" strokeWidth={1.5} markerEnd="url(#ah-y)" />
              {/* z cross (beam into page) */}
              <circle cx={ox} cy={oy} r={5} fill="none" stroke="blue" strokeWidth={1} />
              <line x1={ox - 3} y1={oy - 3} x2={ox + 3} y2={oy + 3} stroke="blue" strokeWidth={1} />
              <line x1={ox - 3} y1={oy + 3} x2={ox + 3} y2={oy - 3} stroke="blue" strokeWidth={1} />
              <text x={ox + al + 8} y={oy + 4}      fontSize={8} fill="rgb(0,130,0)">x</text>
              <text x={ox - 3}      y={oy - al - 2} fontSize={8} fill="red" textAnchor="end">y</text>
              <text x={ox - 8}      y={oy + 4}      fontSize={8} fill="blue" textAnchor="end">z</text>
            </g>
          );
        })()}

        {/* Arrow marker defs */}
        <defs>
          <marker id="ah-x" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="rgb(0,160,0)" />
          </marker>
          <marker id="ah-y" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="red" />
          </marker>
        </defs>

        {/* "You are the photon" label */}
        <text x={W - 4} y={H - 2} textAnchor="end" fontSize={8} fontStyle="italic" fill="#555">You are the photon</text>

      </svg>
    </div>
  );
}

// ── Slits ─────────────────────────────────────────────────────────────────────

export function Slits() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];
  // Per-instance namespace for useConnection ids (see SlitGroup).
  const widgetId = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", borderBottom: `1px solid ${colors.sectionHdrBorder}` }}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setActive(i)}
            style={{
              padding: "6px 16px",
              fontSize: fontSize.label,
              fontWeight: active === i ? 700 : 400,
              color: active === i ? colors.relatedFg : colors.dim,
              background: active === i ? "#fff" : "transparent",
              border: "none",
              borderBottom: active === i ? `2px solid ${colors.relatedFg}` : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "sans-serif",
            }}
          >{t.label}</button>
        ))}
      </div>

      {active < 2
        ? <SlitPanel key={tab.id} widgetId={widgetId} sn={tab.sn} abbr={tab.abbr} />
        : <Schematic />
      }
    </div>
  );
}
