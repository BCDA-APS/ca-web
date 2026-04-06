import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { OutlineProvider, store } from "@diamondlightsource/cs-web-lib";
import { pvwsWriter } from "./pvwsWriter";
import App from "./App";

pvwsWriter.connect();

const container = document.getElementById("root")!;
createRoot(container).render(
  <Provider store={store()}>
    <OutlineProvider>
      <App />
    </OutlineProvider>
  </Provider>
);
