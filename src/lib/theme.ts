/** Canonical color tokens for the EPICS dark UI theme. */
export const colors = {
  // Readback (RBV) — blue text on light gray
  rbvText:   "rgb(10,37,159)",
  rbvBg:     "rgb(236,236,236)",
  rbvBorder: "rgb(160,168,215)",

  // Setpoint (SP / VAL) — light text on dark blue
  spText:    "rgb(228,228,228)",
  spBg:      "rgb(0,53,132)",
  spBorder:  "rgb(0,35,90)",

  // Active text input
  inputBg:     "rgb(0,53,132)",
  inputBorder: "rgb(0,35,90)",

  // Tweak buttons (‹ ›)
  tweakBg:     "#2060a0",
  tweakFg:     "#cce0ff",
  tweakBorder: "#1a4a7a",

  // Related display buttons (Gauge, Pump, Ring Info…)
  relatedBg:     "rgb(210,220,240)",
  relatedBorder: "rgb(160,180,220)",
  relatedFg:     "rgb(0,53,132)",

  // Text roles
  unit:      "#444444",  // unit labels: eV, mA, Torr…
  label:     "#333333",  // row labels, motor name, section text
  dim:       "#666666",  // dimmed / secondary text

  // Section headers
  sectionHdr:       "#7c6fa0",
  sectionHdrBorder: "#2a1a4a",

  // Motor card backgrounds
  cardBg:         "rgb(200,200,205)",
  cardBgDisabled: "rgb(185,185,190)",
  cardBarBg:      "rgb(175,175,180)",  // position bar track
  cardBarThumb:   "rgb(0,53,132)",     // position bar thumb

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
