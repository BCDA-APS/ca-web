// Renders a caQtDM .ui file as React components.
// Fetches the file, parses it with uiParser, then routes each widget to the
// appropriate React component. All PV connections use cs-web-lib's useConnection.

import { useState, useEffect, useRef, createContext, useContext, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { parseUi, ParsedWidget, ParsedUi } from "./uiParser";
import { pvwsWriter } from "./pvwsWriter";

// ── contexts ──────────────────────────────────────────────────────────────────

interface OverlayState { file: string; macros: Record<string, string>; label: string }
const OpenContext = createContext<(s: OverlayState) => void>(() => {});
// Base URL directory of the current .ui file — used to resolve related display paths.
const BaseDirContext = createContext("/ui");
// Current macros — inherited by caInclude widgets.
const MacrosContext = createContext<Record<string, string>>({});

// ── value extraction ──────────────────────────────────────────────────────────

function extractDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number } }).value;
  return val?.doubleValue ?? null;
}

function extractString(d: unknown): string | null {
  if (!d) return null;
  const val = (d as { value?: { stringValue?: string; doubleValue?: number; arrayValue?: { [i: number]: number; length: number } } }).value;
  if (val?.stringValue !== undefined) return val.stringValue;
  if (val?.doubleValue !== undefined) return String(val.doubleValue);
  // Char waveform (e.g. StatusMessage_RBV, NDAttributesFile): array of char codes → string.
  if (val?.arrayValue) {
    let s = "";
    for (let i = 0; i < val.arrayValue.length; i++) {
      const c = val.arrayValue[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  return null;
}

// Decode a char waveform (arrayValue of char codes) to a string.
// Used as fallback when stringValue is absent (pvws sends DBF_CHAR waveforms this way).
function decodeCharWaveform(d: unknown): string | null {
  const arr = (d as { value?: { arrayValue?: { [i: number]: number; length: number } } })?.value?.arrayValue;
  if (!arr) return null;
  let s = "";
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

// PV precision from the PREC field. cs-web-lib stores it at display.precision
// (one level up from value.doubleValue), mapped from pvws's "precision" field.
function extractPrecision(d: unknown): number | null {
  if (!d) return null;
  const display = (d as { display?: { precision?: number } }).display;
  const prec = display?.precision;
  if (typeof prec === "number") return prec;
  return null;
}

function fmtDouble(v: number, prec: number | null): string {
  if (prec !== null) return v.toFixed(prec);
  // Fallback when PREC not available: engineering notation for large/tiny values.
  if (Math.abs(v) >= 1e5 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(4);
  return v.toPrecision(6);
}

// ── alarm severity ────────────────────────────────────────────────────────────
// caQtDM colors display text based on EPICS alarm severity (unless colorMode=Static).
// cs-web-lib maps pvws severity to rawValue.alarm.quality (AlarmQuality string enum).
function extractAlarmQuality(d: unknown): string {
  if (!d) return "valid";
  return (d as { alarm?: { quality?: string } }).alarm?.quality ?? "valid";
}

// NO_ALARM=green, MINOR=yellow, MAJOR=red, INVALID=magenta
const ALARM_COLORS: Record<string, string> = {
  valid:    "rgb(0,200,0)",
  warning:  "rgb(240,200,0)",
  alarm:    "rgb(220,0,0)",
  invalid:  "rgb(220,100,220)",
};

// ── calc normalization ────────────────────────────────────────────────────────
// caQtDM visibility calcs use EPICS CALC syntax where = means ==.
// Convert single = to == before evaluating as JS, preserving ==, !=, <=, >=.
function normalizeCalc(expr: string): string {
  return expr
    .replace(/==/g, "\x00EQ\x00").replace(/!=/g, "\x00NE\x00")
    .replace(/<=/g, "\x00LE\x00").replace(/>=/g, "\x00GE\x00")
    .replace(/=/g, "==")
    .replace(/\x00EQ\x00/g, "==").replace(/\x00NE\x00/g, "!=")
    .replace(/\x00LE\x00/g, "<=").replace(/\x00GE\x00/g, ">=");
}

// ── font scaling (caQtDM fontScaleMode::WidthAndHeight) ──────────────────────
// Primary constraint is height; cap at 13px to match caQtDM's default appearance.
function scaledFont(height: number): number {
  return Math.max(6, Math.min(height * 0.68, 13));
}

// ── shared button bevel ───────────────────────────────────────────────────────

const BTN_RAISED  = "inset -2px -2px 4px rgba(0,0,0,0.4), inset 1px 1px 3px rgba(255,255,255,0.45)";
const BTN_PRESSED = "inset 2px 2px 4px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,255,255,0.15)";

// ── shared geometry style ─────────────────────────────────────────────────────

function geoStyle(g: ParsedWidget["geometry"], zIndex: number): CSSProperties {
  return {
    position: "absolute",
    left: g.x,
    top: g.y,
    width: g.width,
    height: g.height,
    zIndex,
  };
}

// ── caGraphics — colored rectangle with conditional PV visibility ──────────────

function CaGraphicsWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const visibility = widget.props["visibility"] ?? "";
  const visCalc = widget.props["visibilityCalc"] ?? "";

  // Always call hooks unconditionally; pass dummy address when no channel.
  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel ? `ca://${channel}` : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;

  let visible = true;
  if (channel) {
    if (visibility.endsWith("IfZero")) visible = a === 0;
    else if (visibility.endsWith("IfNotZero")) visible = a !== 0;
    else if (visibility.endsWith("Calc") && visCalc) {
      // Evaluate simple calc expressions: replace A/B with values then eval.
      // Only used for basic arithmetic comparisons — no user input involved.
      try {
        const expr = normalizeCalc(visCalc).replace(/\bA\b/g, String(a)).replace(/\bB\b/g, String(b));
        visible = Boolean(Function(`"use strict"; return (${expr})`)());
      } catch {
        visible = true;
      }
    }
  }

  if (!visible) return null;

  const fg = widget.props["foreground"] ?? "transparent";
  const filled = widget.props["fillstyle"] === "Filled";
  const lineStyle = widget.props["linestyle"] === "Dash" ? "dashed" : "solid";
  const lineSize = parseInt(widget.props["lineSize"] ?? "1");
  const lineColor = widget.props["lineColor"] ?? fg;

  return (
    <div
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        background: filled ? fg : "transparent",
        border: `${lineSize}px ${lineStyle} ${lineColor}`,
        boxSizing: "border-box",
      }}
    />
  );
}

// ── caLineEdit — read-only PV display ─────────────────────────────────────────

function CaLineEditWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  // Use PV's own PREC field for formatting (same as caQtDM).
  // For string/enum PVs (DESC, DTYP, EGU, enum labels), pvws may send both
  // doubleValue (enum index) and stringValue (label). Prefer the label when
  // the stringValue is non-numeric (e.g. "asynMotor", "Use", "Degrees").
  const dbl = extractDouble(rawValue);
  const prec = extractPrecision(rawValue);
  const rawSV = ((rawValue as { value?: { stringValue?: string } })?.value?.stringValue?.replace(/\x00.*/, ""))
             ?? decodeCharWaveform(rawValue) ?? undefined;

  // Hex format: caLineEdit formatType="hexadecimal" → show 0x… (e.g. MSTA bitmask).
  // When hex format is requested, always use the numeric value even if a string label exists.
  const formatType = widget.props["formatType"] ?? "";
  const isHex = formatType.toLowerCase().includes("hex");

  // For hex mode: prefer doubleValue, fall back to parsing stringValue as a number.
  // (Some mbbo PVs send only text; if the text is the decimal form we can hex it.)
  const numForHex = dbl ?? (rawSV !== undefined ? Number(rawSV) : NaN);

  // cs-web-lib keeps connected=true with stale data after IOC disconnect.
  // Treat as live only if we have actual value data.
  const isLive = connected && (dbl !== null || rawSV !== undefined);

  const str = isLive
    ? isHex && !isNaN(numForHex)
      ? `0x${Math.round(numForHex).toString(16).toUpperCase()}`  // e.g. "0x2", "0x401"
      : rawSV && isNaN(Number(rawSV))
      ? rawSV                          // non-numeric string/enum label
      : dbl !== null
      ? fmtDouble(dbl, prec)           // numeric PV, format with PREC
      : rawSV ?? "—"
    : "—";

  const fg = widget.props["foreground"] ?? "rgb(10,0,184)";
  const bg = widget.props["background"] ?? "rgb(200,200,200)";
  const alignment = widget.props["alignment"] ?? "";

  // Alarm coloring: apply unless colorMode is Static without Alarm prefix.
  // Alarm_Static and Alarm_Default → alarm colors on. Static alone → off.
  const colorMode = widget.props["colorMode"] ?? "";
  const isStatic = colorMode.includes("Static") && !colorMode.includes("Alarm");
  const alarmQ = extractAlarmQuality(rawValue);
  const textColor = (!isStatic && isLive) ? (ALARM_COLORS[alarmQ] ?? fg) : fg;

  return (
    <div
      title={channel}
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        color: textColor,
        background: isLive ? bg : "white",
        display: "flex",
        alignItems: "center",
        justifyContent: alignment.includes("AlignHCenter") ? "center"
          : alignment.includes("AlignRight") ? "flex-end"
          : "flex-start",
        fontFamily: "monospace",
        fontSize: scaledFont(widget.geometry.height),
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      {str}
    </div>
  );
}

// ── caTextEntry — editable setpoint ──────────────────────────────────────────

function CaTextEntryWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  const pvDouble = extractDouble(rawValue);
  const prec = extractPrecision(rawValue);
  const rawSV = ((rawValue as { value?: { stringValue?: string } })?.value?.stringValue?.replace(/\x00.*/, ""))
             ?? decodeCharWaveform(rawValue) ?? undefined;
  // Treat as string PV if: stringValue is non-numeric, OR it's an empty string (file/macro fields).
  const isStringPv = rawSV !== undefined && (rawSV === "" || isNaN(Number(rawSV)));
  // cs-web-lib keeps connected=true with stale data after IOC disconnect.
  const isLive = connected && (pvDouble !== null || rawSV !== undefined);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const currentDisplay = isStringPv
    ? rawSV
    : pvDouble !== null
    ? fmtDouble(pvDouble, prec)
    : rawSV ?? "—";

  const displayVal = editing ? draft : isLive ? currentDisplay : "—";

  function handleFocus() {
    setDraft(currentDisplay ?? "");
    setEditing(true);
  }

  function commit() {
    const v = parseFloat(draft);
    pvwsWriter.write(channel, isNaN(v) ? draft : v);
    setEditing(false);
  }

  const fg = widget.props["foreground"] ?? "rgb(0,0,0)";
  const bg = widget.props["background"] ?? "rgb(115,223,255)";

  return (
    <input
      type="text"
      title={channel}
      value={displayVal}
      onChange={e => setDraft(e.target.value)}
      onFocus={handleFocus}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        color: fg,
        background: isLive ? bg : "white",
        border: "1px groove #444",
        borderRadius: 1,
        fontFamily: "monospace",
        fontSize: scaledFont(widget.geometry.height),
        textAlign: "center",
        padding: 0,
        boxSizing: "border-box",
        cursor: "text",
      }}
    />
  );
}

