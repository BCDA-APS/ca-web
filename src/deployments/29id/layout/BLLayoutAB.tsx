import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble } from "../../../lib/epics";
import { colors } from "../../../lib/theme";

const C_BEAM   = "#7aabff"; // static beam path (no photons)
const C_PHOTON = "#4caf50"; // photons flowing
const C_BLOCK  = "#e8b62b"; // valve/shutter closed

function segColor(feOpen: boolean, valvesOpen: boolean): string {
  if (!valvesOpen) return C_BLOCK;
  return feOpen ? C_PHOTON : C_BEAM;
}

export function BLLayoutAB() {
  // FE / PSS shutters
  const [,,,ss1r]   = useConnection("blab-ss1",  "ca://S29ID-FEEPS:SS1:OpenedM");
  const [,,,ss2r]   = useConnection("blab-ss2",  "ca://S29ID-FEEPS:SS2:OpenedM");
  const [,,,ps2r]   = useConnection("blab-ps2",  "ca://S29ID-FEEPS:PS2:OpenedM");
  const [,,,ps2pr]  = useConnection("blab-ps2p", "ca://S29ID-FEEPS:PS2:PositionM");

  // BL gate valves (A section: GV01-04, B section: GV05, GV15)
  const [,,,gv01r]  = useConnection("blab-gv01", "ca://29id:BLEPS:GV01:OPENED:STS");
  const [,,,gv02r]  = useConnection("blab-gv02", "ca://29id:BLEPS:GV02:OPENED:STS");
  const [,,,gv03r]  = useConnection("blab-gv03", "ca://29id:BLEPS:GV03:OPENED:STS");
  const [,,,gv04r]  = useConnection("blab-gv04", "ca://29id:BLEPS:GV04:OPENED:STS");
  const [,,,gv05r]  = useConnection("blab-gv05", "ca://29id:BLEPS:GV05:OPENED:STS");
  const [,,,gv15r]  = useConnection("blab-gv15", "ca://29id:BLEPS:GV15:OPENED:STS");

  // M3R mirror position monitor
  const [,,,m3rr]   = useConnection("blab-m3r",  "ca://29id_m3r:TX_MON");

  // Main shutter beam-blocking status
  const [,,,msbr]   = useConnection("blab-msb",  "ca://S29ID-PSS:FES:BeamBlocking:CM");

  // EPS alarms
  const [,,,egnr]   = useConnection("blab-egn",  "ca://29id:BLEPS:ALARM:GREEN");
  const [,,,erdr]   = useConnection("blab-erd",  "ca://29id:BLEPS:ALARM:RED");
  const [,,,eylr]   = useConnection("blab-eyl",  "ca://29id:BLEPS:ALARM:YELLOW");
  const [,,,ebzr]   = useConnection("blab-ebz",  "ca://29id:BLEPS:ALARM:BUZZER");

  // Station search
  const [,,,star]   = useConnection("blab-sta",  "ca://S29ID-PSS:StaA:Secure:BM");

  // Derived values
  const feOpen  = toDouble(ss1r) === 1 && toDouble(ps2r) === 1;
  const bOpen   = toDouble(gv05r) === 1 && toDouble(gv15r) === 1;
  const aOpen   = toDouble(gv01r) === 1 && toDouble(gv02r) === 1 &&
                  toDouble(gv03r) === 1 && toDouble(gv04r) === 1;
  const ss2open = toDouble(ss2r) === 1;
  const msOpen  = toDouble(ps2pr) === 2;
  const msBlock = toDouble(msbr) === 1;
  const m3rVal  = toDouble(m3rr);
  const m3rDefl = m3rVal !== null && m3rVal < 5; // TX_MON < 5 → mirror deflecting

  const epsGreen  = (toDouble(egnr) ?? 0) !== 0;
  const epsRed    = (toDouble(erdr) ?? 0) !== 0;
  const epsYellow = (toDouble(eylr) ?? 0) !== 0;
  const epsBuzzer = (toDouble(ebzr) ?? 0) !== 0;
  const stationOk = (toDouble(star) ?? 0) !== 0;

  // Beam segment colors
  const cFE = feOpen ? C_PHOTON : !bOpen ? C_BLOCK : C_BEAM;  // pre-M3R / FE
  const cB  = segColor(feOpen, bOpen);               // B section (GV05/GV15)
  const cA  = segColor(feOpen, aOpen);               // A section (GV01-04)

  // ── SVG geometry ──────────────────────────────────────────────────────────
  const W  = 260;
  const H  = 65;
  const by = 30; // beam centre Y
  const bh = 5;  // beam stripe height

  const scale = W / 260;
  const m3rX   = Math.round(23  * scale); // D exit center=407; AB left=W_E+W_C-1=384; 407-384=23
  const s2bX   = Math.round(72  * scale);
  const s1aX   = Math.round(122 * scale);
  const msX    = Math.round(156 * scale);
  // 48x21 — match the C-Shutter (BLLayoutC) and D-Shutter (BLLayoutD)
  // boxes so MS CLOSE button text doesn't overflow.
  const msW    = Math.round(42  * scale * 300 / 260); // 48
  const msH    = Math.round(18  * scale * 300 / 260); // 21
  const ss2X   = Math.round(220 * scale);
  const ss2W   = Math.round(26  * scale);
  const ss2H   = Math.min(Math.round(40 * scale), 38);
  const jawW   = 7;
  const labelY = H - 3;

  // Beam segment x ranges
  // pre-M3R:  0     → m3rX (horizontal, hidden when M3R deflecting)
  // B section: m3rX → s2bX+jawW and s2bX+jawW → s1aX (skipping slit body)
  // A section: s1aX+jawW → msX
  // post shutter: handled by SS2 color

  const msColor  = msOpen  ? colors.statusOk : colors.statusError;
  const msLabel  = msBlock ? "CLOSED"  : "OPEN";
  const ss2Color = ss2open ? colors.statusOk : colors.statusError;

  return (
    <div style={{ fontFamily: "sans-serif", fontSize: 10 }}>
      <svg width={W} height={H} style={{ display: "block" }}>

        {/* ── Beam segments (bottom layer) ── */}

        {/* Pre-M3R horizontal: cFE when mirror flat, C_BEAM (blue path) when deflecting */}
        <rect x={0} y={by} width={m3rX} height={bh} fill={m3rDefl ? C_BEAM : cFE} />

        {/* M3R deflected vertical: 6px wide (integer coords) to align with D's 6px vertical */}
        {m3rDefl && (
          <rect x={m3rX - 3} y={0} width={bh + 1} height={by}
            fill={feOpen ? C_PHOTON : !bOpen ? C_BLOCK : C_BEAM} />
        )}

        {/* B section: continuous m3rX → s1aX (slit 2B jaws overlay) */}
        <rect x={m3rX} y={by} width={s1aX - m3rX} height={bh} fill={cB} />
        {/* A section: continuous s1aX → msX (slit 1A jaws overlay) */}
        <rect x={s1aX} y={by} width={msX - s1aX} height={bh} fill={cA} />
        {/* Post-shutter: msX+msW → ss2X — green when SS2 open AND PS2 open */}
        <rect x={msX + msW} y={by} width={ss2X - msX - msW} height={bh}
          fill={ss2open && toDouble(ps2r) === 1 ? C_PHOTON : C_BEAM} />

        {/* ── M3R mirror ── */}
        {m3rDefl ? (
          <line
            x1={m3rX + 11} y1={by + 12}
            x2={m3rX - 13} y2={by - 12}
            stroke="rgb(10,0,184)" strokeWidth={bh} strokeLinecap="round"
          />
        ) : (
          <line
            x1={m3rX - 17} y1={by + bh + 2}
            x2={m3rX + 17} y2={by + bh + 2}
            stroke="rgb(10,0,184)" strokeWidth={bh} strokeLinecap="round"
          />
        )}
        <text x={m3rX} y={by + 12 + bh + 5} textAnchor="middle" fontSize={8} fill="#333">M3R</text>

        {/* ── Slit 2B ── */}
        <rect x={s2bX} y={by - 2 - 13} width={jawW} height={13} fill="#333" />
        <rect x={s2bX} y={by + bh + 2} width={jawW} height={13} fill="#333" />
        <text x={s2bX + jawW/2} y={by - 2 - 13 - 2} textAnchor="middle" fontSize={8} fill="#333">2B</text>

        {/* ── Slit 1A ── */}
        <rect x={s1aX} y={by - 2 - 13} width={jawW} height={13} fill="#333" />
        <rect x={s1aX} y={by + bh + 2} width={jawW} height={13} fill="#333" />
        <text x={s1aX + jawW/2} y={by - 2 - 13 - 2} textAnchor="middle" fontSize={8} fill="#333">1A</text>

        {/* ── Main Shutter ── */}
        <rect x={msX} y={by + bh/2 - msH/2} width={msW} height={msH} fill={msColor} rx={1} />
        <text x={msX + msW/2} y={by + bh/2 - msH/2 - 4} textAnchor="middle" fontSize={8} fill="#333">Main Shutter</text>
        <text x={msX + msW/2} y={by + bh/2 + 3} textAnchor="middle" fontSize={8} fontWeight="700" fill="#fff">
          {msLabel}
        </text>

        {/* ── Safety Shutter SS2 ── */}
        <rect x={ss2X} y={Math.max(2, by + bh/2 - ss2H/2)} width={ss2W}
          height={Math.min(ss2H, H - Math.max(2, by + bh/2 - ss2H/2) - 2)}
          fill={ss2Color} rx={2} />

      </svg>

      {/* ── Bottom HTML ── */}
      {/* negMargin pulls the row up so MS buttons sit under the CLOSED rect;
          paddingTop on the left column cancels that shift so station/EPS sit at SVG bottom */}
      <div style={{ display: "flex", alignItems: "flex-start", marginTop: -(H - by - Math.ceil(msH / 2) - 6) }}>

        {/* Left: EPS Status — under the slits area */}
        <div style={{ width: msX - 2, paddingTop: H - by - Math.ceil(msH / 2) - 6, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <div style={{ border: "1px solid #b0b0b8", borderRadius: 3, padding: "1px 6px", fontSize: 9, marginLeft: Math.round((m3rX + msX) / 2), transform: "translateX(-50%)" }}>
            <div style={{ textAlign: "center", color: "#666", fontSize: 8, marginBottom: 2 }}>EPS Status</div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ display: "grid" }}>
                <span style={{ gridArea: "1/1", visibility: "hidden", fontWeight: 600 }}>YELLOW</span>
                {epsGreen  && <span style={{ gridArea: "1/1", fontWeight: 600, color: colors.statusOk }}>GREEN</span>}
                {epsYellow && <span style={{ gridArea: "1/1", fontWeight: 600, color: colors.statusWarn }}>YELLOW</span>}
                {epsRed    && <span style={{ gridArea: "1/1", fontWeight: 600, color: colors.statusError }}>RED</span>}
              </div>
              {epsBuzzer && <span style={{ fontWeight: 600, color: colors.statusError, whiteSpace: "nowrap" }}>BUZZER ON</span>}
            </div>
          </div>
        </div>

        {/* Right: MS OPEN / CLOSE + Station NOT SEARCHED */}
        <div style={{ width: W - msX, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
          <div style={{ width: msW + 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => pvwsWriter.write("S29ID-PSS:FES:OpenEPICSC", 1)}
              style={{ background: "#e8f5e9", color: "#1b5e20", border: "1px solid #4caf50", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
              MS OPEN
            </button>
            <button
              onClick={() => pvwsWriter.write("S29ID-PSS:FES:CloseEPICSC", 1)}
              style={{ background: "#ffebee", color: "#b71c1c", border: "1px solid #ef5350", borderRadius: 3, fontSize: 9, padding: "1px 4px", cursor: "pointer", whiteSpace: "nowrap", width: "100%" }}>
              MS CLOSE
            </button>
          </div>
          {!stationOk && (
            <span style={{ color: colors.statusError, fontSize: 9, whiteSpace: "nowrap" }}>
              Station NOT SEARCHED
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
