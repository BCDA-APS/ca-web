import { createRoot } from "react-dom/client";
import "./index.css";
import { Provider } from "react-redux";
import { OutlineProvider, store } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./lib/pvwsWriter";
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
  loadDeployment(activeId).then(cfg => {
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
