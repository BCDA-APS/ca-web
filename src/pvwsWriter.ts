// Minimal WebSocket writer for pvws.
// cs-web-lib handles subscriptions (reads); we handle writes directly.
// pvws requires a PV to be subscribed on the same connection before it can be written.

const PVWS_URL = `ws://${import.meta.env.VITE_PVWS_SOCKET ?? "localhost:8080"}/pvws/pv`;

class PvwsWriter {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private subscribed = new Set<string>();

  connect() {
    if (this.ws) return;
    console.log("[pvwsWriter] connecting to", PVWS_URL);
    this.ws = new WebSocket(PVWS_URL);
    this.ws.onopen = () => {
      console.log("[pvwsWriter] connected");
      this.queue.forEach(msg => this.ws!.send(msg));
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "error") console.error("[pvwsWriter] server error:", msg.message);
    };
    this.ws.onerror = (e) => console.error("[pvwsWriter] error", e);
    this.ws.onclose = () => {
      console.warn("[pvwsWriter] closed");
      this.ws = null;
      this.subscribed.clear();
    };
  }

  write(pvName: string, value: number | string) {
    const fullName = pvName.startsWith("ca://") ? pvName : `ca://${pvName}`;
    const msgs: string[] = [];
    if (!this.subscribed.has(fullName)) {
      msgs.push(JSON.stringify({ type: "subscribe", pvs: [fullName] }));
      this.subscribed.add(fullName);
    }
    msgs.push(JSON.stringify({ type: "write", pv: fullName, value }));
    console.log("[pvwsWriter] write", fullName, "=", value);
    if (this.ws?.readyState === WebSocket.OPEN) {
      msgs.forEach(m => this.ws!.send(m));
    } else {
      this.queue.push(...msgs);
      this.connect();
    }
  }
}

export const pvwsWriter = new PvwsWriter();
