// Renders a caQtDM .ui file as React components.
// Fetches the file, parses it with uiParser, then routes each widget to the
// appropriate React component. All PV connections use cs-web-lib's useConnection.

import { useState, useEffect, useRef, createContext, useContext, CSSProperties, Component } from "react";
import type { ErrorInfo } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { parseUi, ParsedWidget, ParsedUi, ParsedTab } from "./uiParser";
import { pvwsWriter } from "./pvwsWriter";

// ── contexts ──────────────────────────────────────────────────────────────────

interface OverlayState { file: string; macros: Record<string, string>; label: string; replace?: boolean }
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
  if (prec !== null) {
    // Match caQtDM: use exponential for very small or very large values,
    // fixed decimal otherwise. Threshold matches caQtDM's decimal format behavior.
    if (v !== 0 && (Math.abs(v) < 0.01 || Math.abs(v) >= 1e5))
      return v.toExponential(prec);
    return v.toFixed(prec);
  }
  // Fallback when PREC not available: exponential for large/tiny values.
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
// caQtDM visibility calcs use EPICS CALC syntax which differs from JavaScript:
//   single =  → ==    AND/OR keywords → &&/||
//   #  → !=   (not-equal)
//   built-in functions: ABS, SQR/SQRT, SIN, COS, TAN, ASIN, ACOS, ATAN,
//                       EXP, LOG (base-10), LN (natural), CEIL, FLOOR, NINT,
//                       MAX, MIN, NOT
function normalizeCalc(expr: string): string {
  return expr
    // Protect already-valid two-char operators before single-char fixups.
    .replace(/==/g, "\x00EQ\x00").replace(/!=/g, "\x00NE\x00")
    .replace(/<=/g, "\x00LE\x00").replace(/>=/g, "\x00GE\x00")
    // EPICS-specific operators
    .replace(/#/g, "!=")           // # = not-equal
    .replace(/=/g, "==")
    .replace(/\x00EQ\x00/g, "==").replace(/\x00NE\x00/g, "!=")
    .replace(/\x00LE\x00/g, "<=").replace(/\x00GE\x00/g, ">=")
    .replace(/\bAND\b/gi, "&&").replace(/\bOR\b/gi, "||")
    .replace(/\bXOR\b/gi, "^")
    // EPICS CALC built-in functions → JavaScript equivalents.
    // Multi-char names (ATAN2, SQRT, SINH…) must precede their prefixes (ATAN, SQR, SIN…).
    .replace(/\bABS\b/g,   "Math.abs")
    .replace(/\bSQRT\b/g,  "Math.sqrt")
    .replace(/\bSQR\b/g,   "Math.sqrt")
    .replace(/\bASIN\b/g,  "Math.asin")
    .replace(/\bACOS\b/g,  "Math.acos")
    .replace(/\bATAN2\b/g, "Math.atan2")
    .replace(/\bATAN\b/g,  "Math.atan")
    .replace(/\bSINH\b/g,  "Math.sinh")
    .replace(/\bCOSH\b/g,  "Math.cosh")
    .replace(/\bTANH\b/g,  "Math.tanh")
    .replace(/\bSIN\b/g,   "Math.sin")
    .replace(/\bCOS\b/g,   "Math.cos")
    .replace(/\bTAN\b/g,   "Math.tan")
    .replace(/\bEXP\b/g,   "Math.exp")
    .replace(/\bLOGE\b/g,  "Math.log")
    .replace(/\bLOG\b/g,   "Math.log10")
    .replace(/\bLN\b/g,    "Math.log")
    .replace(/\bCEIL\b/g,  "Math.ceil")
    .replace(/\bFLOOR\b/g, "Math.floor")
    .replace(/\bINT\b/g,   "Math.trunc")
    .replace(/\bNINT\b/g,  "Math.round")
    .replace(/\bMAX\b/g,   "Math.max")
    .replace(/\bMIN\b/g,   "Math.min")
    .replace(/\bNOT\b/g,   "~");
}

// Evaluate a normalised EPICS calc expression with up to 4 channel values (A–D).
function evalVisCalc(visCalc: string, a: number, b: number, c: number, d: number): boolean {
  try {
    const expr = normalizeCalc(visCalc)
      .replace(/\bA\b/g, String(a)).replace(/\bB\b/g, String(b))
      .replace(/\bC\b/g, String(c)).replace(/\bD\b/g, String(d));
    return Boolean(Function(`"use strict"; return (${expr})`)());
  } catch { return true; }
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
  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";

  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, , , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, , , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;

  let visible = true;
  if (channel) {
    if (visibility.endsWith("IfZero"))         visible = a === 0;
    else if (visibility.endsWith("IfNotZero")) visible = a !== 0;
    else if (visibility.endsWith("Calc") && visCalc) visible = evalVisCalc(visCalc, a, b, c, d);
  }

  if (!visible) return null;

  const fg = widget.props["foreground"] ?? "transparent";
  const filled = (widget.props["fillstyle"] ?? "").includes("Filled");
  const lineStyle = (widget.props["linestyle"] ?? "").includes("Dash") ? "dashed" : "solid";
  const lineSize = parseInt(widget.props["lineSize"] ?? "1");
  const lineColor = widget.props["lineColor"] ?? fg;
  const form = widget.props["form"] ?? "";
  const isCircle = form.includes("Circle") || form.includes("Ellipse");

  // caGraphics::Arrow — rendered as SVG. tiltAngle: 0=right, 90=up, 180=left, 270=down.
  // Computes arrow geometry directly so it always fits within the bounding box.
  if (form.includes("Arrow")) {
    const tiltAngle = parseInt(widget.props["tiltAngle"] ?? "0");
    const arrowSize = parseInt(widget.props["arrowSize"] ?? "10");
    const { x, y, width, height } = widget.geometry;
    const cx = width / 2, cy = height / 2;

    // Arrow direction vector in screen coords (y increases downward).
    // tiltAngle=0→right, 90→up (−y), 180→left, 270→down (+y).
    const rad = (tiltAngle * Math.PI) / 180;
    const dirX = Math.cos(rad);
    const dirY = -Math.sin(rad);

    // Maximum reach from center before hitting the bounding box edge.
    const tMax = Math.min(
      Math.abs(dirX) > 1e-6 ? Math.abs(cx / dirX) : Infinity,
      Math.abs(dirY) > 1e-6 ? Math.abs(cy / dirY) : Infinity,
    );

    // Arrowhead half-width is bounded by the perpendicular dimension.
    const perpDim = Math.abs(dirX) > 0.5 ? height : width;
    const headSize = Math.min(arrowSize, perpDim / 2);
    const headHalf = headSize / 2;

    // Key points along the arrow axis.
    const tipX   = cx + tMax * dirX,           tipY   = cy + tMax * dirY;
    const baseX  = cx + (tMax - headSize) * dirX, baseY  = cy + (tMax - headSize) * dirY;
    const startX = cx - tMax * dirX,           startY = cy - tMax * dirY;

    // Perpendicular unit vector for arrowhead spread.
    const perpX = -dirY, perpY = dirX;
    const h1x = baseX + perpX * headHalf, h1y = baseY + perpY * headHalf;
    const h2x = baseX - perpX * headHalf, h2y = baseY - perpY * headHalf;

    return (
      <svg
        style={{ position: "absolute", left: x, top: y, width, height, zIndex: widget.zIndex, overflow: "visible", pointerEvents: "none" }}
      >
        <line x1={startX} y1={startY} x2={baseX} y2={baseY} stroke={fg} strokeWidth={lineSize} />
        <polygon
          points={`${tipX},${tipY} ${h1x},${h1y} ${h2x},${h2y}`}
          fill={filled ? fg : "none"}
          stroke={fg}
          strokeWidth={lineSize}
        />
      </svg>
    );
  }

  return (
    <div
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        background: filled ? fg : "transparent",
        border: `${lineSize}px ${lineStyle} ${lineColor}`,
        boxSizing: "border-box",
        borderRadius: isCircle ? "50%" : undefined,
        pointerEvents: "none",
      }}
    />
  );
}

