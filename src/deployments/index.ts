import { config as nefarianConfig } from "./nefarian";
import { config as config29id } from "./29id/index";

export type { DeploymentConfig, Tab, PanelConfig } from "./types";

export const config =
  import.meta.env.VITE_DEPLOYMENT === "29id" ? config29id : nefarianConfig;
