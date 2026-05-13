import { createContext } from "react";
import type { ComponentType } from "react";

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
}

export interface QuickLink {
  label: string;
  file: string;
  macros?: Record<string, string>;
}

export interface DeploymentConfig {
  id: string;
  title: string;
  pvws: { socket: string; ssl: boolean };
  tabs: Tab[];
  panelDefaults: Record<string, { x: number; y: number }>;
  defaultHiddenPanels?: string[];
  quickLinks?: QuickLink[];
  tabPanels: Record<number, PanelConfig[]>;
}

const modules = import.meta.glob<{ config: DeploymentConfig }>(
  "../deployments/*/index.tsx",
  { eager: true },
);

export const REGISTRY: Record<string, DeploymentConfig> = {};
for (const path in modules) {
  const cfg = modules[path].config;
  if (!cfg?.id) throw new Error(`Deployment at ${path} is missing config.id`);
  const folder = path.split("/").slice(-2, -1)[0];
  if (folder !== cfg.id) {
    throw new Error(`Deployment id "${cfg.id}" must match its folder name "${folder}"`);
  }
  if (REGISTRY[cfg.id]) throw new Error(`Duplicate deployment id: ${cfg.id}`);
  REGISTRY[cfg.id] = cfg;
}

const STORAGE_KEY = "ca-web.deployment";

export function resolveActiveId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("deployment");
  if (fromUrl && REGISTRY[fromUrl]) {
    localStorage.setItem(STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  const fromStorage = localStorage.getItem(STORAGE_KEY);
  if (fromStorage && REGISTRY[fromStorage]) return fromStorage;
  return null;
}

export function clearActive() {
  localStorage.removeItem(STORAGE_KEY);
}

export const DeploymentContext = createContext<DeploymentConfig | null>(null);