// ── caLineEdit — read-only PV display ─────────────────────────────────────────

function CaLineEditWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  // Precision: use the UI file's precision prop if set; fall back to the PV's PREC field.
  // caQtDM overrides with the UI file value when specified.
  const dbl = extractDouble(rawValue);
  const uiPrec = widget.props["precision"] !== undefined && widget.props["precision"] !== ""
    ? parseInt(widget.props["precision"])
    : null;
  const prec = uiPrec !== null && !isNaN(uiPrec) ? uiPrec : extractPrecision(rawValue);
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
      name={channel}
      title={channel}
      aria-label={channel}
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
  const channel  = widget.props["channel"]  ?? "";
  const label    = widget.props["label"]    ?? "BTN";
  const pressMsg = widget.props["pressMessage"] ?? "1";
  const fg = widget.props["foreground"] ?? "#fff";
  const bg = widget.props["background"] ?? "#c00";

  // Pre-subscribe so pvws has the CA channel open before the first click.
  useEffect(() => { pvwsWriter.subscribe(channel); }, [channel]);

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
        // Scale font to fit both height and width — narrow buttons need smaller text.
        fontSize: Math.min(scaledFont(widget.geometry.height), widget.geometry.width * 0.22),
        cursor: "pointer",
        padding: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
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
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";
  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, , , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, , , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;

  let visible = true;
  if (channel && visibility) {
    if (visibility.endsWith("IfZero"))         visible = a === 0;
    else if (visibility.endsWith("IfNotZero")) visible = a !== 0;
    else if (visibility.endsWith("Calc") && visCalc) visible = evalVisCalc(visCalc, a, b, c, d);
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
        pointerEvents: "none",
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

export function parseArgs(argsStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  // caQtDM uses ';' to separate macro sets; consume only the first set.
  // EPICS PV names cannot contain ';' so this is always safe.
  const firstSet = argsStr.split(";")[0] ?? "";
  for (const kv of firstSet.split(",")) {
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

  const files        = (widget.props["files"]        ?? "").split(";").filter(Boolean);
  const labels       = (widget.props["labels"]       ?? "").split(";").filter(Boolean);
  const args         = (widget.props["args"]         ?? "").split(";").filter(Boolean);
  const removeParent = (widget.props["removeParent"] ?? "").split(";");

  const items = files.map((f, i) => ({
    label: labels[i] ?? f,
    file: `${baseDir}/${f.replace(/\.adl$/, ".ui")}`,
    macros: parseArgs(args[i] ?? ""),
    replace: removeParent[i]?.trim().toLowerCase() === "true",
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
        {label}
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

// ── caShellCommand — button that runs a shell script (web: shows a notice) ───

function CaShellCommandWidget({ widget, ns: _ns }: { widget: ParsedWidget; ns: string }) {
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [pressed, setPressed] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const label = (widget.props["label"] ?? "CMD").replace(/^-/, "");
  const fg = widget.props["foreground"] ?? "#000";
  const bg = widget.props["background"] ?? "#c8c864";

  const files  = (widget.props["files"]  ?? "").split(";").map(s => s.trim()).filter(Boolean);
  const labels = (widget.props["labels"] ?? "").split(";").map(s => s.trim()).filter(Boolean);
  const args   = (widget.props["args"]   ?? "").split(";").map(s => s.trim());

  const items = files.map((f, i) => ({
    label: labels[i] ?? f,
    file: f,
    args: args[i] ?? "",
  }));

  if (items.length === 0) return null;

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

  function handleItem(item: { file: string; args: string }) {
    setMenuPos(null);
    alert(`Shell command (cannot run in browser):\n${item.file}${item.args ? " " + item.args : ""}`);
  }

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    setMenuPos(r ? { top: r.bottom + 2, left: r.left } : null);
  }

  if (items.length === 1) {
    return (
      <button ref={btnRef} onClick={() => handleItem(items[0])} style={btnStyle} {...bevelHandlers}
        title={`Shell: ${items[0].file}${items[0].args ? " " + items[0].args : ""}`}>
        {label}
      </button>
    );
  }

  return (
    <>
      <button ref={btnRef} onClick={openMenu} style={btnStyle} {...bevelHandlers}
        title="Shell commands (cannot run in browser)">
        {label}
      </button>
      {menuPos && createPortal(
        <>
          <div onClick={() => setMenuPos(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div style={{
            position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999,
            background: "#fff", border: "1px solid #999", borderRadius: 2,
            minWidth: 140, boxShadow: "2px 2px 6px rgba(0,0,0,0.3)",
          }}>
            {items.map((item, i) => (
              <div key={i} onClick={() => handleItem(item)}
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
      name={channel}
      title={channel}
      aria-label={channel}
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
          aria-label="Display minimum"
          readOnly={autoLevels}
          onChange={e => { setAutoLevels(false); setManMin(Number(e.target.value)); }} />
        <span>Max:</span>
        <input style={inputStyle} type="number" value={autoLevels ? frameMinMax[1] : manMax}
          aria-label="Display maximum"
          readOnly={autoLevels}
          onChange={e => { setAutoLevels(false); setManMax(Number(e.target.value)); }} />
        <span>Auto:</span>
        <input type="checkbox" checked={autoLevels} onChange={e => setAutoLevels(e.target.checked)}
          aria-label="Auto levels" />
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
            aria-label="Zoom"
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

function CaPolyLineWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";

  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, , , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, , , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;

  let visible = true;
  if (channel && visibility) {
    if (visibility.endsWith("IfZero"))         visible = a === 0;
    else if (visibility.endsWith("IfNotZero")) visible = a !== 0;
    else if (visibility.endsWith("Calc") && visCalc) visible = evalVisCalc(visCalc, a, b, c, d);
  }
  if (!visible) return null;

  const xyPairs = widget.props["xyPairs"] ?? "";
  const fg = widget.props["foreground"] ?? "#00f";
  const lineColor = widget.props["lineColor"] ?? fg;
  const lineSize = parseInt(widget.props["lineSize"] ?? "1");
  const filled = (widget.props["fillstyle"] ?? "").includes("Filled");
  const ls = widget.props["linestyle"] ?? "";
  const dashArray = ls.includes("BigDash") ? "12,6" : ls.includes("Dash") ? "6,4" : ls.includes("Dot") ? "2,4" : undefined;
  const { x, y, width, height } = widget.geometry;

  // Parse "x1,y1;x2,y2;..." relative to widget origin.
  // Sentinel value near INT_MIN means the point auto-fits to geometry — skip those.
  const SENTINEL = -2147483640;
  const rawPoints = xyPairs.split(";").filter(Boolean).map(pair => {
    const [px, py] = pair.split(",").map(Number);
    return { px, py };
  }).filter(p => p.px > SENTINEL && p.py > SENTINEL);

  const points = rawPoints.map(p => `${p.px},${p.py}`).join(" ");

  return (
    <svg
      style={{ position: "absolute", left: x, top: y, width, height, zIndex: widget.zIndex, overflow: "visible", pointerEvents: "none" }}
    >
      {filled
        ? <polygon points={points} fill={fg} stroke={lineColor} strokeWidth={lineSize} strokeDasharray={dashArray} />
        : <polyline points={points} fill="none" stroke={lineColor} strokeWidth={lineSize} strokeDasharray={dashArray} />
      }
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
  const axisRef   = useRef({ xMin: 0, xMax: 1, yMin: 0, yMax: 1, ml: 44, mt: 8, pw: 1, ph: 1 });
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const title      = widget.props["Title"]      ?? "";
  const titleX     = widget.props["TitleX"]     ?? "";
  const titleY     = widget.props["TitleY"]     ?? "";
  const bg         = widget.props["background"] ?? "rgb(115,223,255)";
  const scaleColor = widget.props["scaleColor"] ?? "black";
  const fgColor    = widget.props["foreground"] ?? "black";

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

    // Axis limits — from data if available, else from widget props, else 0–1
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
    if (!isFinite(xMin)) {
      const lim = (widget.props["XaxisLimits"] ?? "0;1").split(";");
      xMin = parseFloat(lim[0]) || 0; xMax = parseFloat(lim[1]) || 1;
    }
    if (!isFinite(yMin)) {
      const lim = (widget.props["YaxisLimits"] ?? "0;1").split(";");
      yMin = parseFloat(lim[0]) || 0; yMax = parseFloat(lim[1]) || 1;
    }
    if (xMin === xMax) { xMin -= 0.5; xMax += 0.5; }
    if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }

    const toCanvasX = (x: number) => ml + (x - xMin) / (xMax - xMin) * pw;
    const toCanvasY = (y: number) => mt + ph - (y - yMin) / (yMax - yMin) * ph;

    const fmtTick = (v: number) => {
      if (Math.abs(v) >= 10000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
      const s = v.toPrecision(3);
      return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
    };

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgb(187,187,187)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(ml, mt, pw, ph);

    // Grid (dashed, using scaleColor)
    const NTICKS = 4;
    ctx.strokeStyle = scaleColor;
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
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(ml, mt, pw, ph);

    // Tick labels
    ctx.fillStyle = scaleColor;
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
      ctx.fillStyle = scaleColor; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(title, W / 2, 14);
    }
    // X label
    if (titleX) {
      ctx.fillStyle = scaleColor; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(titleX, ml + pw / 2, H - 5);
    }
    // Y label (rotated)
    if (titleY) {
      ctx.save();
      ctx.translate(10, mt + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = scaleColor; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(titleY, 0, 0);
      ctx.restore();
    }

    // Always update axis ref so mouse handler has correct bounds
    axisRef.current = { xMin, xMax, yMin, yMax, ml, mt, pw, ph };

    // Draw cursor position label (top-left of plot area) — drawn always, even with no data
    {
      const cur = cursorRef.current;
      if (cur) {
        const label = `x:${fmtTick(cur.x)}  y:${fmtTick(cur.y)}`;
        ctx.font = "10px monospace";
        const tw = ctx.measureText(label).width;
        const cx = ml + 6, cy = mt + 14;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(cx - 2, cy - 12, tw + 6, 15);
        ctx.fillStyle = scaleColor;
        ctx.textAlign = "left";
        ctx.fillText(label, cx + 1, cy);
      }
    }

    if (curves.length === 0) return;

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
          const cpx = toCanvasX(c.xs ? c.xs[i] : i);
          const cpy = toCanvasY(y);
          if (!started) { ctx.moveTo(cpx, cpy); started = true; }
          else ctx.lineTo(cpx, cpy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  const { x, y, width, height } = widget.geometry;

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (width / rect.width);
    const py = (e.clientY - rect.top)  * (height / rect.height);
    const { xMin, xMax, yMin, yMax, ml, mt, pw, ph } = axisRef.current;
    if (px < ml || px > ml + pw || py < mt || py > mt + ph) {
      cursorRef.current = null; setCursor(null); return;
    }
    const c = { x: xMin + (px - ml) / pw * (xMax - xMin), y: yMax - (py - mt) / ph * (yMax - yMin) };
    cursorRef.current = c;
    setCursor(c);
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: "absolute", left: x, top: y, width, height, zIndex: widget.zIndex }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { cursorRef.current = null; setCursor(null); }}
    />
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
        <span style={{ fontWeight: 700, fontFamily: "sans-serif" }}>PV Info</span>
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

// ── caImage — static image file ──────────────────────────────────────────────

function CaImageWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const baseDir  = useContext(BaseDirContext);
  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";

  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, , , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, , , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;

  let visible = true;
  if (channel && visibility) {
    if (visibility.endsWith("IfZero"))         visible = a === 0;
    else if (visibility.endsWith("IfNotZero")) visible = a !== 0;
    else if (visibility.endsWith("Calc") && visCalc) visible = evalVisCalc(visCalc, a, b, c, d);
  }
  if (!visible) return null;

  const filename = widget.props["filename"] ?? "";
  if (!filename) return null;
  const src = filename.startsWith("/") ? filename : `${baseDir}/${filename}`;
  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), overflow: "hidden" }}>
      <img src={src} alt={filename} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    </div>
  );
}

// ── QTabWidget ────────────────────────────────────────────────────────────────

const TAB_BAR_H = 26; // approximate Qt tab bar height in pixels

function QTabWidgetComponent({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const defaultTab = parseInt(widget.props["currentIndex"] ?? "0") || 0;
  const [activeTab, setActiveTab] = useState(defaultTab);
  const tabs = widget.tabs ?? [];
  const { width, height } = widget.geometry;
  const contentH = height - TAB_BAR_H;

  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), overflow: "hidden", background: "#dededf" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", height: TAB_BAR_H, alignItems: "flex-end", background: "#c8c8c8", borderBottom: "1px solid #808080" }}>
        {tabs.map((tab, i) => (
          <div
            key={i}
            onClick={() => setActiveTab(i)}
            style={{
              padding: "2px 10px 1px",
              background: activeTab === i ? "#dededf" : "#b8b8b8",
              border: "1px solid #808080",
              borderBottom: activeTab === i ? "1px solid #dededf" : "1px solid #808080",
              marginRight: 2,
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "Liberation Sans, Arial, sans-serif",
              userSelect: "none",
              color: "#000",
              whiteSpace: "nowrap",
            }}
          >
            {tab.title}
          </div>
        ))}
      </div>
      {/* Tab content — children are positioned relative to this div */}
      <div style={{ position: "relative", width, height: contentH, overflow: "hidden" }}>
        {tabs[activeTab]?.widgets.map(w => (
          <WidgetErrorBoundary key={w.name} name={w.name}><WidgetRouter widget={w} ns={`${ns}_tab${activeTab}`} /></WidgetErrorBoundary>
        ))}
      </div>
    </div>
  );
}

// ── caInclude — embeds another .ui file inline ────────────────────────────────

// Single instance of an included UI file — used by CaIncludeWidget for both
// normal and stacked (numberOfItems > 1) caInclude widgets.
function CaIncludeSingle({
  file, macros, ns, width, height, subBaseDir,
}: {
  file: string; macros: Record<string, string>; ns: string;
  width: number; height: number; subBaseDir: string;
}) {
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

  if (error)  return <div style={{ width, height, flexShrink: 0, color: "red",  fontSize: 9 }}>{error}</div>;
  if (!subUi) return <div style={{ width, height, flexShrink: 0, color: "#888", fontSize: 9 }}>…</div>;

  const s = Math.min(width / subUi.nativeWidth, height / subUi.nativeHeight);
  return (
    <div style={{ width, height, flexShrink: 0, overflow: "hidden", position: "relative" }}>
      <BaseDirContext.Provider value={subBaseDir}>
        <MacrosContext.Provider value={macros}>
          <div style={{ width: subUi.nativeWidth, height: subUi.nativeHeight, transform: `scale(${s})`, transformOrigin: "top left", position: "relative" }}>
            {subUi.widgets.map(w => <WidgetErrorBoundary key={w.name} name={w.name}><WidgetRouter widget={w} ns={ns} /></WidgetErrorBoundary>)}
          </div>
        </MacrosContext.Provider>
      </BaseDirContext.Provider>
    </div>
  );
}

// ── caFrame ───────────────────────────────────────────────────────────────────
// Container widget that groups children and supports visibility.

function CaFrameWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, , , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, , , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");
  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";
  let visible = true;
  if (channel && visibility) {
    if      (visibility.endsWith("IfNotZero"))  visible = a !== 0;
    else if (visibility.endsWith("IfZero"))     visible = a === 0;
    else if (visibility.endsWith("Calc") && visCalc) visible = evalVisCalc(visCalc, a, b, c, d);
  }
  if (!visible) return null;

  const children = widget.children ?? [];
  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), overflow: "hidden" }}>
      {children.map(w => (
        <WidgetErrorBoundary key={w.name} name={w.name}>
          <WidgetRouter widget={w} ns={`${ns}_frame`} />
        </WidgetErrorBoundary>
      ))}
    </div>
  );
}

// ── caInclude ─────────────────────────────────────────────────────────────────

function CaIncludeWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const baseDir = useContext(BaseDirContext);
  const parentMacros = useContext(MacrosContext);

  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const [, , , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, , , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, , , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, , , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");
  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;
  const visibility = widget.props["visibility"] ?? "";
  const visCalc    = widget.props["visibilityCalc"] ?? "";
  let visible = true;
  if (channel && visibility) {
    if      (visibility.endsWith("IfNotZero"))  visible = a !== 0;
    else if (visibility.endsWith("IfZero"))     visible = a === 0;
    else if (visibility.endsWith("Calc") && visCalc) visible = evalVisCalc(visCalc, a, b, c, d);
  }
  if (!visible) return null;

  const filename = widget.props["filename"] ?? "";
  const macroStr = widget.props["macro"] ?? "";
  const stacking  = widget.props["stacking"] ?? "";
  const n = parseInt(widget.props["numberOfItems"] ?? "1") || 1;

  const file = filename ? `${baseDir}/${filename.replace(/\.adl$/, ".ui")}` : "";
  const subBaseDir = file.substring(0, file.lastIndexOf("/")) || "/ui";
  const { width, height } = widget.geometry;
  const containerStyle = { ...geoStyle(widget.geometry, widget.zIndex), overflow: "hidden" as const };

  if (!file) return null;

  // Stacked: render N copies side-by-side (Column) or top-to-bottom (Row),
  // each with its own macro set from the semicolon-separated macro string.
  // caQtDM defaults to Row stacking when numberOfItems > 1 and no explicit
  // stacking property is set — treat absence as Row.
  const isColumn = stacking.includes("Column");
  const isRow    = stacking.includes("Row") || (n > 1 && !isColumn);
  if (n > 1 && (isColumn || isRow)) {
    const macroSets = macroStr.split(";").filter(Boolean).map(s => parseArgs(s));
    const itemW = isColumn ? Math.floor(width / n) : width;
    const itemH = isRow    ? Math.floor(height / n) : height;
    return (
      <div style={{ ...containerStyle, display: "flex", flexDirection: isColumn ? "row" : "column", alignItems: "flex-start" }}>
        {Array.from({ length: n }, (_, i) => {
          const extra = macroSets[i] ?? macroSets[macroSets.length - 1] ?? {};
          const macros = { ...parentMacros, ...extra };
          return <CaIncludeSingle key={i} file={file} macros={macros} ns={`${ns}_${widget.name}_${i}`} width={itemW} height={itemH} subBaseDir={subBaseDir} />;
        })}
      </div>
    );
  }

  // Single instance
  const macros = { ...parentMacros, ...parseArgs(macroStr) };
  return (
    <div style={containerStyle}>
      <CaIncludeSingle file={file} macros={macros} ns={`${ns}_${widget.name}`} width={width} height={height} subBaseDir={subBaseDir} />
    </div>
  );
}

// ── caLed ─────────────────────────────────────────────────────────────────────

function CaLedWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const pv = widget.props["channel"] ?? "";
  const [, connected, , raw] = useConnection(`${ns}-${widget.name}`, `ca://${pv}`);
  const val = extractDouble(raw);
  const alarm = extractAlarmQuality(raw);
  const on = connected && val !== null && val !== 0;
  // Alarm overrides value-based color (matches caQtDM alarm-sensitive behavior)
  const trueColor  = widget.props["trueColor"]  ?? "#f44336"; // red (caQtDM default)
  const falseColor = widget.props["falseColor"] ?? "#666";    // grey
  const color = !connected   ? "#444"
              : alarm === "alarm"   ? "#f44336"
              : alarm === "warning" ? "#ff9800"
              : on ? trueColor : falseColor;
  const size = Math.min(widget.geometry.width, widget.geometry.height);
  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: size - 4, height: size - 4, borderRadius: "50%", background: color, boxShadow: on ? `0 0 6px ${color}` : "none", border: "1px solid #333" }} />
    </div>
  );
}

