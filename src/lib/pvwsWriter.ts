// Minimal WebSocket writer for pvws.
// cs-web-lib handles subscriptions (reads); we handle writes directly.
// pvws requires a PV to be subscribed on the same connection before it can be written.

class PvwsWriter {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private subscribed = new Set<string>();
  private url: string | null = null;

  connect(socket?: string, ssl?: boolean) {
    if (socket) this.url = `${ssl ? "wss" : "ws"}://${socket}/pvws/pv`;
    if (!this.url) throw new Error("pvwsWriter.connect: socket not configured");
    if (this.ws) return;
    console.log("[pvwsWriter] connecting to", this.url);
    this.ws = new WebSocket(this.url);
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

  // Pre-subscribe a PV so pvws has time to open the CA channel before a write arrives.
  // Call this from useEffect when a write-only widget (e.g. caMessageButton) mounts.
  subscribe(pvName: string) {
    if (!pvName) return;
    const fullName = pvName.startsWith("ca://") ? pvName : `ca://${pvName}`;
    if (this.subscribed.has(fullName)) return;
    this.subscribed.add(fullName);
    const msg = JSON.stringify({ type: "subscribe", pvs: [fullName] });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.queue.push(msg);
      this.connect();
    }
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
