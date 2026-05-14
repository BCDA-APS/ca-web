// Replace window.WebSocket with a stub for one specific URL so cs-web-lib's
// hardcoded 500ms reconnect loop never fires and queued sendMessage() calls
// silently no-op. The library guards every send() with
//   socket.readyState === WebSocket.OPEN
// so leaving the stub in CONNECTING means messages never go out, no error,
// and every PV simply stays in its disconnected default state.

class StubWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readyState = 0;
  url: string;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(url: string) { this.url = url; }
  send() { /* never connected — drop */ }
  close() { this.readyState = 3; }
  addEventListener() { /* never fires */ }
  removeEventListener() { /* never fires */ }
  dispatchEvent() { return true; }
}

export function installPvwsWebSocketStub(targetUrl: string) {
  const Real = window.WebSocket;
  const Patched = new Proxy(Real, {
    construct(target, args) {
      if (String(args[0]) === targetUrl) {
        return new StubWebSocket(String(args[0])) as unknown as WebSocket;
      }
      return Reflect.construct(target, args);
    },
  });
  window.WebSocket = Patched;
}