// ── caThermo ──────────────────────────────────────────────────────────────────

function CaThermoWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const pv = widget.props["channel"] ?? "";
  const basePv = pv.replace(/\.[A-Za-z_]+$/, "");
  const limitsMode = widget.props["limitsMode"] ?? "";
  const useChannelLimits = limitsMode.includes("Channel");

  const [, connected, , raw]  = useConnection(`${ns}-${widget.name}`,      `ca://${pv}`);
  const [,,,loprRaw]          = useConnection(`${ns}-${widget.name}-lopr`, useChannelLimits ? `ca://${basePv}.LOPR` : "ca://");
  const [,,,hoprRaw]          = useConnection(`${ns}-${widget.name}-hopr`, useChannelLimits ? `ca://${basePv}.HOPR` : "ca://");

  const uiMin = parseFloat(widget.props["minValue"] ?? "0");
  const uiMax = parseFloat(widget.props["maxValue"] ?? "100");
  const lopr = extractDouble(loprRaw);
  const hopr = extractDouble(hoprRaw);
  const minVal = (useChannelLimits && lopr !== null && hopr !== null && lopr !== hopr) ? lopr : uiMin;
  const maxVal = (useChannelLimits && lopr !== null && hopr !== null && lopr !== hopr) ? hopr : uiMax;

  const val = extractDouble(raw) ?? minVal;
  const frac = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
  const { width, height } = widget.geometry;

  const direction  = widget.props["direction"]  ?? "";
  const look       = widget.props["look"]       ?? "";
  const fillColor  = widget.props["foreground"] ?? "#29b6f6";
  const emptyColor = widget.props["background"] ?? "#0a1828";
  const noDeco     = look.includes("noDeco");

  // Determine orientation from the direction prop; fall back to aspect ratio.
  const isHoriz  = direction.includes("Right") || direction.includes("Left")
                || (!direction && width >= height);
  const fromRight = direction.includes("Left");
  const fromTop   = direction.includes("Down");

  const fillStyle: CSSProperties = isHoriz ? {
    position: "absolute", top: 0, bottom: 0,
    ...(fromRight ? { right: 0 } : { left: 0 }),
    width: `${frac * 100}%`,
    background: connected ? fillColor : emptyColor,
    transition: "width 0.3s",
  } : {
    position: "absolute", left: 0, right: 0,
    ...(fromTop ? { top: 0 } : { bottom: 0 }),
    height: `${frac * 100}%`,
    background: connected ? fillColor : emptyColor,
    transition: "height 0.3s",
  };

  return (
    <div style={{
      ...geoStyle(widget.geometry, widget.zIndex),
      background: emptyColor,
      border: noDeco ? "none" : "1px solid #1e3a5f",
      borderRadius: noDeco ? 0 : 2,
      overflow: "hidden",
    }}>
      <div style={fillStyle} />
    </div>
  );
}

