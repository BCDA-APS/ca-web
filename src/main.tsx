import { createRoot } from "react-dom/client";
import "./index.css";
import { Provider } from "react-redux";
import { OutlineProvider, store } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./lib/pvwsWriter";
import { probeWebSocket } from "./lib/pvwsProbe";
import { installPvwsWebSocketStub } from "./lib/wsStub";
import { loadDeployment, resolveActiveId, DeploymentContext } from "./lib/deployment";
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

if (!activeId) {
  root.render(<DeploymentPicker />);
} else {
  loadDeployment(activeId).then(async cfg => {
    const wsUrl = `${cfg.pvws.ssl ? "wss" : "ws"}://${cfg.pvws.socket}/pvws/pv`;
    const wsAlive = await probeWebSocket(wsUrl, 3000);
    if (wsAlive) {
      pvwsWriter.connect(cfg.pvws.socket, cfg.pvws.ssl);
    } else {
      // Pin the gateway socket into a no-op stub so cs-web-lib's 500ms reconnect
      // loop never fires and queued sends never throw. PVs stay in their default
      // disconnected state and the App renders normally with a banner on top.
      console.error("[main] pvws gateway unreachable:", wsUrl);
      installPvwsWebSocketStub(wsUrl);
    }
    root.render(
      <Provider store={store({ PVWS_SOCKET: cfg.pvws.socket, PVWS_SSL: cfg.pvws.ssl } as Parameters<typeof store>[0])}>
        <OutlineProvider>
          <DeploymentContext.Provider value={cfg}>
            <App wsDown={!wsAlive} wsUrl={wsUrl} />
          </DeploymentContext.Provider>
        </OutlineProvider>
      </Provider>
    );
  }).catch(err => {
    console.error("[main] loadDeployment failed:", err);
    renderBootError(String(err?.message ?? err));
  });
}
