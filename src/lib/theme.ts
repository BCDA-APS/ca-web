/** Canonical color tokens for the EPICS dark UI theme. */
export const colors = {
  // Readback (RBV) — cyan value display
  rbvText:   "#80deea",
  rbvBg:     "#1a2a3a",
  rbvBorder: "#2a3a4a",

  // Setpoint (SP / VAL) — white value on dark blue
  spText:    "#ffffff",
  spBg:      "#1a3258",
  spBorder:  "#2a5a9a",

  // Active text input
  inputBg:     "#1a3a4a",
  inputBorder: "#4a90d9",

  // Tweak buttons (‹ ›)
  tweakBg:     "#2060a0",
  tweakFg:     "#cce0ff",
  tweakBorder: "#1a4a7a",

  // Related display buttons (Gauge, Pump, Ring Info…)
  relatedBg:     "#0d2a4a",
  relatedBorder: "#2a5a9a",
  relatedFg:     "#90caf9",

  // Text roles
  unit:      "#7a9ab8",  // unit labels: eV, mA, Torr…
  label:     "#cce0ff",  // row labels, motor name, section text
  dim:       "#546e8a",  // dimmed / secondary text

  // Section headers
  sectionHdr:       "#7c6fa0",
  sectionHdrBorder: "#2a1a4a",

  // Motor card backgrounds
  cardBg:         "#1e3a5c",
  cardBgDisabled: "#111e30",
  cardBarBg:      "#2a4a6a",  // position bar track
  cardBarThumb:   "#90caf9",  // position bar thumb

  // Status / alarm
  statusOk:    "#4caf50",
  statusWarn:  "#f9a825",
  statusError: "#e53935",
} as const;

/** Canonical font sizes. */
export const fontSize = {
  mono:  14,  // RBV / SP numeric values
  label: 11,  // labels, units, status text
  small: 10,  // small status badges
  badge: 12,  // GRT / mirror labels
} as const;