// ── caSpinbox ─────────────────────────────────────────────────────────────────

function CaSpinboxWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const pv = widget.props["channel"] ?? "";
  const [, connected, , raw] = useConnection(`${ns}-${widget.name}`, `ca://${pv}`);
  const val = extractDouble(raw);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  function commit() {
    const n = parseFloat(input);
    if (!isNaN(n)) pvwsWriter.write(pv, n);
    setEditing(false);
    setInput("");
  }

  const display = connected && val !== null ? val.toFixed(4) : "—";
  const step = parseFloat(widget.props["stepSize"] ?? "1");

  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), display: "flex", alignItems: "center", border: "1px solid #4a90d9", borderRadius: 3, background: "#1e2a3a", overflow: "hidden" }}>
      {editing ? (
        <input autoFocus value={input} onChange={e => setInput(e.target.value)}
          name={pv} aria-label={pv}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setInput(""); } }}
          onBlur={() => { setEditing(false); setInput(""); }}
          style={{ flex: 1, background: "none", border: "none", color: "#fff", fontFamily: "monospace", fontSize: 12, padding: "0 4px", outline: "none" }} />
      ) : (
        <span onClick={() => { setEditing(true); setInput(display === "—" ? "" : display); }}
          style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: "#90caf9", padding: "0 4px", cursor: "text" }}>{display}</span>
      )}
      <div style={{ display: "flex", flexDirection: "column", borderLeft: "1px solid #2a4a6a" }}>
        <button onClick={() => { if (val !== null) pvwsWriter.write(pv, val + step); }}
          disabled={!connected}
          style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 9, padding: "1px 4px", lineHeight: 1 }}>▲</button>
        <button onClick={() => { if (val !== null) pvwsWriter.write(pv, val - step); }}
          disabled={!connected}
          style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 9, padding: "1px 4px", lineHeight: 1 }}>▼</button>
      </div>
    </div>
  );
}

