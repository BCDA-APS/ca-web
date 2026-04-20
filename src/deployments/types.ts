import type { ComponentType } from "react";

export interface Tab {
  id: number;
  icon: string;
  label: string;
  color?: string;   // optional accent color for the top bar when this tab is active
}

export interface PanelConfig {
  id: string;
  title: string;
  Content: ComponentType;
}

export interface DeploymentConfig {
  title: string;
  tabs: Tab[];
  panelDefaults: Record<string, { x: number; y: number }>;
  tabPanels: Record<number, PanelConfig[]>;
}
