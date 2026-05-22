import { createContext } from "react";
import type { ComponentType } from "react";

// Panels broadcast their current inner content-area size so child widgets
// (e.g. StripChart's SVG) can resize without DOM measurement.
export const PanelSizeContext = createContext<{ w: number; h: number } | null>(null);

export interface Tab {
  id: number;
  icon: string;
  label: string;
  color?: string;
}

export interface PanelConfig {
  id: string;
  title: string;
  Content: ComponentType;
  defaultSize?: { w: number; h: number };
  // How content should respond when the panel is resized beyond defaultSize.
  // - undefined / "none" (default): content stays at natural size; panel just grows around it.
  // - "transform": apply uniform CSS scale based on ps.w/defaultSize.w. Good for
  //   form/widget panels — text becomes slightly fuzzy at non-integer scales but
  //   layout stays intact. Requires defaultSize.
  // - "fit": content handles its own sizing (e.g. StripChart via PanelSizeContext,
  //   or SVG diagrams using viewBox). DraggablePanel does nothing extra.
  scale?: "transform" | "fit" | "none";
  // Override the resize handle behaviour. By default it's freeform; if
  // `scale === "transform"` it's aspect-locked (panel keeps the design
  // aspect). Set this explicitly to true/false to override either way
  // (e.g. a "fit" panel like CameraViewer that wants aspect lock so the
  // image doesn't develop empty letterbox margins on non-proportional drag).
  aspectLock?: boolean;
}

export interface QuickLink {
  label: string;
  file: string;
  macros?: Record<string, string>;
}

export interface SavedOverlay {
  file: string;
  macros: Record<string, string>;
  label: string;
  pos: { x: number; y: number };
  locked?: boolean;
}

export interface SavedCameraOverlay {
  label: string;
  prefix?: string;
  knownCameras?: Array<{ label: string; prefix: string }>;
  pos: { x: number; y: number };
  size?: { w: number; h: number };
  tabId?: number;
}

export interface SavedScanViewOverlay {
  label: string;
  recordPv: string;
  defaultDetectors?: number[];
  pos: { x: number; y: number };
  size?: { w: number; h: number };
  tabId?: number;
  /** Snapshot of the widget's localStorage state (scanviewchart:<id>) so
   * user customizations (enabled detectors, colors, Y mode) survive
   * save/restore. */
  state?: Record<string, unknown>;
}

export interface SavedStripChartOverlay {
  label: string;
  initialPvs?: import("../widgets/StripChart").TraceConfig[];
  pos: { x: number; y: number };
  size?: { w: number; h: number };
  tabId?: number;
  /** Snapshot of the widget's localStorage state (stripchart:<id>). */
  state?: Record<string, unknown>;
}

export interface SavedLayout {
  name: string;
  // w/h are optional for backwards-compat: layouts written before sizes were
  // tracked still load fine; DraggablePanel falls back to defaultSize.
  positions: Record<string, { x: number; y: number; w?: number; h?: number; locked: boolean }>;
  hidden?: string[];
  /** Panels whose home tab differs from a tab they've been "borrowed"
   * onto via "Open react…". Each entry: the panel's id and the tab ids
   * it should appear on (in addition to its home tab). */
  borrowed?: Array<{ id: string; tabIds: number[] }>;
  overlays?: SavedOverlay[];
  cameras?: SavedCameraOverlay[];
  scanviews?: SavedScanViewOverlay[];
  stripcharts?: SavedStripChartOverlay[];
}

/** A spawnable panel template surfaced in the "Open react…" picker.
 * No prompts: clicking Open immediately runs `spawn({})`. With prompts:
 * the picker shows an inline form for the listed keys, then calls
 * `spawn(values)`. Use prompts for caqtdm-style macros (P=29idTest, etc.). */
export interface PanelTemplate {
  id: string;
  title: string;
  prompts?: Array<{
    key: string;
    label: string;
    default?: string;
    placeholder?: string;
  }>;
  spawn: (values: Record<string, string>) => void;
}

export interface DeploymentConfig {
  id: string;
  title: string;
  pvws: { socket: string; ssl: boolean };
  tabs: Tab[];
  panelDefaults: Record<string, { x: number; y: number }>;
  defaultHiddenPanels?: string[];
  quickLinks?: QuickLink[];
  // Shared, team-curated layouts that ship with the deployment build.
  // Survive cleared browser / new machine / new deploy since they live in
  // the bundled config.json. Author drafts via the gear menu and use
  // "Copy as JSON" to paste an entry here.
  layouts?: SavedLayout[];
  tabPanels: Record<number, PanelConfig[]>;
  /** Spawnable templates listed in the "Open react…" picker alongside
   * static panels. Each can take macro-style prompts (e.g. ScanView
   * asking for an IOC prefix). */
  templates?: PanelTemplate[];
}

// Shape of a deployment's config.json on disk. tabPanels lives in TSX (it
// carries component references); paths is build-time-only (read by
// vite.config.ts) and stripped before producing the runtime DeploymentConfig.
export type DeploymentConfigData = Omit<DeploymentConfig, "tabPanels"> & {
  paths?: unknown;
};

type DeploymentLoader = () => Promise<{ config: DeploymentConfig }>;

const modules = import.meta.glob<{ config: DeploymentConfig }>(
  "../deployments/*/index.tsx",
);

const LOADERS: Record<string, DeploymentLoader> = {};
const loadedById: Record<string, DeploymentConfig> = {};

for (const path in modules) {
  const folder = path.split("/").slice(-2, -1)[0];
  if (LOADERS[folder]) {
    throw new Error(`Duplicate deployment folder: ${folder}`);
  }
  LOADERS[folder] = modules[path];
}

export function listDeploymentIds(): string[] {
  return Object.keys(LOADERS);
}

export async function loadDeployment(id: string): Promise<DeploymentConfig> {
  if (loadedById[id]) return loadedById[id];
  const loader = LOADERS[id];
  if (!loader) throw new Error(`Unknown deployment id: ${id}`);
  const mod = await loader();
  const cfg = mod.config;
  if (!cfg?.id) throw new Error(`Deployment in folder "${id}" is missing config.id`);
  if (cfg.id !== id) {
    throw new Error(`Deployment id "${cfg.id}" must match its folder name "${id}"`);
  }
  loadedById[id] = cfg;
  return cfg;
}

const STORAGE_KEY = "ca-web.deployment";

export function resolveActiveId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("deployment");
  if (fromUrl && LOADERS[fromUrl]) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage && LOADERS[fromStorage]) return fromStorage;
  return null;
}

export function clearActive() {
  localStorage.removeItem(STORAGE_KEY);
}

export const DeploymentContext = createContext<DeploymentConfig | null>(null);

// Clear the cached deployment in dev so HMR picks up edits to a deployment's
// index.tsx without a hard reload.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const k of Object.keys(loadedById)) delete loadedById[k];
  });
}