// ── caSlider ──────────────────────────────────────────────────────────────────

function CaSliderWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const pv = widget.props["channel"] ?? "";
  // Strip field suffix to get base record (e.g. "fr:m2.VAL" → "fr:m2")
  const basePv = pv.replace(/\.[A-Za-z_]+$/, "");
  const [, connected, , raw]  = useConnection(`${ns}-${widget.name}`,      `ca://${pv}`);
  const [,,, loprRaw]         = useConnection(`${ns}-${widget.name}-lopr`, `ca://${basePv}.LOPR`);
  const [,,, hoprRaw]         = useConnection(`${ns}-${widget.name}-hopr`, `ca://${basePv}.HOPR`);
  const [,,, dllmRaw]         = useConnection(`${ns}-${widget.name}-dllm`, `ca://${basePv}.DLLM`);
  const [,,, dhlmRaw]         = useConnection(`${ns}-${widget.name}-dhlm`, `ca://${basePv}.DHLM`);
  // Priority: LOPR/HOPR (general) → DLLM/DHLM (motor) → .ui minValue/maxValue → 0/100
  // Only use a limit pair if they form a non-zero range (LOPR=HOPR=0 means "not configured")
  const lopr = extractDouble(loprRaw), hopr = extractDouble(hoprRaw);
  const dllm = extractDouble(dllmRaw), dhlm = extractDouble(dhlmRaw);
  const uiMin = parseFloat(widget.props["minValue"] ?? "0");
  const uiMax = parseFloat(widget.props["maxValue"] ?? "100");
  const minVal = (lopr !== null && hopr !== null && lopr !== hopr) ? lopr
               : (dllm !== null && dhlm !== null && dllm !== dhlm) ? dllm
               : uiMin;
  const maxVal = (lopr !== null && hopr !== null && lopr !== hopr) ? hopr
               : (dllm !== null && dhlm !== null && dllm !== dhlm) ? dhlm
               : uiMax;
  const val = extractDouble(raw) ?? minVal;
  const orientation = widget.props["orientation"] ?? "";
  const vertical = orientation ? orientation.includes("Vertical") : widget.geometry.height > widget.geometry.width;
  return (
    <div style={geoStyle(widget.geometry, widget.zIndex)}>
      <input type="range" min={minVal} max={maxVal} step={(maxVal - minVal) / 100}
        name={pv} aria-label={pv}
        value={connected && val !== null ? val : minVal}
        disabled={!connected}
        onChange={e => pvwsWriter.write(pv, parseFloat(e.target.value))}
        style={{
          width: vertical ? widget.geometry.height : "100%",
          height: vertical ? widget.geometry.width : "100%",
          transform: vertical ? `rotate(-90deg) translateX(-${widget.geometry.height}px)` : "none",
          transformOrigin: vertical ? "top left" : undefined,
          cursor: connected ? "pointer" : "default",
          accentColor: "#4a90d9",
        }} />
    </div>
  );
}

