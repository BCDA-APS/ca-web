import { Component } from "react";
import type { ErrorInfo } from "react";

// Catches crashes caused by unexpected PV data during IOC reconnection.
// Auto-resets after a short delay so the user doesn't need to reload the page.
export class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] caught:", error, info);
    this.resetTimer = setTimeout(() => this.setState({ error: null }), 3000);
  }
  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#0d1b2a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "sans-serif", color: "#90caf9" }}>
          <div style={{ fontSize: 14 }}>Recovering from render error…</div>
          <div style={{ fontSize: 11, color: "#546e8a", maxWidth: 400, textAlign: "center" }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ background: "#1a3a5c", border: "1px solid #4a90d9", color: "#90caf9", borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>
            Retry now
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
