import { MotorCard } from "./MotorCard";

interface MotorGridProps {
  /** PV prefix, e.g. "29idc:" */
  prefix: string;
  /** Motor names in row-major order, e.g. ["m1","m2","m3","m4","m5","m6"] */
  motors: string[];
  /** Number of columns (default 3) */
  columns?: number;
  /** Override precision for soft limit display on all cards */
  softLimitPrec?: number;
}

export function MotorGrid({ prefix, motors, columns = 3, softLimitPrec }: MotorGridProps) {
  const rows: string[][] = [];
  for (let i = 0; i < motors.length; i += columns) {
    rows.push(motors.slice(i, i + columns));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 8 }}>
          {row.map(motor => (
            <MotorCard key={motor} pv={`${prefix}${motor}`} softLimitPrec={softLimitPrec} />
          ))}
        </div>
      ))}
    </div>
  );
}
