import { createPortal } from "react-dom";

export function PvInfoDialog({ pvName, rawData, onClose }: {
  pvName: string;
  rawData: unknown;
  onClose: () => void;
}) {
  const d = rawData as any;
  const val   = d?.value;
  const alarm = d?.alarm;
  const time  = d?.time;
  const disp  = d?.display;

  const typeName = val?.type?.name ?? (
    val?.doubleValue  !== undefined ? "DBF_DOUBLE"  :
    val?.floatValue   !== undefined ? "DBF_FLOAT"   :
    val?.intValue     !== undefined ? "DBF_LONG"    :
    val?.stringValue  !== undefined ? "DBF_STRING"  :
    val?.arrayValue   !== undefined ? "DBF_ARRAY"   : "—"
  );
  const rawNum   = val?.doubleValue ?? val?.floatValue ?? val?.intValue ?? null;
  const rawStr   = val?.stringValue ?? null;
  const dispVal  = rawStr ?? (rawNum !== null ? String(rawNum) : "—");
  const numVal   = rawNum !== null ? rawNum.toPrecision(16) : rawStr ?? "—";
  const alarmQuality = alarm?.quality ?? "";
  const severityMap: Record<string, string> = { valid: "NO_ALARM", warning: "MINOR", alarm: "MAJOR", invalid: "INVALID" };
  const severity  = severityMap[alarmQuality] ?? (alarmQuality ? alarmQuality.toUpperCase() : "—");
  const alarmSt   = alarmQuality ? "OK" : "—";
  const precision = disp?.precision ?? "—";
  const units     = disp?.units ?? null;
  const count     = val?.arrayValue ? Object.keys(val.arrayValue).length - 1 : 1;

  let tsStr = "—";
  if (time?.datetime) {
    tsStr = new Date(time.datetime).toLocaleString();
  }

  const row = (label: string, value: string) => (
    <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
      <span style={{ color: "#90caf9", minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#e0e0e0", fontFamily: "monospace", wordBreak: "break-all" }}>{value}</span>
    </div>
  );

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9100 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 9101, background: "#0f2035", border: "1px solid #1e3a5f", borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 380, padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1a3a5c", borderRadius: "8px 8px 0 0", padding: "8px 14px" }}>
          <span style={{ color: "#bbdefb", fontWeight: 700, fontSize: 13, fontFamily: "sans-serif" }}>PV Info</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#90caf9", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
        </div>
        <div style={{ padding: "12px 16px", fontSize: 12, fontFamily: "sans-serif" }}>
          <div style={{ color: "#7a9ab8", marginBottom: 8, fontSize: 11 }}>! configuration values are fetched once</div>
          <div style={{ color: "#4fc3f7", fontWeight: 700, marginBottom: 4 }}>{pvName}</div>
          <div style={{ color: "#90caf9", marginBottom: 8, fontSize: 11 }}>Plugin: epics3 : loaded &amp; connected</div>
          <div style={{ borderTop: "1px solid #1e3a5f", marginBottom: 8 }} />
          {row("TimeStamp:", tsStr)}
          {row("Type:", typeName)}
          {row("Count:", String(count))}
          {row("Value:", dispVal)}
          {row("Value (num):", numVal)}
          {row("Severity:", severity)}
          {row("Alarm status:", alarmSt)}
          {units && row("Units:", units)}
          {row("Precision (channel):", String(precision))}
        </div>
      </div>
    </>,
    document.body
  );
}
