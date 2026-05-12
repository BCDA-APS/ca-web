import type { MouseEvent } from "react";

// ── PV value extractors ───────────────────────────────────────────────────────

/** Extract a numeric value from a cs-web-lib raw data object. */
export function toDouble(d: unknown): number | null {
  if (!d) return null;
  const val = (d as { value?: { doubleValue?: number; floatValue?: number; intValue?: number; stringValue?: string } }).value;
  if (val?.doubleValue !== undefined) return Number.isFinite(val.doubleValue) ? val.doubleValue : null;
  if (val?.floatValue  !== undefined) return Number.isFinite(val.floatValue)  ? val.floatValue  : null;
  if (val?.intValue    !== undefined) return Number.isFinite(val.intValue)    ? val.intValue    : null;
  if (val?.stringValue !== undefined) { const n = parseFloat(val.stringValue); return isNaN(n) ? null : n; }
  return null;
}

/** Extract a string value from a cs-web-lib raw data object. */
export function toStr(d: unknown): string | null {
  if (!d) return null;
  const val = (d as { value?: unknown }).value as Record<string, unknown> | number[] | undefined;
  if (!val) return null;

  // Scalar string
  if (typeof (val as Record<string, unknown>).stringValue === "string") {
    const s = (val as Record<string, unknown>).stringValue as string;
    return s !== "" ? s : null;
  }

  // Scalar double
  if ((val as Record<string, unknown>).doubleValue !== undefined)
    return String((val as Record<string, unknown>).doubleValue);

  // Char waveform: pvws sends as arrayValue object {"0":47,"1":110,...}
  const arrayValue = (val as Record<string, unknown>).arrayValue;
  if (arrayValue && typeof arrayValue === "object" && !Array.isArray(arrayValue)) {
    const codes = Object.values(arrayValue as Record<string, number>).filter(n => n > 0);
    const s = String.fromCharCode(...codes);
    return s || null;
  }

  // Fallback: plain JS array
  const arr: number[] | undefined =
    (val as Record<string, unknown>).byteArray as number[] ??
    (Array.isArray(val) ? (val as number[]) : undefined);
  if (arr) {
    const s = String.fromCharCode(...arr.filter(n => n > 0));
    return s || null;
  }

  return null;
}

/** Format a number to fixed decimal places, returning "—" for null. */
export function fmt(n: number | null, prec = 3): string {
  return n === null ? "—" : n.toFixed(prec);
}

/**
 * Extract a boolean from a cs-web-lib raw data object.
 * Checks string label first to handle EPICS records with reversed numeric convention
 * (e.g. records where 0="On").
 */
export function toBool(d: unknown): boolean {
  const s = toStr(d);
  if (s !== null) {
    const l = s.toLowerCase().trim();
    if (l === "on"  || l === "1" || l === "true")  return true;
    if (l === "off" || l === "0" || l === "false") return false;
  }
  const n = toDouble(d);
  return n !== null && n !== 0;
}

// ── Context menu ──────────────────────────────────────────────────────────────

/** Dispatch a pv-context event so App.tsx shows the PV info dialog on right-click. */
export function pvCtx(pvName: string, rawData: unknown, e: MouseEvent) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent("pv-context", {
    detail: { pvName, rawData, x: e.clientX, y: e.clientY },
  }));
}
