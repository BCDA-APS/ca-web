// One-shot probe so we can detect a dead pvws gateway before cs-web-lib
// starts its 500ms reconnect loop (which has no max-retries option).
export function probeWebSocket(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(ok);
    };
    const ws = new WebSocket(url);
    ws.onopen = () => finish(true);
    ws.onerror = () => finish(false);
    ws.onclose = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}
