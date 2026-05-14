// Per-deployment localStorage namespace so layouts/positions don't leak across
// deployments. The active id is set once at boot by loadDeployment().
//
// Keys produced: ca-web.<deploymentId>.<suffix>
//
// Suffixes in use:
//   panel:layouts       — saved layout drafts (SavedLayout[])
//   panel:<panelId>     — per-panel position + locked
//   overlay:<file>      — per-overlay position + locked
//   panel-hidden        — hidden panel ids (string[])
//   stripchart:<id>     — StripChart per-instance state

let activeDeploymentId: string | null = null;

const OLD_KEY_PATTERNS: RegExp[] = [
  /^panel:layouts$/,
  /^panel:[^.]+$/,
  /^overlay:.+$/,
  /^panel-hidden$/,
  /^stripchart:.+$/,
];

function isAlreadyNamespaced(key: string): boolean {
  return key.startsWith("ca-web.");
}

// Move any pre-namespace keys under the active deployment's namespace. Skips
// keys that already exist at the destination so re-runs are idempotent.
function migrateOldKeys(deploymentId: string) {
  const toMove: { oldKey: string; newKey: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || isAlreadyNamespaced(k)) continue;
    if (!OLD_KEY_PATTERNS.some(rx => rx.test(k))) continue;
    toMove.push({ oldKey: k, newKey: `ca-web.${deploymentId}.${k}` });
  }
  for (const { oldKey, newKey } of toMove) {
    try {
      if (localStorage.getItem(newKey) !== null) {
        localStorage.removeItem(oldKey);
        continue;
      }
      const val = localStorage.getItem(oldKey);
      if (val !== null) localStorage.setItem(newKey, val);
      localStorage.removeItem(oldKey);
    } catch { /* ignore */ }
  }
}

export function setActiveDeploymentId(id: string) {
  activeDeploymentId = id;
  try { migrateOldKeys(id); } catch { /* ignore */ }
}

export function getActiveDeploymentId(): string | null {
  return activeDeploymentId;
}

export function layoutKey(suffix: string): string {
  if (!activeDeploymentId) {
    // Pre-boot reads should never happen, but if they do, fall back to a
    // shared bucket so we don't silently lose writes.
    return `ca-web.__pending.${suffix}`;
  }
  return `ca-web.${activeDeploymentId}.${suffix}`;
}