// ── caToggleButton ────────────────────────────────────────────────────────────

function CaToggleButtonWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const pv = widget.props["channel"] ?? "";
  const label = widget.props["text"] ?? "";
  const fg = widget.props["foreground"] ?? "rgb(0,0,0)";
  const [, connected, , raw] = useConnection(`${ns}-${widget.name}`, `ca://${pv}`);
  const val = extractDouble(raw);
  const checked = connected && val !== null && val !== 0;
  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), display: "flex", alignItems: "center", gap: 6 }}>
      <input type="checkbox" checked={checked} disabled={!connected}
        name={pv} aria-label={label || pv}
        onChange={e => pvwsWriter.write(pv, e.target.checked ? 1 : 0)}
        style={{ accentColor: "#4a90d9", width: 14, height: 14, cursor: connected ? "pointer" : "default" }} />
      <span style={{ color: fg, fontSize: scaledFont(widget.geometry.height), fontFamily: "sans-serif" }}>{label}</span>
    </div>
  );
}

// ── caTable ───────────────────────────────────────────────────────────────────

const CA_TABLE_MAX = 16;

function CaTableRow({ pv, ns, idx }: { pv: string; ns: string; idx: number }) {
  const [, connected, , raw] = useConnection(`${ns}-table-${idx}`, `ca://${pv}`);
  const val = extractDouble(raw);
  const units = (raw as { display?: { units?: string } } | null)?.display?.units ?? "";
  const display = connected && val !== null ? val.toFixed(4) : "—";
  const td: React.CSSProperties = { padding: "2px 6px", fontFamily: "monospace", fontSize: 11, borderBottom: "1px solid #1e3a5f", whiteSpace: "nowrap" };
  return (
    <tr>
      <td style={{ ...td, color: "#90caf9" }}>{pv}</td>
      <td style={{ ...td, color: connected ? "#cce0ff" : "#555", textAlign: "right" }}>{display}</td>
      <td style={{ ...td, color: "#7a9ab8" }}>{units}</td>
    </tr>
  );
}

function CaTableWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const pvList = (widget.props["channels"] ?? "").split(";").map(s => s.trim()).filter(Boolean).slice(0, CA_TABLE_MAX);
  const padded = [...pvList, ...Array(CA_TABLE_MAX - pvList.length).fill("")];
  return (
    <div style={{ ...geoStyle(widget.geometry, widget.zIndex), overflow: "auto", background: "#0a1828", border: "1px solid #1e3a5f", borderRadius: 3 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {padded.map((pv, i) => pv ? <CaTableRow key={i} pv={pv} ns={ns} idx={i} /> : null)}
        </tbody>
      </table>
    </div>
  );
}

// ── caStripPlot ───────────────────────────────────────────────────────────────
// Channels: semicolon-separated PV names or macros expanding to PV names.
// Up to 4 active channels (unresolved macros are skipped).
// period + units drive the time window; absolute timestamps on x-axis.

const STRIP_COLOR_LIST = ["#ef5350", "#66bb6a", "#ffd740", "#26c6da", "#ce93d8", "#ffa726"];

function CaStripPlotWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const rawChannels = widget.props["channels"] ?? "";

  // Each entry may be "LETTER=pvName" (color hint) or just "pvName".
  // Skip entries where the PV is still an unresolved macro "$(…)".
  // Keep the original slot index so we can look up color_N from the UI file.
  const allEntries = rawChannels.split(";").map((s, slotIdx) => {
    const eq = s.indexOf("=");
    const pv = eq >= 0 ? s.slice(eq + 1).trim() : s.trim();
    return { pv, slotIdx };
  });
  const entries = allEntries.filter(e => e.pv && !e.pv.includes("$(")).slice(0, 4);
  const pvs = entries.map(e => e.pv);
  // color_N (1-indexed) is defined in the UI file per slot; fall back to built-in palette.
  const colors = entries.map((e, i) =>
    widget.props[`color_${e.slotIdx + 1}`] ?? STRIP_COLOR_LIST[i % STRIP_COLOR_LIST.length]
  );

  // Time window: period × unit multiplier
  const unitsStr = widget.props["units"] ?? "";
  const unitMs = unitsStr.includes("Hour") ? 3_600_000
               : unitsStr.includes("Minute") ? 60_000
               : 1_000;                         // default: seconds
  const periodNum = parseFloat(widget.props["period"] ?? "60") || 60;
  const totalMs = periodNum * unitMs;

  // Timestamped history per channel — store {t: epoch-ms, v: number}
  type Pt = { t: number; v: number };
  const historyRef = useRef<Pt[][]>([[], [], [], []]);
  const latestRef  = useRef<(number | null)[]>([null, null, null, null]);
  const [, forceRender] = useState(0);

  // Fixed 4 hook calls. Pass `undefined` (not "") for missing pvs so cs-web-lib
  // skips the subscription instead of trying to connect to an empty PV name.
  const [,,, raw0] = useConnection(`${ns}-strip-${widget.name}-0`, pvs[0] ? `ca://${pvs[0]}` : undefined);
  const [,,, raw1] = useConnection(`${ns}-strip-${widget.name}-1`, pvs[1] ? `ca://${pvs[1]}` : undefined);
  const [,,, raw2] = useConnection(`${ns}-strip-${widget.name}-2`, pvs[2] ? `ca://${pvs[2]}` : undefined);
  const [,,, raw3] = useConnection(`${ns}-strip-${widget.name}-3`, pvs[3] ? `ca://${pvs[3]}` : undefined);

  // Keep latest numeric values in ref so the interval can sample them
  useEffect(() => { latestRef.current[0] = extractDouble(raw0); }, [raw0]);
  useEffect(() => { latestRef.current[1] = extractDouble(raw1); }, [raw1]);
  useEffect(() => { latestRef.current[2] = extractDouble(raw2); }, [raw2]);
  useEffect(() => { latestRef.current[3] = extractDouble(raw3); }, [raw3]);

  // Periodic sampler: record one timestamped point per channel at a rate
  // that gives ≤600 points across the full window, minimum 1 s.
  const sampleMs = Math.max(1000, Math.round(totalMs / 600));
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      latestRef.current.forEach((v, i) => {
        if (i >= pvs.length || v === null || isNaN(v)) return;
        historyRef.current[i] = [
          ...historyRef.current[i].filter(p => now - p.t <= totalMs),
          { t: now, v },
        ];
      });
      forceRender(n => n + 1);
    }, sampleMs);
    return () => clearInterval(id);
  // pvs.length and totalMs are derived from stable widget props
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleMs]);

  const now = Date.now();
  const startT = now - totalMs;

  const PAD_L = 54, PAD_R = 8, PAD_T = 8, PAD_B = 36, LEG_H = entries.length > 0 ? 18 : 0;
  const W = widget.geometry.width;
  const H = widget.geometry.height - LEG_H;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  // Clip histories to visible window
  const histories = historyRef.current.slice(0, 4).map((pts, i) =>
    i < entries.length ? pts.filter(p => p.t >= startT) : []
  );

  // Y range across all active channels
  const allVals = histories.flat().map(p => p.v).filter(v => !isNaN(v));
  const minV = allVals.length ? Math.min(...allVals) : 0;
  const maxVraw = allVals.length ? Math.max(...allVals) : 1;
  const maxV = maxVraw === minV ? minV + 1 : maxVraw;
  const range = maxV - minV;

  const toSvgX = (t: number) => PAD_L + ((t - startT) / totalMs) * plotW;
  const toSvgY = (v: number) => PAD_T + plotH - ((v - minV) / range) * plotH;

  // Y ticks
  const N_Y = 5;
  const yTicks = Array.from({ length: N_Y + 1 }, (_, i) => minV + (i / N_Y) * range);

  function fmtY(v: number): string {
    if (v === 0) return "0";
    const abs = Math.abs(v);
    if (abs >= 1e4 || abs < 0.01) return v.toExponential(1);
    return v.toPrecision(3).replace(/\.?0+$/, "");
  }

  // X ticks — absolute timestamps
  const N_X = 5;
  const xTicks = Array.from({ length: N_X + 1 }, (_, i) => startT + (i / N_X) * totalMs);

  function fmtX(t: number): string {
    const d = new Date(t);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    if (unitMs >= 60_000) return `${hh}:${mm}`;
    const ss = d.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  return (
    <div style={geoStyle(widget.geometry, widget.zIndex)}>
      <svg width={W} height={H + LEG_H} style={{ display: "block", background: "#0a1828", border: "1px solid #1e3a5f" }}>
        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const sy = toSvgY(v);
          return <line key={`gy${i}`} x1={PAD_L} y1={sy} x2={W - PAD_R} y2={sy} stroke="#1e3a5f" strokeWidth={1} />;
        })}
        {xTicks.map((t, i) => {
          const sx = toSvgX(t);
          return <line key={`gx${i}`} x1={sx} y1={PAD_T} x2={sx} y2={PAD_T + plotH} stroke="#1e3a5f" strokeWidth={1} />;
        })}

        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} stroke="#4a6a8a" strokeWidth={1} />
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="#4a6a8a" strokeWidth={1} />

        {/* Y ticks + labels */}
        {yTicks.map((v, i) => {
          const sy = toSvgY(v);
          return (
            <g key={`yt${i}`}>
              <line x1={PAD_L - 4} y1={sy} x2={PAD_L} y2={sy} stroke="#4a6a8a" strokeWidth={1} />
              <text x={PAD_L - 6} y={sy + 4} textAnchor="end" fill="#90a4ae" fontSize={9}>{fmtY(v)}</text>
            </g>
          );
        })}

        {/* X ticks + labels */}
        {xTicks.map((t, i) => {
          const sx = toSvgX(t);
          return (
            <g key={`xt${i}`}>
              <line x1={sx} y1={PAD_T + plotH} x2={sx} y2={PAD_T + plotH + 4} stroke="#4a6a8a" strokeWidth={1} />
              <text x={sx} y={PAD_T + plotH + 14} textAnchor="middle" fill="#90a4ae" fontSize={9}>{fmtX(t)}</text>
            </g>
          );
        })}

        {/* Traces */}
        {histories.map((pts, ci) => {
          if (ci >= entries.length || pts.length === 0) return null;
          if (pts.length === 1) {
            // Single point — draw a dot until the second sample arrives
            return <circle key={`tr${ci}`} cx={toSvgX(pts[0].t)} cy={toSvgY(pts[0].v)} r={3} fill={colors[ci]} />;
          }
          const d = pts.map(({ t, v }, idx) =>
            `${idx === 0 ? "M" : "L"}${toSvgX(t).toFixed(1)},${toSvgY(v).toFixed(1)}`
          ).join(" ");
          return <path key={`tr${ci}`} d={d} fill="none" stroke={colors[ci]} strokeWidth={1.5} />;
        })}

        {/* Legend */}
        {entries.map((e, i) => (
          <g key={`lg${i}`} transform={`translate(${PAD_L + i * 110}, ${H + 2})`}>
            <line x1={0} y1={8} x2={18} y2={8} stroke={colors[i]} strokeWidth={2} />
            <text x={22} y={12} fill="#90a4ae" fontSize={10}>{(() => { const p = e.pv.split(":"); return p.length >= 3 ? p.slice(-2).join(":") : e.pv; })()}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── widget router ─────────────────────────────────────────────────────────────

// ── Error boundary — catches render errors in individual widgets ───────────────
// Prevents a single bad widget (e.g. unexpected PV data after IOC restart) from
// crashing the entire React tree and showing a white page.

class WidgetErrorBoundary extends Component<
  { children: React.ReactNode; name: string },
  { error: boolean }
> {
  constructor(props: { children: React.ReactNode; name: string }) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error("[WidgetErrorBoundary]", this.props.name, e, info);
  }
  // Reset when the widget name changes (e.g. after a remount)
  componentDidUpdate(prev: { name: string }) {
    if (prev.name !== this.props.name && this.state.error)
      this.setState({ error: false });
  }
  render() {
    if (this.state.error)
      return <div title={`Render error: ${this.props.name}`} style={{ position: "absolute", width: 8, height: 8, borderRadius: "50%", background: "red", opacity: 0.7 }} />;
    return this.props.children;
  }
}

// ── QGroupBox — bordered container with a title label ─────────────────────────
// Uses <fieldset>+<legend> so the browser natively handles the title cutting into
// the top border. Children are absolutely positioned relative to the group box
// top-left corner, matching Qt's coordinate system.

function QGroupBoxWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const title = widget.props["title"] ?? "";
  const { x, y, width, height } = widget.geometry;
  return (
    <fieldset
      style={{
        position: "absolute",
        left: x, top: y, width, height,
        zIndex: widget.zIndex,
        border: "1px solid #aaa",
        borderRadius: 3,
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      {title && (
        <legend style={{
          marginLeft: 6,
          padding: "0 4px",
          fontSize: 11,
          fontFamily: "sans-serif",
          color: "#000",
          fontWeight: "normal",
          lineHeight: "14px",
        }}>
          {title}
        </legend>
      )}
      {widget.children?.map(w => (
        <WidgetErrorBoundary key={w.name} name={w.name}>
          <WidgetRouter widget={w} ns={ns} />
        </WidgetErrorBoundary>
      ))}
    </fieldset>
  );
}

// ── caWaveTable — displays a waveform PV as a read-only grid ─────────────────
// Each cell shows one element of the array PV, formatted with `precision`.
// numberOfRows × numberOfColumns cells total; cells laid out left→right, top→bottom.

function CaWaveTableWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel = widget.props["channel"] ?? "";
  const nRows   = Math.max(1, parseInt(widget.props["numberOfRows"]   ?? "1"));
  const nCols   = Math.max(1, parseInt(widget.props["numberOfColumns"] ?? "1"));
  const prec    = parseInt(widget.props["precision"] ?? "3");
  const showGrid = widget.props["showGrid"] !== "false";

  const [, connected, , rawValue] = useConnection(`${ns}-${widget.name}`, `ca://${channel}`);

  // Extract array elements from the PV value.
  const arr = (rawValue as { value?: { arrayValue?: { [i: number]: number; length: number } } })?.value?.arrayValue;
  const nCells = nRows * nCols;

  const cells: string[] = [];
  for (let i = 0; i < nCells; i++) {
    const v = arr ? (arr[i] ?? 0) : 0;
    cells.push(connected && arr ? fmtDouble(v, isNaN(prec) ? 3 : prec) : "—");
  }

  const cellW = widget.geometry.width / nCols;
  const cellH = widget.geometry.height / nRows;
  const fs    = scaledFont(cellH);

  return (
    <div
      title={channel}
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        display: "grid",
        gridTemplateColumns: `repeat(${nCols}, 1fr)`,
        gridTemplateRows: `repeat(${nRows}, 1fr)`,
        background: connected && arr ? "rgb(200,200,200)" : "white",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {cells.map((val, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            fontSize: fs,
            color: "rgb(10,0,184)",
            border: showGrid ? "1px solid #888" : undefined,
            boxSizing: "border-box",
            overflow: "hidden",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {val}
        </div>
      ))}
    </div>
  );
}

// ── caCalc — EPICS calc expression evaluated from PV inputs ──────────────────
// Reads channel (A), channelB (B), channelC (C), channelD (D) PVs,
// evaluates the `calc` property as an EPICS CALC expression, and displays
// the numeric result formatted like caLineEdit.

function CaCalcWidget({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  const channel  = widget.props["channel"]  ?? "";
  const channelB = widget.props["channelB"] ?? "";
  const channelC = widget.props["channelC"] ?? "";
  const channelD = widget.props["channelD"] ?? "";
  const calc     = widget.props["calc"]     ?? "";

  const [, connA, , rawA] = useConnection(`${ns}-${widget.name}-a`, channel  ? `ca://${channel}`  : "ca://");
  const [, connB, , rawB] = useConnection(`${ns}-${widget.name}-b`, channelB ? `ca://${channelB}` : "ca://");
  const [, connC, , rawC] = useConnection(`${ns}-${widget.name}-c`, channelC ? `ca://${channelC}` : "ca://");
  const [, connD, , rawD] = useConnection(`${ns}-${widget.name}-d`, channelD ? `ca://${channelD}` : "ca://");

  const a = extractDouble(rawA) ?? 0;
  const b = extractDouble(rawB) ?? 0;
  const c = extractDouble(rawC) ?? 0;
  const d = extractDouble(rawD) ?? 0;

  // Only show a value when at least one subscribed channel is live.
  const anyLive = (channel && connA && extractDouble(rawA) !== null)
               || (channelB && connB && extractDouble(rawB) !== null)
               || (channelC && connC && extractDouble(rawC) !== null)
               || (channelD && connD && extractDouble(rawD) !== null)
               || (!channel && !channelB && !channelC && !channelD && calc !== "");

  let result: number | null = null;
  if (anyLive && calc) {
    try {
      const expr = normalizeCalc(calc)
        .replace(/\bA\b/g, String(a)).replace(/\bB\b/g, String(b))
        .replace(/\bC\b/g, String(c)).replace(/\bD\b/g, String(d));
      const v = Function(`"use strict"; return (${expr})`)();
      if (typeof v === "number" && isFinite(v)) result = v;
    } catch { /* keep null */ }
  }

  const prec = widget.props["precision"] !== undefined && widget.props["precision"] !== ""
    ? parseInt(widget.props["precision"])
    : 4;

  const str = result !== null ? fmtDouble(result, isNaN(prec) ? 4 : prec) : "—";

  const fg = widget.props["foreground"] ?? "rgb(10,0,184)";
  const bg = widget.props["background"] ?? "rgb(200,200,200)";
  const alignment = widget.props["alignment"] ?? "";

  return (
    <div
      title={`calc: ${calc}`}
      style={{
        ...geoStyle(widget.geometry, widget.zIndex),
        color: fg,
        background: anyLive ? bg : "white",
        display: "flex",
        alignItems: "center",
        justifyContent: alignment.includes("AlignLeft") ? "flex-start"
          : alignment.includes("AlignRight") ? "flex-end"
          : "center",
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

function WidgetRouter({ widget, ns }: { widget: ParsedWidget; ns: string }) {
  switch (widget.class) {
    case "caLineEdit":       return <CaLineEditWidget widget={widget} ns={ns} />;
    case "caTextEntry":      return <CaTextEntryWidget widget={widget} ns={ns} />;
    case "caGraphics":       return <CaGraphicsWidget widget={widget} ns={ns} />;
    case "caLabel":          return <CaLabelWidget widget={widget} ns={ns} />;
    case "caChoice":         return <CaChoiceWidget widget={widget} ns={ns} />;
    case "caMessageButton":  return <CaMessageButtonWidget widget={widget} ns={ns} />;
    case "caRelatedDisplay": return <CaRelatedDisplayWidget widget={widget} ns={ns} />;
    case "caShellCommand":   return <CaShellCommandWidget widget={widget} ns={ns} />;
    case "caMenu":           return <CaMenuWidget widget={widget} ns={ns} />;
    case "caPolyLine":       return <CaPolyLineWidget widget={widget} ns={ns} />;
    case "caCartesianPlot":  return <CaCartesianPlotWidget widget={widget} ns={ns} />;
    case "caByte":           return <CaByteWidget widget={widget} ns={ns} />;
    case "caCamera":         return <CaCameraWidget widget={widget} ns={ns} />;
    case "caFrame":          return <CaFrameWidget widget={widget} ns={ns} />;
    case "caInclude":        return <CaIncludeWidget widget={widget} ns={ns} />;
    case "QTabWidget":       return <QTabWidgetComponent widget={widget} ns={ns} />;
    case "caImage":          return <CaImageWidget widget={widget} ns={ns} />;
    case "caLed":            return <CaLedWidget widget={widget} ns={ns} />;
    case "caThermo":         return <CaThermoWidget widget={widget} ns={ns} />;
    case "caSpinbox":        return <CaSpinboxWidget widget={widget} ns={ns} />;
    case "caSlider":         return <CaSliderWidget widget={widget} ns={ns} />;
    case "caToggleButton":   return <CaToggleButtonWidget widget={widget} ns={ns} />;
    case "caTable":          return <CaTableWidget widget={widget} ns={ns} />;
    case "caStripPlot":      return <CaStripPlotWidget widget={widget} ns={ns} />;
    case "caCalc":           return <CaCalcWidget widget={widget} ns={ns} />;
    case "caWaveTable":      return <CaWaveTableWidget widget={widget} ns={ns} />;
    case "QGroupBox":        return <QGroupBoxWidget widget={widget} ns={ns} />;
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
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file: s.file, macros: s.macros, label: s.label, replace: s.replace, sourceFile: file },
    }));
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
                <WidgetErrorBoundary key={w.name} name={w.name}><WidgetRouter widget={w} ns={ns} /></WidgetErrorBoundary>
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

    </div>
  );
}
