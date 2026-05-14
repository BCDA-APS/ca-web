import { createRoot } from "react-dom/client";
import "./index.css";
import { Provider } from "react-redux";
import { OutlineProvider, store } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./lib/pvwsWriter";
import { probeWebSocket } from "./lib/pvwsProbe";
import { loadDeployment, resolveActiveId, clearActive, DeploymentContext } from "./lib/deployment";
import { DeploymentPicker } from "./DeploymentPicker";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
const activeId = resolveActiveId();

function renderBootError(message: string) {
  root.render(
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", background: "rgb(222,222,227)", color: "#0a1828", padding: 24, textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Failed to load deployment</div>
        <div style={{ fontSize: 13, color: "#546e8a", marginBottom: 16 }}>{message}</div>
        <button onClick={() => window.location.reload()} style={{ background: "#1a3a5c", border: "1px solid #4a90d9", color: "#90caf9", borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>Reload</button>
      </div>
    </div>
  );
}

function renderGatewayError(wsUrl: string) {
  function switchDeployment() {
    clearActive();
    const url = new URL(window.location.href);
    url.searchParams.delete("deployment");
    window.location.assign(url.toString());
  }
  root.render(
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", background: "rgb(222,222,227)", color: "#0a1828", padding: 24, textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#c62828" }}>EPICS gateway unreachable</div>
        <div style={{ fontSize: 13, color: "#546e8a", marginBottom: 16 }}>Cannot connect to {wsUrl}. PV reads and writes are unavailable.</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={() => window.location.reload()} style={{ background: "#1a3a5c", border: "1px solid #4a90d9", color: "#90caf9", borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>Retry</button>
          <button onClick={switchDeployment} style={{ background: "transparent", border: "1px solid #546e8a", color: "#0a1828", borderRadius: 4, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>Switch deployment…</button>
        </div>
      </div>
    </div>
  );
}

if (!activeId) {
  root.render(<DeploymentPicker />);
} else {
  loadDeployment(activeId).then(async cfg => {
    const wsUrl = `${cfg.pvws.ssl ? "wss" : "ws"}://${cfg.pvws.socket}/pvws/pv`;
    const wsAlive = await probeWebSocket(wsUrl, 3000);
    if (!wsAlive) {
      console.error("[main] pvws gateway unreachable:", wsUrl);
      renderGatewayError(wsUrl);
      return;
    }
    pvwsWriter.connect(cfg.pvws.socket, cfg.pvws.ssl);
    root.render(
      <Provider store={store({ PVWS_SOCKET: cfg.pvws.socket, PVWS_SSL: cfg.pvws.ssl } as Parameters<typeof store>[0])}>
        <OutlineProvider>
          <DeploymentContext.Provider value={cfg}>
            <App />
          </DeploymentContext.Provider>
        </OutlineProvider>
      </Provider>
    );
  }).catch(err => {
    console.error("[main] loadDeployment failed:", err);
    renderBootError(String(err?.message ?? err));
  });
}
