import { useConnection } from "@diamondlightsource/cs-web-lib";
import { toStr } from "../lib/epics";
import { colors } from "../lib/theme";

interface ReadbackRowProps {
  label: string;
  pv: string;
}

export function ReadbackRow({ label, pv }: ReadbackRowProps) {
  const [, connected, , value] = useConnection(`rbk-${pv}`, `ca://${pv}`);
  const display = connected ? (toStr(value) ?? "—") : "—";

  return (
    <tr>
      <td style={{ padding: "6px 8px", color: colors.label, fontWeight: 500, width: 120 }}>{label}</td>
      <td style={{ padding: "6px 8px", fontFamily: "monospace", color: colors.relatedFg, width: 100 }}>{display}</td>
    </tr>
  );
}
