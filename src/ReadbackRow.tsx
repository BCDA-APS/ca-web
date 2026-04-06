import { useConnection } from "@diamondlightsource/cs-web-lib";

interface ReadbackRowProps {
  label: string;
  pv: string;
}

function toStr(d: unknown): string | null {
  if (!d) return null;
  const val = (d as { value?: { stringValue?: string; doubleValue?: number } }).value;
  if (val?.stringValue !== undefined) return val.stringValue;
  if (val?.doubleValue !== undefined) return String(val.doubleValue);
  return null;
}

export function ReadbackRow({ label, pv }: ReadbackRowProps) {
  const [, connected, , value] = useConnection(`rbk-${pv}`, `ca://${pv}`);
  const display = connected ? (toStr(value) ?? "—") : "—";

  return (
    <tr>
      <td style={{ padding: "6px 12px", color: "#cce0ff", fontWeight: 500, width: 180 }}>{label}</td>
      <td style={{ padding: "6px 12px", fontFamily: "monospace", color: "#90caf9", width: 200 }}>{display}</td>
    </tr>
  );
}
