import { useState, useEffect, useRef } from "react";
import { useConnection } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "../../../lib/pvwsWriter";
import { toDouble, toStr, pvCtx } from "../../../lib/epics";
import { colors, fontSize } from "../../../lib/theme";
import { ChanRbvBox, ChanSpBox } from "../../../widgets/EpicsWidgets";

function StrSpBox({ raw, pv, width, style, onContextMenu }: {
  raw: unknown; pv: string; width?: number; style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const current = toStr(raw) ?? "";

  function startEdit() {
    setDraft(current);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    if (draft !== current) pvwsWriter.write(pv, draft);
    setEditing(false);
  }

  const inputStyle: React.CSSProperties = {
    boxSizing: "border-box", width, padding: "0 4px",
    background: colors.inputBg, color: colors.spText,
    border: `1px solid ${colors.inputBorder}`,
    fontFamily: "monospace", fontSize: fontSize.label,
    outline: "none", ...style,
  };

  if (editing) {
    return (
      <input ref={inputRef} value={draft} style={inputStyle}
        aria-label={pv}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") { commit(); } else if (e.key === "Escape") setEditing(false); }}
        onContextMenu={onContextMenu}
      />
    );
  }

  return (
    <div onClick={startEdit} onContextMenu={onContextMenu}
      style={{ ...inputStyle, cursor: "text", display: "flex", alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
      {current || <span style={{ color: "#aaa" }}>—</span>}
    </div>
  );
}

function StrRbvBox({ raw, width, asInput, style, onContextMenu }: {
  raw: unknown; width?: number; asInput?: boolean; style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        boxSizing: "border-box", width, padding: "0 4px",
        background: asInput ? colors.inputBg  : colors.rbvBg,
        color:      asInput ? colors.spText   : colors.rbvText,
        border:     `1px solid ${asInput ? colors.inputBorder : colors.rbvBorder}`,
        fontFamily: "monospace", fontSize: fontSize.label,
        display: "flex", alignItems: "center", overflow: "hidden",
        whiteSpace: "nowrap", ...style,
      }}>
      {toStr(raw) ?? "—"}
    </div>
  );
}

interface TabCfg { label: string; Q: string; accent: string; }

const TABS: TabCfg[] = [
  { label: "Test",     Q: "29idTest:",  accent: "rgb(168,208,255)" },
  { label: "ARPES",    Q: "29idARPES:", accent: "rgb(200,176,255)" },
  { label: "Kappa",    Q: "29idKappa:", accent: "rgb(191,255,179)" },
  { label: "Octupole", Q: "29ide:",     accent: "rgb(255,208,160)" },
  { label: "C",        Q: "29idc:",     accent: "rgb(255,200,200)" },
];

const B = "scanProgress:";
const S = "scan1";
const H = 20;

const row: React.CSSProperties = { display: "flex", gap: 4, alignItems: "center" };
const lbl: React.CSSProperties = { fontSize: fontSize.label, color: colors.label, width: 32, textAlign: "right", flexShrink: 0 };
const fld: React.CSSProperties = { height: H, fontSize: fontSize.label };
const hdr: React.CSSProperties = { fontSize: fontSize.small, color: colors.label, textAlign: "center" };

function MdaScanMenu({ Q }: { Q: string }) {
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

  const base = "/APSshare/epics/synApps_6_3/support/sscan-R2-11-6/sscanApp/op/ui/autoconvert";
  const items = [
    { label: "Scan1",    file: `${base}/scan.ui`,         macros: { P: Q, N: "1", S: "scan1", DW: "Dwait1", PW: "Pwait1" } },
    { label: "Scan2",    file: `${base}/scan.ui`,         macros: { P: Q, N: "2", S: "scan2", DW: "Dwait2", PW: "Pwait2" } },
    { label: "Scan3",    file: `${base}/scan.ui`,         macros: { P: Q, N: "3", S: "scan3", DW: "Dwait3", PW: "Pwait3" } },
    { label: "Scan4",    file: `${base}/scan.ui`,         macros: { P: Q, N: "4", S: "scan4", DW: "Dwait4", PW: "Pwait4" } },
    { label: "ScanH",    file: `${base}/scan.ui`,         macros: { P: Q, N: "H", S: "scanH" } },
    { label: "SaveData", file: `${base}/scan_saveData.ui`, macros: { P: Q } },
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ height: H, padding: "0 6px", background: "rgb(205,97,0)", color: "#fff",
          border: "1px solid #a06000", borderRadius: 2, fontSize: fontSize.label,
          cursor: "pointer", fontFamily: "sans-serif", whiteSpace: "nowrap" }}>
        MDA Scan {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 2,
          background: "#fff", border: `1px solid ${colors.relatedBorder}`,
          borderRadius: 3, boxShadow: "0 2px 6px rgba(0,0,0,0.15)", zIndex: 100 }}>
          {items.map(item => (
            <div key={item.label}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-ui", {
                  detail: { file: `/ui/29id/${item.file}`, macros: item.macros, label: item.label },
                }));
                setOpen(false);
              }}
              style={{ padding: "3px 10px", fontSize: fontSize.label, fontFamily: "sans-serif",
                cursor: "pointer", color: colors.label, whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget.style.background = colors.relatedBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScanProgressBar({ Q }: { Q: string }) {
  const k = Q.replace(/[^a-z0-9]/gi, "_");
  const [,,,paused]  = useConnection(`sp-paus-${k}`, `ca://${Q}${B}paused`);
  const [,,,running] = useConnection(`sp-run-${k}`,  `ca://${Q}${B}running`);
  const [,,,pct]     = useConnection(`sp-pct-${k}`,  `ca://${Q}${B}percentDone`);
  const [,,,rem]     = useConnection(`sp-rem-${k}`,  `ca://${Q}${B}remainingTimeStr`);
  const [,,,ela]     = useConnection(`sp-ela-${k}`,  `ca://${Q}${B}totalElapsedTimeStr`);
  const [,,,fpath]   = useConnection(`sp-fp-${k}`,   `ca://${Q}saveData_fullPathName`);
  const [,,,fname]   = useConnection(`sp-fn-${k}`,   `ca://${Q}saveData_fileName`);

  const isPaused  = (toDouble(paused)  ?? 0) !== 0;
  const isRunning = (toDouble(running) ?? 0) !== 0;
  const pctVal    = Math.min(1, Math.max(0, (toDouble(pct) ?? 0) / 100));

  const barColor = isPaused ? "rgb(255,194,94)" : isRunning ? "rgb(128,213,122)" : "rgb(135,147,226)";
  const timeRaw  = isRunning ? rem : ela;
  const timePv   = isRunning ? `${Q}${B}remainingTimeStr` : `${Q}${B}totalElapsedTimeStr`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div style={row}>
          <span style={lbl}>SCAN</span>
          <StrRbvBox raw={fname} width={180} style={{ height: H, fontSize: fontSize.label }}
            onContextMenu={e => pvCtx(`${Q}saveData_fileName`, fname, e)} />
        </div>
        <MdaScanMenu Q={Q} />
      </div>
      <StrRbvBox raw={fpath} style={{ height: H, fontSize: 9, width: "100%", boxSizing: "border-box" }}
        onContextMenu={e => pvCtx(`${Q}saveData_fullPathName`, fpath, e)} />
      <div style={{ height: 14, borderRadius: 2, background: "#e8e8e8", border: "1px solid #aaa", overflow: "hidden", position: "relative", marginTop: 2 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pctVal * 100}%`, background: barColor, transition: "width 0.4s" }} />
      </div>
      <div style={{ ...row, justifyContent: "space-between" }}>
        <div style={row}>
          <span style={{ ...lbl, width: "auto", textAlign: "left", color: isRunning ? colors.statusOk : colors.label }}>
            {isRunning ? "remaining time" : "total time"}
          </span>
          <StrRbvBox raw={timeRaw} width={90} style={{ ...fld, height: H - 2 }}
            onContextMenu={e => pvCtx(timePv, timeRaw, e)} />
        </div>
        <div style={row}>
          <ChanRbvBox raw={pct} width={46} style={{ ...fld, height: H - 2, padding: "0 4px", lineHeight: `${H - 2}px` }}
            onContextMenu={e => pvCtx(`${Q}${B}percentDone`, pct, e)} />
          <span style={{ fontSize: fontSize.small, color: colors.label }}>%</span>
        </div>
      </div>
    </div>
  );
}

function ScanContent({ Q, accent }: { Q: string; accent: string }) {
  const k = Q.replace(/[^a-z0-9]/gi, "_");
  const [,   ,, smsg] = useConnection(`sc-smsg-${k}`, `ca://${Q}${S}.SMSG`);
  const [, c2,, npts] = useConnection(`sc-npts-${k}`, `ca://${Q}${S}.NPTS`);
  const [,   ,, cpt]  = useConnection(`sc-cpt-${k}`,  `ca://${Q}${S}.CPT`);
  const [, c1,, r1pv] = useConnection(`sc-r1pv-${k}`, `ca://${Q}${S}.R1PV`);
  const [,   ,, p1pv] = useConnection(`sc-p1pv-${k}`, `ca://${Q}${S}.P1PV`);
  const [, c3,, p1sp] = useConnection(`sc-p1sp-${k}`, `ca://${Q}${S}.P1SP`);
  const [, c4,, p1ep] = useConnection(`sc-p1ep-${k}`, `ca://${Q}${S}.P1EP`);
  const [, c5,, p1si] = useConnection(`sc-p1si-${k}`, `ca://${Q}${S}.P1SI`);
  const [, c6,, paus] = useConnection(`sc-paus-${k}`, `ca://${Q}scanPause.VAL`);
  const [,   ,, p1nv] = useConnection(`sc-p1nv-${k}`, `ca://${Q}${S}.P1NV`);
  const [,   ,, p2nv] = useConnection(`sc-p2nv-${k}`, `ca://${Q}${S}.P2NV`);
  const [,   ,, p3nv] = useConnection(`sc-p3nv-${k}`, `ca://${Q}${S}.P3NV`);
  const [,   ,, p4nv] = useConnection(`sc-p4nv-${k}`, `ca://${Q}${S}.P4NV`);

  const numPos = [p1nv, p2nv, p3nv, p4nv].filter(v => (toDouble(v) ?? 1) !== 1).length;

  const isPaused = (toDouble(paus) ?? 0) !== 0;

  const btnW = 68;
  const btnBase: React.CSSProperties = {
    width: btnW, height: H, padding: "0 4px",
    borderRadius: 2, fontSize: fontSize.label,
    cursor: "pointer", fontFamily: "sans-serif", border: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, borderLeft: `4px solid ${accent}` }}>
      {/* SMSG / NPTS / CPT — full width, aligns with fullPathName below */}
      <div style={row}>
        <StrRbvBox raw={smsg} style={{ ...fld, flex: 1 }}
          onContextMenu={e => pvCtx(`${Q}${S}.SMSG`, smsg, e)} />
        <ChanSpBox raw={npts} width={42} style={{ ...fld, padding: "0 4px", lineHeight: `${H}px` }} disabled={!c2}
          onCommit={n => pvwsWriter.write(`${Q}${S}.NPTS`, n)}
          onContextMenu={e => pvCtx(`${Q}${S}.NPTS`, npts, e)} />
        <ChanRbvBox raw={cpt} width={35} style={{ ...fld, padding: "0 4px", lineHeight: `${H}px` }}
          onContextMenu={e => pvCtx(`${Q}${S}.CPT`, cpt, e)} />
      </div>
      {/* RBV + clear + SCAN */}
      <div style={row}>
        <span style={lbl}>RBV</span>
        <StrSpBox raw={r1pv} pv={`${Q}${S}.R1PV`} width={178} style={fld}
          onContextMenu={e => pvCtx(`${Q}${S}.R1PV`, r1pv, e)} />
        <button onClick={() => pvwsWriter.write(`${Q}${S}.CMND`, 1)}
          style={{ marginLeft: "auto", height: H, padding: "0 4px", fontSize: fontSize.small, fontFamily: "sans-serif",
            background: "rgb(238,182,43)", color: "#000", border: "1px solid #c0a020", borderRadius: 2, cursor: "pointer" }}>
          clear
        </button>
        <button onClick={() => pvwsWriter.write(`${Q}${S}.EXSC`, 1)} disabled={!c1}
          style={{ ...btnBase, background: "rgb(115,223,255)", color: "#000", border: "1px solid #4ab0d0" }}>
          SCAN
        </button>
      </div>
      {/* VAL + × numPos + PAUSE */}
      <div style={row}>
        <span style={lbl}>VAL</span>
        <StrSpBox raw={p1pv} pv={`${Q}${S}.P1PV`} width={178} style={fld}
          onContextMenu={e => pvCtx(`${Q}${S}.P1PV`, p1pv, e)} />
        <span style={{ marginLeft: "auto", fontSize: fontSize.label, color: colors.label }}>×</span>
        <div style={{ fontFamily: "monospace", fontSize: fontSize.label, color: colors.rbvText,
          background: colors.rbvBg, border: `1px solid ${colors.rbvBorder}`,
          width: 18, height: H, lineHeight: `${H}px`, textAlign: "center", boxSizing: "border-box" }}>
          {numPos}
        </div>
        <button onClick={() => pvwsWriter.write(`${Q}scanPause.VAL`, isPaused ? 0 : 1)} disabled={!c6}
          style={{ ...btnBase, background: isPaused ? "rgb(255,194,94)" : "rgb(238,182,43)", color: "#000", border: "1px solid #c0a020" }}>
          {isPaused ? "RESUME" : "PAUSE"}
        </button>
      </div>
      {/* START / END / STEP + ABORT */}
      <div style={{ ...row, alignItems: "flex-end", marginLeft: 36 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={hdr}>START</span>
          <ChanSpBox raw={p1sp} width={70} style={fld} disabled={!c3}
            onCommit={n => pvwsWriter.write(`${Q}${S}.P1SP`, n)}
            onContextMenu={e => pvCtx(`${Q}${S}.P1SP`, p1sp, e)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={hdr}>END</span>
          <ChanSpBox raw={p1ep} width={70} style={fld} disabled={!c4}
            onCommit={n => pvwsWriter.write(`${Q}${S}.P1EP`, n)}
            onContextMenu={e => pvCtx(`${Q}${S}.P1EP`, p1ep, e)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={hdr}>STEP</span>
          <ChanSpBox raw={p1si} width={70} style={fld} disabled={!c5}
            onCommit={n => pvwsWriter.write(`${Q}${S}.P1SI`, n)}
            onContextMenu={e => pvCtx(`${Q}${S}.P1SI`, p1si, e)} />
        </div>
        <button onClick={() => pvwsWriter.write(`${Q}AbortScans.PROC`, 0)}
          style={{ ...btnBase, marginLeft: "auto", background: "rgb(253,0,0)", color: "rgb(251,243,74)", border: "1px solid #aa0000", fontWeight: 600 }}>
          ABORT
        </button>
      </div>
      <hr style={{ margin: "2px 0", border: "none", borderTop: "1px solid #ccc" }} />
      <ScanProgressBar Q={Q} />
    </div>
  );
}

export function ScanRecords() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];

  return (
    <div style={{ fontFamily: "sans-serif", minWidth: 340 }}>
      <div style={{ display: "flex", borderBottom: "1px solid #ccc" }}>
        {TABS.map((t, i) => (
          <button key={t.label} onClick={() => setActive(i)} style={{
            padding: "4px 12px", fontSize: fontSize.label, fontFamily: "sans-serif",
            cursor: "pointer", border: "none",
            borderBottom: `3px solid ${i === active ? t.accent : "transparent"}`,
            background: i === active ? t.accent : "transparent",
            color: colors.label, fontWeight: i === active ? 600 : 400,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      <ScanContent key={tab.Q} Q={tab.Q} accent={tab.accent} />
    </div>
  );
}
