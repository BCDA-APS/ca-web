import { useState, useRef, useEffect } from "react";
import { colors, fontSize } from "../lib/theme";

// ── RbvBox ────────────────────────────────────────────────────────────────────

/** Read-only cyan readback box. */
export function RbvBox({ value, prec = 3, width, style, onContextMenu }: {
  value: number | null;
  prec?: number;
  width?: number;
  style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        fontFamily: "monospace",
        fontSize: fontSize.mono,
        color: colors.rbvText,
        background: colors.rbvBg,
        border: `1px solid ${colors.rbvBorder}`,
        borderRadius: 3,
        padding: "4px 6px",
        textAlign: "right",
        boxSizing: "border-box",
        flexShrink: 0,
        ...(onContextMenu ? { cursor: "context-menu" } : {}),
        ...(width !== undefined ? { width } : {}),
        ...style,
      }}
    >
      {value !== null ? value.toFixed(prec) : "—"}
    </div>
  );
}

// ── SpBox ─────────────────────────────────────────────────────────────────────

/** Click-to-edit setpoint box. */
export function SpBox({ value, prec = 3, width, onCommit, disabled = false, onContextMenu }: {
  value: number | null;
  prec?: number;
  width?: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const base: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: fontSize.mono,
    borderRadius: 3,
    padding: "4px 6px",
    boxSizing: "border-box",
    flexShrink: 0,
    ...(width !== undefined ? { width } : {}),
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            const n = parseFloat(input);
            if (!isNaN(n)) onCommit(n);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        onContextMenu={onContextMenu}
        style={{ ...base, background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.spText }}
      />
    );
  }

  return (
    <div
      onClick={() => {
        if (!disabled) {
          setInput(value !== null ? value.toFixed(prec) : "");
          setEditing(true);
        }
      }}
      onContextMenu={onContextMenu}
      title={disabled ? undefined : "Click to set"}
      style={{
        ...base,
        background: colors.spBg,
        border: `1px solid ${colors.spBorder}`,
        color: colors.spText,
        textAlign: "right",
        cursor: disabled ? "default" : "text",
        userSelect: "none",
      }}
    >
      {value !== null ? value.toFixed(prec) : "—"}
    </div>
  );
}

// ── TweakValue ────────────────────────────────────────────────────────────────

/** Click-to-edit step size with ↑ ×10 / ↓ ÷10 keyboard scaling. */
export function TweakValue({ value, onCommit, style, onContextMenu }: {
  value: number | null;
  onCommit: (n: number) => void;
  style?: React.CSSProperties;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const base: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: fontSize.label,
    borderRadius: 3,
    padding: "2px 4px",
    boxSizing: "border-box",
    textAlign: "center",
    ...style,
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") {
            const n = parseFloat(input);
            if (!isNaN(n)) onCommit(n);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const cur = parseFloat(input);
            if (!isNaN(cur)) {
              setInput(String(parseFloat((e.key === "ArrowUp" ? cur * 10 : cur / 10).toPrecision(4))));
            }
          }
        }}
        onBlur={() => setEditing(false)}
        style={{ ...base, background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.spText, cursor: "auto" }}
      />
    );
  }

  return (
    <div
      onClick={() => { setInput(value !== null ? String(value) : ""); setEditing(true); }}
      onContextMenu={onContextMenu}
      title="Click to change step (↑ ×10, ↓ ÷10)"
      style={{
        ...base,
        color: colors.spText,
        background: colors.spBg,
        border: `1px solid ${colors.spBorder}`,
        cursor: "text",
        userSelect: "none",
      }}
    >
      {value !== null ? String(value) : "—"}
    </div>
  );
}

// ── TweakButton ───────────────────────────────────────────────────────────────

/** Styled ‹ / › tweak button. Pass direction as children. */
export function TweakButton({ onClick, disabled = false, size = 24, children }: {
  onClick: () => void;
  disabled?: boolean;
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: colors.tweakBg,
        color: colors.tweakFg,
        border: `1px solid ${colors.tweakBorder}`,
        borderRadius: 3,
        width: size,
        height: size,
        fontSize: size - 8,
        lineHeight: "1",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── UnitLabel ─────────────────────────────────────────────────────────────────

/** Unit label (eV, mA, Torr…). */
export function UnitLabel({ children, width }: { children: string; width?: number }) {
  return (
    <span style={{ fontSize: fontSize.label, color: colors.unit, flexShrink: 0, ...(width !== undefined ? { width, display: "inline-block" } : {}) }}>
      {children}
    </span>
  );
}

// ── RelatedDisplay ────────────────────────────────────────────────────────────

/** Button that opens a related display panel. */
export function RelatedDisplay({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: colors.relatedBg,
        border: `1px solid ${colors.relatedBorder}`,
        color: colors.relatedFg,
        borderRadius: 3,
        fontSize: fontSize.label,
        fontFamily: "sans-serif",
        padding: "1px 6px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

/** Flex row with gap, optional top margin and context menu. */
export function Row({ children, mt = 0, onContextMenu }: {
  children: React.ReactNode;
  mt?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, marginTop: mt }}
    >
      {children}
    </div>
  );
}
