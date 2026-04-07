import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { OutlineProvider, store } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./pvwsWriter";
import App from "./App";

pvwsWriter.connect();

const pvwsSocket = import.meta.env.VITE_PVWS_SOCKET ?? "localhost:8080";
const pvwsSsl    = import.meta.env.VITE_PVWS_SSL === "true";

const container = document.getElementById("root")!;
createRoot(container).render(
  <Provider store={store({ PVWS_SOCKET: pvwsSocket, PVWS_SSL: pvwsSsl })}>
    <OutlineProvider>
      <App />
    </OutlineProvider>
  </Provider>
);
