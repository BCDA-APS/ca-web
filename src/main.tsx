import { createRoot } from "react-dom/client";
import "./index.css";
import { Provider } from "react-redux";
import { OutlineProvider, store } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./lib/pvwsWriter";
import { REGISTRY, resolveActiveId, DeploymentContext } from "./lib/deployment";
import { DeploymentPicker } from "./DeploymentPicker";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
const activeId = resolveActiveId();

if (!activeId) {
  root.render(<DeploymentPicker />);
} else {
  const cfg = REGISTRY[activeId];
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
}
