/// <reference types="vite/client" />

declare module "virtual:deployment-path-status" {
  export const PATH_STATUS: Record<string, { missing: string[] }>;
}