// ── caMessageButton — writes a fixed value to a PV on click ──────────────────

function CaMessageButtonWidget({ widget, ns: _ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const label = widget.props["label"] ?? "BTN";
  const pressMsg = widget.props["pressMessage"] ?? "1";

  const fg = widget.props["foreground"] ?? "#fff";
  const bg = widget.props["background"] ?? "#c00";

  function handleClick() {
    const v = parseFloat(pressMsg);
    pvwsWriter.write(channel, isNaN(v) ? pressMsg : v);
  }

  const [pressed, setPressed] = useState(false);

  return (
    <button
      title={channel}
      onClick={handleClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        color: fg,
        background: bg,
        border: "none",
        borderRadius: 2,
        fontFamily: "sans-serif",
        fontSize: scaledFont(widget.geometry.height),
        cursor: "pointer",
        padding: 0,
        boxShadow: pressed ? BTN_PRESSED : BTN_RAISED,
        filter: pressed ? "brightness(0.85)" : "brightness(1.05)",
      }}
    >
      {label}
    </button>
  );
}

// ── caLabel — static text or conditional PV-driven label ─────────────────────

function CaLabelWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";
  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;

  let visible = true;
  if (channel && visibility) {
    if (visibility.endsWith("IfZero"))    visible = a === 0;
    else if (visibility.endsWith("IfNotZero")) visible = a !== 0;
    else if (visibility.endsWith("Calc") && visCalc) {
      try {
        const expr = normalizeCalc(visCalc).replace(/\bA\b/g, String(a)).replace(/\bB\b/g, String(b));
        visible = Boolean(Function(`"use strict"; return (${expr})`)());
      } catch { visible = true; }
    }
  }

  if (!visible) return null;

  const text = widget.props["text"] ?? "";
  const fg = widget.props["foreground"] ?? "rgb(0,0,0)";
  const { height } = widget.geometry;
  const fontSize = scaledFont(height);
  const alignment = widget.props["alignment"] ?? "";
  const justifyContent = alignment.includes("AlignHCenter") ? "center"
    : alignment.includes("AlignRight") ? "flex-end"
    : "flex-start";

  // caLabel always has transparent background — the background property in caQtDM
  // controls alarm coloring, not the fill. The caGraphics rectangles behind labels
  // provide the visible background color.

  return (
    <div
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        color: fg,
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent,
        fontFamily: "sans-serif",
        fontSize,
        overflow: "visible",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

// ── caChoice — enum selector (writes integer index to PV) ─────────────────────

function CaChoiceWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  const choices = (rawValue as { display?: { choices?: string[] } })?.display?.choices;
  const currentIdx = Math.round(extractDouble(rawValue) ?? 0);

  const fg = widget.props["foreground"] ?? "rgb(0,0,0)";
  const bg = widget.props["background"] ?? "#c8c8c8";
  const { x, y, width, height } = widget.geometry;
  const stacking = widget.props["stackingMode"] ?? "";
  const n = choices?.length ?? 1;
  // caQtDM stackingMode: "Column" = buttons side by side (horizontal columns),
  // "Row" = buttons stacked (vertical rows). When absent, infer from geometry:
  // height × n >= width means each horizontal slot would be square or taller → go vertical.
  const vertical = stacking === "Row" || (stacking !== "Column" && height * n >= width);
  const btnW = vertical ? width : Math.floor(width / n);
  const btnH = vertical ? Math.floor(height / n) : height;

  // Render as a row or column of buttons (one per enum value), active one highlighted.
  return (
    <div
      title={channel}
      style={{
        position: "absolute", left: x, top: y, width, height,
        zIndex: widget.zIndex,
        display: "flex",
        flexDirection: vertical ? "column" : "row",
      }}
    >
      {(choices ?? [String(currentIdx)]).map((label, i) => (
        <button
          key={i}
          disabled={!connected}
          onClick={() => pvwsWriter.write(channel, i)}
          style={{
            width: btnW,
            height: btnH,
            background: i === currentIdx ? bg : bg,
            color: fg,
            border: "none",
            borderRadius: 0,
            fontFamily: "sans-serif",
            fontSize: scaledFont(btnH),
            cursor: connected ? "pointer" : "default",
            padding: 0,
            // Raised (inactive) vs sunken (active) — classic Qt bevel
            boxShadow: i === currentIdx
              ? "inset 2px 2px 4px rgba(0,0,0,0.5), inset -1px -1px 2px rgba(255,255,255,0.15)"
              : "inset -2px -2px 4px rgba(0,0,0,0.4), inset 1px 1px 3px rgba(255,255,255,0.45)",
            filter: i === currentIdx ? "brightness(0.85)" : "brightness(1.05)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── caRelatedDisplay — opens another .ui file in a floating panel ─────────────

function parseArgs(argsStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const kv of argsStr.split(",")) {
    const eq = kv.indexOf("=");
    if (eq === -1) continue;
    result[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return result;
}

function CaRelatedDisplayWidget({ widget, ns: _ns }: { widget: ParsedWidget; ns: string }) {
  const openOverlay = useContext(OpenContext);
  const baseDir = useContext(BaseDirContext);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const label = (widget.props["label"] ?? "More").replace(/^-/, "");
  const fg = widget.props["foreground"] ?? "#fff";
  const bg = widget.props["background"] ?? "rgb(51,153,0)";

  const files  = (widget.props["files"]  ?? "").split(";").filter(Boolean);
  const labels = (widget.props["labels"] ?? "").split(";").filter(Boolean);
  const args   = (widget.props["args"]   ?? "").split(";").filter(Boolean);

  const items = files.map((f, i) => ({
    label: labels[i] ?? f,
    file: `${baseDir}/${f.replace(/\.adl$/, ".ui")}`,
    macros: parseArgs(args[i] ?? ""),
  }));

  if (items.length === 0) return null;

  // stackingMode="Hidden": invisible transparent overlay — no button, no label.
  // Opens the first related display directly on click (used as a click-through overlay
  // placed on top of another widget, like the MSTA hex display in motorx_all.ui).
  const stackingMode = widget.props["stackingMode"] ?? "";
  if (stackingMode === "Hidden") {
    return (
      <div
        title={items[0]?.label}
        onClick={() => openOverlay({ ...items[0] })}
        style={{
          ...geoStyle(widget.geometry, widget.zIndex),
          background: "transparent", cursor: "pointer",
        }}
      />
    );
  }

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    setMenuPos(r ? { top: r.bottom + 2, left: r.left } : null);
  }

  // Single item: open directly on click. Multiple: show a portal menu.
  const btnStyle: CSSProperties = {
    ...geoStyle(widget.geometry, widget.zIndex),
    color: fg, background: bg, border: "none", borderRadius: 2,
    fontFamily: "sans-serif", fontSize: scaledFont(widget.geometry.height), cursor: "pointer", padding: 0,
    boxShadow: pressed ? BTN_PRESSED : BTN_RAISED,
    filter: pressed ? "brightness(0.85)" : "brightness(1.05)",
  };
  const bevelHandlers = {
    onMouseDown: () => setPressed(true),
    onMouseUp:   () => setPressed(false),
    onMouseLeave: () => setPressed(false),
  };

  if (items.length === 1) {
    return (
      <button ref={btnRef} onClick={() => openOverlay({ ...items[0] })} style={btnStyle} {...bevelHandlers}>
        {label}
      </button>
    );
  }

  return (
    <>
      <button ref={btnRef} onClick={openMenu} style={btnStyle} {...bevelHandlers}>
        {label} ▾
      </button>
      {menuPos && createPortal(
        <>
          {/* backdrop to close on click-away */}
          <div onClick={() => setMenuPos(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div
            style={{
              position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999,
              background: "#fff", border: "1px solid #999", borderRadius: 2,
              minWidth: 140, boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
            }}
          >
            {items.map((item, i) => (
              <div
                key={i}
                onClick={() => { openOverlay(item); setMenuPos(null); }}
                style={{
                  padding: "4px 8px", fontSize: 11, fontFamily: "sans-serif",
                  cursor: "pointer", whiteSpace: "nowrap",
                  borderBottom: i < items.length - 1 ? "1px solid #eee" : "none",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#e8f0fe")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                {item.label}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── caMenu — enum dropdown selector ──────────────────────────────────────────

function CaMenuWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  const choices = (rawValue as { display?: { choices?: string[] } })?.display?.choices;
  const currentIdx = Math.round(extractDouble(rawValue) ?? 0);
  const fg = widget.props["foreground"] ?? "rgb(0,0,0)";
  const bg = widget.props["background"] ?? "rgb(210,210,210)";

  return (
    <select
      title={channel}
      value={currentIdx}
      disabled={!connected}
      onChange={e => pvwsWriter.write(channel, parseInt(e.target.value))}
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        color: fg,
        background: bg,
        fontFamily: "sans-serif",
        fontSize: scaledFont(widget.geometry.height),
        border: "none",
        borderRadius: 2,
        padding: "0 2px",
        cursor: connected ? "pointer" : "default",
        boxSizing: "border-box",
        boxShadow: BTN_RAISED,
      }}
    >
      {(choices ?? []).map((label, i) => (
        <option key={i} value={i}>{label}</option>
      ))}
    </select>
  );
}

// ── caByte — bit-field LED display ───────────────────────────────────────────
// Renders each bit from startBit to endBit as a colored square.
// foreground = active color (bit set), background = inactive color (bit clear).
// direction="Down": bit startBit at top, endBit at bottom.

function CaByteWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  const dbl = extractDouble(rawValue);
  const value = connected && dbl !== null ? Math.round(dbl) : 0;

  const startBit = parseInt(widget.props["startBit"] ?? "0");
  const endBit   = parseInt(widget.props["endBit"]   ?? "7");
  const fg = widget.props["foreground"] ?? "rgb(0,200,0)";
  const bg = widget.props["background"] ?? "rgb(200,200,200)";
  const { width, height } = widget.geometry;
  const numBits = endBit - startBit + 1;
  const cellH = height / numBits;

  const bits: boolean[] = [];
  for (let i = startBit; i <= endBit; i++) {
    bits.push(Boolean((value >> i) & 1));
  }

  return (
    <div title={channel} style={{ ...geoStyle(widget.geometry, widget.zIndex), display: "flex", flexDirection: "column" }}>
      {bits.map((set, idx) => (
        <div key={idx} style={{
          width, height: cellH,
          background: set ? fg : bg,
          boxSizing: "border-box",
          border: "1px solid rgba(0,0,0,0.25)",
          flexShrink: 0,
        }} />
      ))}
    </div>
  );
}

// ── caCamera — live area-detector image display ───────────────────────────────
// Connects to channelData (pixel array), channelWidth, channelHeight.
// Renders to an HTML Canvas with per-frame auto-scaling (grayscale).

const SIDEBAR_W = 22;
const TOPBAR_H  = 22;

function CaCameraWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const chData   = widget.props["channelData"]   ?? "";
  const chWidth  = widget.props["channelWidth"]  ?? "";
  const chHeight = widget.props["channelHeight"] ?? "";

  const [, connData, , rawData]  = useConnection(`${ns}-${widget.name}-dat`, `ca://${chData}`);
  const [, , , rawWidth]         = useConnection(`${ns}-${widget.name}-w`,   `ca://${chWidth}`);
  const [, , , rawHeight]        = useConnection(`${ns}-${widget.name}-h`,   `ca://${chHeight}`);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Dimensions
  const wDbl = extractDouble(rawWidth);  const hDbl = extractDouble(rawHeight);
  const wStr = extractString(rawWidth);  const hStr = extractString(rawHeight);
  const imgW = Math.round(wDbl ?? (wStr ? parseFloat(wStr) : 0));
  const imgH = Math.round(hDbl ?? (hStr ? parseFloat(hStr) : 0));

  type NumArr = { [i: number]: number; length: number };
  const arr    = (rawData as { value?: { arrayValue?: NumArr } })?.value?.arrayValue;
  const arrLen = arr?.length ?? 0;
  const effectiveW = imgW > 0 ? imgW : (arrLen > 0 ? Math.round(Math.sqrt(arrLen)) : 0);
  const effectiveH = imgH > 0 ? imgH : (arrLen > 0 ? Math.round(Math.sqrt(arrLen)) : 0);

  // Controls
  const [autoLevels, setAutoLevels] = useState(true);
  const [manMin, setManMin] = useState(0);
  const [manMax, setManMax] = useState(255);
  const [zoomMult, setZoomMult] = useState(1);    // multiplier on top of fit (1 = fit)
  const [fps, setFps] = useState(0);
  const [cursorInfo, setCursorInfo] = useState("");
  const [frameMinMax, setFrameMinMax] = useState<[number, number]>([0, 255]);
  const lastFrameTime = useRef(0);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });

  // Track viewport size to compute fit scale
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setViewportSize({ w: r.width, h: r.height });
    });
    obs.observe(vp);
    return () => obs.disconnect();
  }, []);

  const fitScale = (viewportSize.w > 0 && effectiveW > 0)
    ? Math.min(viewportSize.w / effectiveW, viewportSize.h / effectiveH)
    : 1;
  const displayW = Math.round(effectiveW * fitScale * zoomMult);
  const displayH = Math.round(effectiveH * fitScale * zoomMult);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !arr || arrLen === 0 || effectiveW <= 0 || effectiveH <= 0) return;
    canvas.width  = effectiveW;
    canvas.height = effectiveH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.min(arrLen, effectiveW * effectiveH);

    // pvws transmits DBF_CHAR (signed int8) as negative values, but area detector
    // raw pixel data is logically unsigned (uint8). Convert: v < 0 → v + 256.
    const pixel = (i: number) => { const v = arr[i]; return v < 0 ? v + 256 : v; };

    let lo: number, hi: number;
    if (autoLevels) {
      lo = Infinity; hi = -Infinity;
      for (let i = 0; i < n; i++) { const v = pixel(i); if (v < lo) lo = v; if (v > hi) hi = v; }
      setFrameMinMax([lo, hi]);
    } else {
      lo = manMin; hi = manMax;
    }
    const range = hi - lo || 1;

    const imgData = ctx.createImageData(effectiveW, effectiveH);
    const d = imgData.data;
    for (let i = 0; i < n; i++) {
      const gray = Math.max(0, Math.min(255, (((pixel(i) - lo) / range) * 255) | 0));
      const j = i * 4;
      d[j] = d[j + 1] = d[j + 2] = gray;
      d[j + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // FPS
    const now = Date.now();
    if (lastFrameTime.current) setFps(Math.round(1000 / (now - lastFrameTime.current)));
    lastFrameTime.current = now;
  }, [arr, arrLen, effectiveW, effectiveH, autoLevels, manMin, manMax]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = effectiveW / rect.width;
    const scaleY = effectiveH / rect.height;
    const px = Math.floor((e.clientX - rect.left) * scaleX);
    const py = Math.floor((e.clientY - rect.top)  * scaleY);
    if (arr && px >= 0 && px < effectiveW && py >= 0 && py < effectiveH) {
      const val = arr[py * effectiveW + px];
      setCursorInfo(`x:${px} y:${py} z:${val}`);
    }
  }

  const barStyle: React.CSSProperties = {
    background: "#c8c8c8", display: "flex", alignItems: "center",
    fontSize: 10, fontFamily: "sans-serif", color: "#000", gap: 4,
    flexShrink: 0, padding: "0 4px",
  };
  const inputStyle: React.CSSProperties = {
    width: 38, fontSize: 10, padding: "0 2px", height: 16, border: "1px inset #888",
  };
  const btnStyle: React.CSSProperties = {
    width: 18, height: 18, fontSize: 13, lineHeight: 1, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "#e0e0e0", border: "1px solid #999", cursor: "pointer", flexShrink: 0,
  };

  const showCanvas = connData && effectiveW > 0 && effectiveH > 0;

  // caCamera often has sizePolicy=MinimumExpanding — stretch to fill container width.
  const cameraStyle: React.CSSProperties = {
    position: "absolute",
    left: widget.geometry.x,
    top: widget.geometry.y,
    right: 0,
    height: widget.geometry.height,
    zIndex: widget.zIndex,
    display: "flex", flexDirection: "column", overflow: "hidden", background: "#000",
  };

  return (
    <div style={cameraStyle}>

      {/* ── top bar ── */}
      <div style={{ ...barStyle, height: TOPBAR_H }}>
        <span>Min:</span>
        <input style={inputStyle} type="number" value={autoLevels ? frameMinMax[0] : manMin}
          readOnly={autoLevels}
          onChange={e => { setAutoLevels(false); setManMin(Number(e.target.value)); }} />
        <span>Max:</span>
        <input style={inputStyle} type="number" value={autoLevels ? frameMinMax[1] : manMax}
          readOnly={autoLevels}
          onChange={e => { setAutoLevels(false); setManMax(Number(e.target.value)); }} />
        <span>Auto:</span>
        <input type="checkbox" checked={autoLevels} onChange={e => setAutoLevels(e.target.checked)} />
        <span style={{ marginLeft: 4, color: "#444" }}>{cursorInfo || "\u00a0"}</span>
        <span style={{ marginLeft: "auto" }}>{fps} U/s (Mono,)</span>
      </div>

      {/* ── image row + sidebar ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* scrollable viewport */}
        <div ref={viewportRef} style={{ flex: 1, minWidth: 0, overflow: zoomMult > 1 ? "auto" : "hidden", background: "#000" }}>
          {showCanvas
            ? <canvas ref={canvasRef}
                style={{ display: "block", width: displayW, height: displayH, imageRendering: "pixelated" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setCursorInfo("")}
              />
            : <div style={{ color: "#555", fontSize: 11, fontFamily: "monospace", padding: 8 }}>
                {connData ? "Waiting for image\u2026" : "Connecting\u2026"}<br />{chData}
              </div>
          }
        </div>

        {/* ── right sidebar (zoom) ── */}
        <div style={{ width: SIDEBAR_W, background: "#b0b0b0", display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 0", gap: 2, flexShrink: 0 }}>
          <div style={btnStyle} onClick={() => setZoomMult(z => Math.min(8, parseFloat((z * 1.5).toFixed(2))))}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="6" cy="6" r="5" fill="none" stroke="#333" strokeWidth="1.5"/>
              <line x1="4" y1="6" x2="8" y2="6" stroke="#333" strokeWidth="1.5"/>
              <line x1="6" y1="4" x2="6" y2="8" stroke="#333" strokeWidth="1.5"/>
              <line x1="10" y1="10" x2="13" y2="13" stroke="#333" strokeWidth="1.5"/>
            </svg>
          </div>
          <input type="range" min={0} max={3} step={0.1}
            value={Math.log2(zoomMult)}
            onChange={e => setZoomMult(parseFloat(Math.pow(2, Number(e.target.value)).toFixed(2)))}
            style={{ flex: 1, writingMode: "vertical-lr", direction: "rtl", width: 16, cursor: "pointer" }}
          />
          <div style={btnStyle} onClick={() => setZoomMult(z => Math.max(1, parseFloat((z / 1.5).toFixed(2))))}>
            <svg width="14" height="14" viewBox="0 0 14 14">
              <circle cx="6" cy="6" r="5" fill="none" stroke="#333" strokeWidth="1.5"/>
              <line x1="4" y1="6" x2="8" y2="6" stroke="#333" strokeWidth="1.5"/>
              <line x1="10" y1="10" x2="13" y2="13" stroke="#333" strokeWidth="1.5"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── caPolyLine — decorative SVG line ─────────────────────────────────────────

function CaPolyLineWidget({ widget }: { widget: ParsedWidget }) {
  const xyPairs = widget.props["xyPairs"] ?? "";
  const fg = widget.props["foreground"] ?? "#00f";
  const lineSize = parseInt(widget.props["lineSize"] ?? "1");
  const { x, y, width, height, } = widget.geometry;

  // Parse "x1,y1;x2,y2;..." relative to widget origin
  const points = xyPairs
    .split(";")
    .filter(Boolean)
    .map(pair => {
      const [px, py] = pair.split(",").map(Number);
      return `${px},${py}`;
    })
    .join(" ");

  return (
    <svg
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height,
        zIndex: widget.zIndex,
        overflow: "visible",
      }}
    >
      <polyline points={points} fill="none" stroke={fg} strokeWidth={lineSize} />
    </svg>
  );
}

// ── caCartesianPlot — XY line/dot chart for waveform PVs ─────────────────────
// channels_N = "xPv;yPv" — x may be empty (use sample index as X).
// Supports up to 4 curves. Draws onto an HTML canvas; auto-scales both axes.

const CART_MAX = 4;

function CaCartesianPlotWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  // Parse up to CART_MAX channel pairs (fixed at parse time — hooks called unconditionally).
  const chPairs = Array.from({ length: CART_MAX }, (_, i) => {
    const s = widget.props[`channels_${i + 1}`] ?? "";
    const semi = s.indexOf(";");
    return semi >= 0
      ? { x: s.slice(0, semi).trim(), y: s.slice(semi + 1).trim() }
      : { x: "", y: s.trim() };
  });

  // useConnection calls — must be unconditional and fixed in count.
  const [,,, rawY0] = useConnection(`${ns}-${widget.name}-y0`, chPairs[0].y ? `ca://${chPairs[0].y}` : "ca://");
  const [,,, rawX0] = useConnection(`${ns}-${widget.name}-x0`, chPairs[0].x ? `ca://${chPairs[0].x}` : "ca://");
  const [,,, rawY1] = useConnection(`${ns}-${widget.name}-y1`, chPairs[1].y ? `ca://${chPairs[1].y}` : "ca://");
  const [,,, rawX1] = useConnection(`${ns}-${widget.name}-x1`, chPairs[1].x ? `ca://${chPairs[1].x}` : "ca://");
  const [,,, rawY2] = useConnection(`${ns}-${widget.name}-y2`, chPairs[2].y ? `ca://${chPairs[2].y}` : "ca://");
  const [,,, rawX2] = useConnection(`${ns}-${widget.name}-x2`, chPairs[2].x ? `ca://${chPairs[2].x}` : "ca://");
  const [,,, rawY3] = useConnection(`${ns}-${widget.name}-y3`, chPairs[3].y ? `ca://${chPairs[3].y}` : "ca://");
  const [,,, rawX3] = useConnection(`${ns}-${widget.name}-x3`, chPairs[3].x ? `ca://${chPairs[3].x}` : "ca://");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const title  = widget.props["Title"]  ?? "";
  const titleX = widget.props["TitleX"] ?? "";
  const titleY = widget.props["TitleY"] ?? "";
  const bg     = widget.props["background"] ?? "rgb(115,223,255)";

  type NumArr = { [i: number]: number; length: number };
  function toArr(raw: unknown): number[] | null {
    const arr = (raw as { value?: { arrayValue?: NumArr } })?.value?.arrayValue;
    if (!arr || arr.length === 0) return null;
    return Array.from({ length: arr.length }, (_, i) => arr[i]);
  }

  const rawYs = [rawY0, rawY1, rawY2, rawY3];
  const rawXs = [rawX0, rawX1, rawX2, rawX3];
  const DEFAULT_COLORS = ["rgb(0,0,0)", "rgb(220,0,0)", "rgb(0,0,200)", "rgb(0,140,0)"];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const curves = rawYs.map((rawY, i) => ({
      ys: toArr(rawY),
      xs: toArr(rawXs[i]),
      color: widget.props[`color_${i + 1}`] ?? DEFAULT_COLORS[i],
      dots: (widget.props[`Style_${i + 1}`] ?? "").includes("Dots"),
    })).filter(c => c.ys && c.ys.length > 0);

    const W = canvas.width;
    const H = canvas.height;
    const ml = titleY ? 52 : 44, mr = 8;
    const mt = title ? 22 : 8;
    const mb = titleX ? 38 : 26;
    const pw = W - ml - mr;
    const ph = H - mt - mb;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgb(187,187,187)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(ml, mt, pw, ph);

    if (curves.length === 0) return;

    // Auto-scale
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const c of curves) {
      const n = c.ys!.length;
      for (let i = 0; i < n; i++) {
        const x = c.xs ? c.xs[i] : i;
        const y = c.ys![i];
        if (isFinite(x)) { xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); }
        if (isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
      }
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
    if (xMin === xMax) { xMin -= 0.5; xMax += 0.5; }
    if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }

    const toCanvasX = (x: number) => ml + (x - xMin) / (xMax - xMin) * pw;
    const toCanvasY = (y: number) => mt + ph - (y - yMin) / (yMax - yMin) * ph;

    const fmtTick = (v: number) => {
      if (Math.abs(v) >= 10000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
      const s = v.toPrecision(3);
      return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
    };

    // Grid (dashed red lines, like caQtDM)
    const NTICKS = 4;
    ctx.strokeStyle = "rgba(200,0,0,0.45)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 5]);
    for (let g = 1; g < NTICKS; g++) {
      const gx = ml + g * pw / NTICKS;
      const gy = mt + g * ph / NTICKS;
      ctx.beginPath(); ctx.moveTo(gx, mt); ctx.lineTo(gx, mt + ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ml, gy); ctx.lineTo(ml + pw, gy); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Axes border
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.strokeRect(ml, mt, pw, ph);

    // Tick labels
    ctx.fillStyle = "black";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    for (let g = 0; g <= NTICKS; g++) {
      ctx.fillText(fmtTick(xMin + g * (xMax - xMin) / NTICKS), ml + g * pw / NTICKS, mt + ph + 11);
    }
    ctx.textAlign = "right";
    for (let g = 0; g <= NTICKS; g++) {
      ctx.fillText(fmtTick(yMax - g * (yMax - yMin) / NTICKS), ml - 3, mt + g * ph / NTICKS + 3);
    }

    // Title
    if (title) {
      ctx.fillStyle = "black"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(title, W / 2, 14);
    }
    // X label
    if (titleX) {
      ctx.fillStyle = "black"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(titleX, ml + pw / 2, H - 5);
    }
    // Y label (rotated)
    if (titleY) {
      ctx.save();
      ctx.translate(10, mt + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "black"; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(titleY, 0, 0);
      ctx.restore();
    }

    // Draw curves (clipped to plot area)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ml, mt, pw, ph);
    ctx.clip();

    for (const c of curves) {
      const n = c.ys!.length;
      ctx.strokeStyle = c.color;
      ctx.fillStyle = c.color;
      ctx.lineWidth = 1;
      if (c.dots) {
        for (let i = 0; i < n; i++) {
          const y = c.ys![i];
          if (!isFinite(y)) continue;
          ctx.beginPath();
          ctx.arc(toCanvasX(c.xs ? c.xs[i] : i), toCanvasY(y), 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          const y = c.ys![i];
          if (!isFinite(y)) { started = false; continue; }
          const px = toCanvasX(c.xs ? c.xs[i] : i);
          const py = toCanvasY(y);
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  const { x, y, width, height } = widget.geometry;
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: "absolute", left: x, top: y, width, height, zIndex: widget.zIndex }}
    />
  );
}

// ── Overlay panel — draggable floating window (portal) ───────────────────────
// Self-contained: manages its own position so multiple can be open at once.

interface OpenOverlay { id: number; state: OverlayState; initPos: { x: number; y: number } }

function OverlayPanel({ ov, onClose }: { ov: OpenOverlay; onClose: () => void }) {
  const [pos, setPos] = useState(ov.initPos);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setPos({ x: dragRef.current.origX + ev.clientX - dragRef.current.startX,
               y: dragRef.current.origY + ev.clientY - dragRef.current.startY });
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return createPortal(
    <div style={{
      position: "fixed", top: pos.y, left: pos.x, zIndex: 9999,
      background: "#1a1a2e", borderRadius: 4,
      boxShadow: "0 4px 20px rgba(0,0,0,0.6)", border: "1px solid #444",
    }}>
      <div onMouseDown={onMouseDown} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "4px 8px", background: "#0f2035", borderRadius: "4px 4px 0 0", cursor: "grab",
      }}>
        <span style={{ color: "#90caf9", fontSize: 11, fontFamily: "monospace" }}>{ov.state.label}</span>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px",
        }}>×</button>
      </div>
      <UiRenderer file={ov.state.file} macros={ov.state.macros} />
    </div>,
    document.body
  );
}

// ── PV info panel (portal) ────────────────────────────────────────────────────

interface PvInfoPanelProps {
  channel: string;
  widgetName: string;
  widgetClass: string;
  onClose: () => void;
}

function PvInfoPanel({ channel, widgetName, widgetClass, onClose }: PvInfoPanelProps) {
  const [, connected, , rawValue] = useConnection(`pvinfo-${channel}`, `ca://${channel}`);
  const dbl = extractDouble(rawValue);
  const prec = extractPrecision(rawValue);
  const rawSV = (rawValue as { value?: { stringValue?: string } })?.value?.stringValue;
  // cs-web-lib may keep connected=true with stale data after IOC disconnect.
  // Treat as live only if we have actual value data.
  const isLive = connected && (dbl !== null || rawSV !== undefined);
  const choices = (rawValue as { display?: { choices?: string[] } })?.display?.choices;
  const units   = (rawValue as { display?: { units?: string } })?.display?.units;
  const range   = (rawValue as { display?: { controlRange?: { min?: number; max?: number } } })?.display?.controlRange;
  const timestamp = (rawValue as { time?: { datetime?: string } })?.time?.datetime;
  const alarmQ  = extractAlarmQuality(rawValue);

  // Map cs-web-lib AlarmQuality → EPICS severity string (matching native caQtDM display)
  const severityStr: Record<string, string> = {
    valid: "NO_ALARM", warning: "MINOR", alarm: "MAJOR", invalid: "INVALID",
  };
  const epicsAlarmStr = severityStr[alarmQ] ?? alarmQ.toUpperCase();

  // Infer DBF type
  let dbfType = "DBF_DOUBLE";
  if (choices?.length) dbfType = "DBF_ENUM";
  else if (rawSV && isNaN(Number(rawSV))) dbfType = "DBF_STRING";

  // Value string: use PREC for formatting, no units appended here (units shown separately)
  const valueStr = rawSV && isNaN(Number(rawSV))
    ? rawSV
    : dbl !== null ? fmtDouble(dbl, prec) : "—";

  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 175, y: 80 });
  const dragRef2 = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  function onHeaderDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef2.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    function onM(ev: MouseEvent) {
      if (!dragRef2.current) return;
      setPos({ x: dragRef2.current.ox + ev.clientX - dragRef2.current.sx,
               y: dragRef2.current.oy + ev.clientY - dragRef2.current.sy });
    }
    function onU() { dragRef2.current = null; window.removeEventListener("mousemove", onM); window.removeEventListener("mouseup", onU); }
    window.addEventListener("mousemove", onM);
    window.addEventListener("mouseup", onU);
  }

  const row = (label: string, value: string | number | undefined) =>
    value !== undefined && value !== "" ? (
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ color: "#555", minWidth: 90 }}>{label}</span>
        <span style={{ fontWeight: 500 }}>{String(value)}</span>
      </div>
    ) : null;

  return createPortal(
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 99999,
      background: "#f5f5f5", border: "2px outset #ccc",
      borderRadius: 3, fontFamily: "monospace", fontSize: 11, color: "#000",
      minWidth: 310, boxShadow: "3px 3px 8px rgba(0,0,0,0.45)",
      userSelect: "none",
    }}>
      {/* Title bar */}
      <div onMouseDown={onHeaderDown} style={{
        background: "#4a6fa5", color: "#fff", padding: "3px 8px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "grab", borderRadius: "1px 1px 0 0",
      }}>
        <span style={{ fontWeight: 700 }}>caQtDM</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>

      {/* Content */}
      <div style={{ padding: "8px 10px", lineHeight: 1.7 }}>
        <div>Object: {widgetName} <span style={{ color: "#888" }}>({widgetClass})</span></div>
        <div style={{ color: "#888", fontSize: 10 }}>! configuration values are only fetched once</div>
        <div style={{ margin: "4px 0", borderTop: "1px solid #bbb" }} />
        <div style={{ color: "#000080", fontWeight: 700 }}>{channel}</div>
        <div>Plugin: epics3 : {isLive ? "loaded & connected" : <span style={{ color: "red" }}>loaded but not connected</span>}</div>
        <div style={{ margin: "4px 0", borderTop: "1px solid #aaa", borderBottom: "1px solid #aaa", padding: "2px 0", letterSpacing: 2 }}>========================</div>
        {isLive ? <>
          {timestamp && row("TimeStamp:", new Date(timestamp).toLocaleString())}
          {row("Type:", dbfType)}
          {row("Count:", 1)}
          {row("Value:", valueStr)}
          {dbl !== null && !choices && row("Value (num):", dbl)}
          {choices && <>
            <div>{choices.length} state{choices.length !== 1 ? "s" : ""}:</div>
            {choices.map((c, i) => <div key={i} style={{ paddingLeft: 16 }}>{i}  {c}</div>)}
          </>}
          <div style={{ margin: "2px 0", borderTop: "1px dotted #ccc" }} />
          {row("Severity:", epicsAlarmStr)}
          {row("Alarm status:", "OK")}
          {units && row("Units:", units)}
          {prec !== null && row("Precision (channel):", prec)}
          {range && row("LOPR:", range.min ?? 0)}
          {range && row("HOPR:", range.max ?? 0)}
        </> : <div style={{ color: "#888", fontStyle: "italic" }}>Waiting for data…</div>}
      </div>
    </div>,
    document.body
  );
}

