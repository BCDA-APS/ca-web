import { useConnection } from "@diamondlightsource/cs-web-lib";
import { useState, useEffect, useRef } from "react";
import { BLLayoutC } from "./BLLayoutC";
import { BLLayoutAB } from "./BLLayoutAB";
import { BLLayoutD } from "./BLLayoutD";
import { BLLayoutE } from "./BLLayoutE";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble, pvCtx } from "../../../lib/epics";
import { colors, fontSize } from "../../../lib/theme";
import { ChanRbvBox, ChanSpBox, TweakValue, TweakButton } from "../../../widgets/EpicsWidgets";
import type { TraceConfig } from "../../../widgets/StripChart";
function showPanel(id: string) {
  window.dispatchEvent(new CustomEvent("show-panel", { detail: { id } }));
}

// Spawn a registered panel by its panelKey (see DeploymentConfig.
// spawnablePanels). Using the key (not an inline Content reference)
// means the spawned instance is saveable into layouts.
function spawnPanelByKey(label: string, panelKey: string) {
  window.dispatchEvent(new CustomEvent("open-panel", { detail: { label, panelKey } }));
}

export const AHUTCH_STRIP_TOOL_PVS: TraceConfig[] = [
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

function spawnAhutchStripTool() {
  window.dispatchEvent(new CustomEvent("open-stripchart", { detail: {
    label: "A-hutch StripTool", initialPvs: AHUTCH_STRIP_TOOL_PVS,
  }}));
}

const shortcutBtn: React.CSSProperties = {
  background: colors.relatedBg, color: colors.relatedFg,
  border: `1px solid ${colors.relatedBorder}`, borderRadius: 4,
  padding: "2px 8px", fontSize: fontSize.label,
  cursor: "pointer", fontFamily: "sans-serif",
};

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const items: { label: string; action: () => void }[] = [
    { label: "Mirrors",     action: () => { spawnPanelByKey("Mirrors", "mirrors"); setOpen(false); } },
    { label: "Slits",       action: () => { spawnPanelByKey("Slits",   "slits");   setOpen(false); } },
    { label: "DiaGon",       action: () => { showPanel("29id-diagon");       setOpen(false); } },
    { label: "Diagnostics",  action: () => {
      window.dispatchEvent(new CustomEvent("open-ui", {
        detail: { file: "/ui/29id/29id_Diagnostics.ui", macros: {}, label: "Diagnostics" },
      }));
      setOpen(false);
    }},
    { label: "Scan Records", action: () => { showPanel("29id-scan-records"); setOpen(false); } },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button style={shortcutBtn} onClick={() => setOpen(v => !v)}>More {open ? "▴" : "▾"}</button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "100%", marginTop: 2,
          background: "#fff", border: `1px solid ${colors.relatedBorder}`,
          borderRadius: 4, boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          zIndex: 100, minWidth: 110,
        }}>
          {items.map(item => (
            <div key={item.label}
              onClick={item.action}
              style={{
                padding: "4px 10px", fontSize: fontSize.label,
                fontFamily: "sans-serif", cursor: "pointer",
                color: colors.relatedFg,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = colors.relatedBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >{item.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Mini slit widget ──────────────────────────────────────────────────────────

const FW  = 68;  // field width — sized to fit two boxes side-by-side in the 153px gap
const BTN = 18;  // tweak button size

const compactBox: React.CSSProperties = {
  fontSize: fontSize.label,
  height: BTN,
  padding: "0 4px",
};

function MiniSlit({ title, rbvPv, spPv, tweakMinus, tweakValPv, tweakPlus, prec, tweakPrec = 0, bottom }: {
  title:       string;
  rbvPv:       string;
  spPv:        string;
  tweakMinus:  string;
  tweakValPv:  string;
  tweakPlus:   string;
  prec:        number;
  tweakPrec?:  number;
  bottom:      React.ReactNode;
}) {
  const [, conn,, rbv] = useConnection(`msl-rbv-${rbvPv}`, `ca://${rbvPv}`);
  const [,,, sp]        = useConnection(`msl-sp-${spPv}`,   `ca://${spPv}`);
  const [,,, twv]       = useConnection(`msl-tw-${tweakValPv}`, `ca://${tweakValPv}`);

  return (
    <div style={{ border: "1px solid #888", borderRadius: 2, fontFamily: "sans-serif", overflow: "hidden", width: FW + 2, boxSizing: "border-box" }}>
      <div style={{ textAlign: "center", color: "rgb(130,4,0)", fontSize: fontSize.small, padding: "2px 4px", background: colors.cardBg }}>
        {title}
      </div>
      <ChanRbvBox raw={rbv} width={FW} forcePrecision={prec} style={compactBox} onContextMenu={e => pvCtx(rbvPv, rbv, e)} />
      <ChanSpBox  raw={sp}  width={FW} forcePrecision={prec} style={compactBox}
        onCommit={n => pvwsWriter.write(spPv, n)}
        disabled={!conn}
        onContextMenu={e => pvCtx(spPv, sp, e)}
      />
      <div style={{ display: "flex", gap: 1, padding: "1px 0" }}>
        <TweakButton size={BTN} width={13} onClick={() => pvwsWriter.write(tweakMinus, 1)} disabled={!conn}>−</TweakButton>
        <TweakValue value={toDouble(twv)} prec={tweakPrec} onCommit={n => pvwsWriter.write(tweakValPv, n)} style={{ flex: 1, height: BTN }} />
        <TweakButton size={BTN} width={13} onClick={() => pvwsWriter.write(tweakPlus, 1)} disabled={!conn}>+</TweakButton>
      </div>
      {bottom}
    </div>
  );
}

function MiniSlitD() {
  const centerPv = "29idb:Slit4Vt2.D";
  const [,,, ctr] = useConnection("msl-ctr-d", `ca://${centerPv}`);
  return (
    <MiniSlit
      title="D-exit slit"
      rbvPv="29idb:Slit4Vt2.C"
      spPv="29idb:Slit4Vsize.VAL"
      tweakMinus="29idb:Slit4Vsize_tweak.A"
      tweakValPv="29idb:Slit4Vsize_tweakVal.VAL"
      tweakPlus="29idb:Slit4Vsize_tweak.B"
      prec={0}
      tweakPrec={0}
      bottom={
        <div style={{ display: "flex", alignItems: "center", height: BTN, padding: "0 3px", background: colors.cardBg }}
             onContextMenu={e => pvCtx(centerPv, ctr, e)}>
          <span style={{ fontSize: fontSize.label, color: colors.label, flexShrink: 0 }}>At:</span>
          <span style={{ fontSize: fontSize.label, fontFamily: "monospace", flex: 1, textAlign: "right", color: colors.rbvText }}>
            {toDouble(ctr) !== null ? toDouble(ctr)!.toFixed(0) : "—"}
          </span>
          <span style={{ fontSize: fontSize.label, color: colors.unit, marginLeft: 2, flexShrink: 0 }}>um</span>
        </div>
      }
    />
  );
}

export function MiniSlitARPES() {
  return (
    <MiniSlit
      title="ARPES"
      rbvPv="29idb:Slit3CRBV"
      spPv="29idb:Slit3CFit.A"
      tweakMinus="29idb:Slit3CTweak.A"
      tweakValPv="29idb:Slit3CTweakVal"
      tweakPlus="29idb:Slit3CTweak.B"
      prec={1}
      tweakPrec={1}
      bottom={
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
            detail: { file: "/ui/29id/29idc_motorx.ui", macros: { P: "29idb:", M1: "m24" }, label: "3C Motor" }
          }))}
          style={{
            display: "block", width: "100%", textAlign: "center",
            background: colors.relatedBg, color: colors.relatedFg,
            border: "none", borderTop: `1px solid ${colors.relatedBorder}`,
            fontSize: fontSize.label, height: BTN, cursor: "pointer",
            fontFamily: "sans-serif",
          }}
        >3C Motor</button>
      }
    />
  );
}

// ── BeamlineLayout ────────────────────────────────────────────────────────────

export function BeamlineLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
      {/* Shortcut buttons — top right corner */}
      <div style={{ position: "absolute", top: 0, right: 0, display: "flex", gap: 4 }}>
        <button style={shortcutBtn} onClick={spawnAhutchStripTool}>StripTool</button>
        <MoreMenu />
      </div>
      {/* Top row: E + D (beam goes right-to-left: D right-angle at x=405 from row left) */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        <div style={{ flexShrink: 0 }}><BLLayoutE /></div>
        <div style={{ flexShrink: 0 }}><BLLayoutD /></div>
      </div>
      {/* Bottom row: mini slits fill the 153px gap left of ARPES, then C + AB */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        <div style={{ width: 150, flexShrink: 0, display: "flex", gap: 4, justifyContent: "center", alignSelf: "center" }}>
          <MiniSlitD />
          <MiniSlitARPES />
        </div>
        <div style={{ flexShrink: 0, marginRight: -1 }}><BLLayoutC /></div>
        <div style={{ flexShrink: 0 }}><BLLayoutAB /></div>
      </div>
    </div>
  );
}