// ── caInclude — embeds another .ui file inline ────────────────────────────────

function CaIncludeWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const baseDir = useContext(BaseDirContext);
  const parentMacros = useContext(MacrosContext);

  const filename = widget.props["filename"] ?? "";
  const extraMacros = parseArgs(widget.props["macro"] ?? "");
  const macros = { ...parentMacros, ...extraMacros };

  const file = filename ? `${baseDir}/${filename.replace(/\.adl$/, ".ui")}` : "";
  const subBaseDir = file.substring(0, file.lastIndexOf("/")) || "/ui";

  const [subUi, setSubUi] = useState<ParsedUi | null>(null);
  const [error, setError]  = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    setSubUi(null); setError(null);
    fetch(file)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(xml => setSubUi(parseUi(xml, macros)))
      .catch(e => setError(String(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, JSON.stringify(macros)]);

  const { width, height } = widget.geometry;
  const containerStyle = { ...geoStyle(widget.geometry, widget.zIndex), overflow: "hidden" as const };

  if (!file)   return null;
  if (error)   return <div style={{ ...containerStyle, color: "red",  fontSize: 9 }}>{filename}: {error}</div>;
  if (!subUi)  return <div style={{ ...containerStyle, color: "#888", fontSize: 9 }}>Loading…</div>;

  const s = Math.min(width / subUi.nativeWidth, height / subUi.nativeHeight);
  const subNs = `${ns}_${widget.name}`;

  return (
    <div style={containerStyle}>
      <BaseDirContext.Provider value={subBaseDir}>
        <MacrosContext.Provider value={macros}>
          <div style={{ width: subUi.nativeWidth, height: subUi.nativeHeight, transform: `scale(${s})`, transformOrigin: "top left", position: "relative" }}>
            {subUi.widgets.map(w => <WidgetRouter key={w.name} widget={w} ns={subNs} />)}
          </div>
        </MacrosContext.Provider>
      </BaseDirContext.Provider>
    </div>
  );
}

// ── widget router ─────────────────────────────────────────────────────────────

function WidgetRouter({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  switch (widget.class) {
    case "caLineEdit":       return <CaLineEditWidget widget={widget} ns={ns} />;
    case "caTextEntry":      return <CaTextEntryWidget widget={widget} ns={ns} />;
    case "caGraphics":       return <CaGraphicsWidget widget={widget} ns={ns} />;
    case "caLabel":          return <CaLabelWidget widget={widget} ns={ns} />;
    case "caChoice":         return <CaChoiceWidget widget={widget} ns={ns} />;
    case "caMessageButton":  return <CaMessageButtonWidget widget={widget} ns={ns} />;
    case "caRelatedDisplay": return <CaRelatedDisplayWidget widget={widget} ns={ns} />;
    case "caMenu":           return <CaMenuWidget widget={widget} ns={ns} />;
    case "caPolyLine":       return <CaPolyLineWidget widget={widget} />;
    case "caCartesianPlot":  return <CaCartesianPlotWidget widget={widget} ns={ns} />;
    case "caByte":           return <CaByteWidget widget={widget} ns={ns} />;
    case "caCamera":         return <CaCameraWidget widget={widget} ns={ns} />;
    case "caInclude":        return <CaIncludeWidget widget={widget} ns={ns} />;
    default:                 return null;
  }
}

// ── main UiRenderer ───────────────────────────────────────────────────────────

interface UiRendererProps {
  file: string;                        // URL served from public/, e.g. "/ui/motorx_tiny.ui"
  macros?: Record<string, string>;     // e.g. { P: "fr:", M: "m1" }
  scale?: number;                      // 1.0 = native size; omit to auto-fit container
}

export function UiRenderer({ file, macros = {}, scale }: UiRendererProps) {
  const [ui, setUi] = useState<ParsedUi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);

  // Fetch and parse the .ui file
  useEffect(() => {
    setUi(null);
    setError(null);
    fetch(file)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(xml => setUi(parseUi(xml, macros)))
      .catch(e => setError(String(e)));
  // macros object identity changes every render; stringify to stabilize.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, JSON.stringify(macros)]);

  // Auto-scale: fit the native size into the container width
  useEffect(() => {
    if (!ui || scale !== undefined) return;
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(entries => {
      const cw = entries[0].contentRect.width;
      setAutoScale(Math.min(1, cw / ui.nativeWidth));
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [ui, scale]);

  const ns = file.replace(/\W/g, "_");  // unique namespace for useConnection IDs
  const baseDir = file.substring(0, file.lastIndexOf("/")) || "/ui";

  const [overlays, setOverlays] = useState<OpenOverlay[]>([]);
  const overlayCounter = useRef(0);

  // Right-click context menu + PV info panel
  type CtxMenuState = { x: number; y: number; channel: string; widgetName: string; widgetClass: string };
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
  const [infoPanel, setInfoPanel] = useState<{ channel: string; widgetName: string; widgetClass: string } | null>(null);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    // Walk up from target to find an element with a title (= PV channel)
    const el = (e.target as Element).closest("[title]") as HTMLElement | null;
    const channel = el?.title;
    if (!channel) return;
    const wgt = ui?.widgets.find(w => w.props["channel"] === channel);
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      channel,
      widgetName: wgt?.name ?? "",
      widgetClass: wgt?.class ?? "",
    });
  }

  function openOverlay(s: OverlayState) {
    const id = ++overlayCounter.current;
    const offset = ((id - 1) % 6) * 24;
    setOverlays(prev => [...prev, { id, state: s, initPos: { x: 120 + offset, y: 80 + offset } }]);
  }

  if (error) return <div style={{ color: "red", padding: 8 }}>Failed to load {file}: {error}</div>;
  if (!ui) return <div style={{ color: "#888", padding: 8 }}>Loading {file}…</div>;

  const s = scale ?? autoScale;

  return (
    <div ref={containerRef} style={{ display: "inline-block", position: "relative" }}>
      {/* Scaled viewport */}
      <div style={{ width: ui.nativeWidth * s, height: ui.nativeHeight * s, overflow: "hidden" }}>
        {/* Native-size canvas, scaled down */}
        <OpenContext.Provider value={openOverlay}>
          <MacrosContext.Provider value={macros}>
          <BaseDirContext.Provider value={baseDir}>
            <div
              onContextMenu={handleContextMenu}
              onClick={() => setCtxMenu(null)}
              style={{
                position: "relative",
                width: ui.nativeWidth,
                height: ui.nativeHeight,
                background: "rgb(200,200,200)",
                transform: `scale(${s})`,
                transformOrigin: "top left",
              }}
            >
              {ui.widgets.map(w => (
                <WidgetRouter key={w.name} widget={w} ns={ns} />
              ))}
            </div>
          </BaseDirContext.Provider>
          </MacrosContext.Provider>
        </OpenContext.Provider>
      </div>

      {/* Right-click context menu (portal so it escapes scale transform) */}
      {ctxMenu && createPortal(
        <div
          onMouseLeave={() => setCtxMenu(null)}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 99998,
            background: "#f0f0f0", border: "1px solid #888",
            boxShadow: "2px 2px 5px rgba(0,0,0,0.3)",
            fontFamily: "sans-serif", fontSize: 12, color: "#000",
            minWidth: 160,
          }}
        >
          <div style={{ padding: "3px 8px", background: "#4a6fa5", color: "#fff", fontWeight: 700, fontSize: 11 }}>
            {ctxMenu.channel}
          </div>
          <div
            style={{ padding: "5px 12px", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#0078d7", e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.background = "", e.currentTarget.style.color = "")}
            onClick={() => { setInfoPanel({ channel: ctxMenu.channel, widgetName: ctxMenu.widgetName, widgetClass: ctxMenu.widgetClass }); setCtxMenu(null); }}
          >
            Get info
          </div>
          <div
            style={{ padding: "5px 12px", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#0078d7", e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.background = "", e.currentTarget.style.color = "")}
            onClick={() => { navigator.clipboard?.writeText(ctxMenu.channel); setCtxMenu(null); }}
          >
            Copy PV name
          </div>
        </div>,
        document.body
      )}

      {/* PV Info panel */}
      {infoPanel && (
        <PvInfoPanel
          channel={infoPanel.channel}
          widgetName={infoPanel.widgetName}
          widgetClass={infoPanel.widgetClass}
          onClose={() => setInfoPanel(null)}
        />
      )}

      {/* Related display overlays — one OverlayPanel per open window */}
      {overlays.map(ov => (
        <OverlayPanel
          key={ov.id}
          ov={ov}
          onClose={() => setOverlays(prev => prev.filter(o => o.id !== ov.id))}
        />
      ))}
    </div>
  );
}
