// Per-deployment layout persistence. State lives as JSON files under
// src/deployments/<id>/layouts/ and is served by the layouts-api Vite plugin
// (active in both `npm run dev` and `npm run preview`).
//
// Files:
//   current.json        — live state, auto-saved (debounced) on every change.
//   <name>.json         — named drafts saved from the gear menu.
//
// Both files share the same flat shape: a record keyed by suffix
// ("panel:<id>", "overlay:<file>", "panel-hidden", "stripchart:<id>", and the
// special "__overlays__" array used to restore overlay panels).
//
// Boot path: main.tsx calls hydrateLayouts(id) after loadDeployment() and
// before rendering. Sync getters read from the in-memory cache populated by
// that fetch. Writes update the cache immediately and PUT current.json on a
// short debounce.
//
// If the server is unreachable on boot we log loudly and disable writes — the
// session still works against in-memory state, but nothing persists. No
// silent fallback to localStorage.

export type LayoutSnapshot = Record<string, unknown>;

let activeDeploymentId: string | null = null;
let cache: LayoutSnapshot = {};
let hydrated = false;
let writeDisabled = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let dirty = false;

const SAVE_DEBOUNCE_MS = 250;
const NAME_RX = /^[a-z0-9-]{1,64}$/;

export function getActiveDeploymentId(): string | null {
  return activeDeploymentId;
}

export async function hydrateLayouts(id: string): Promise<void> {
  activeDeploymentId = id;
  cache = {};
  writeDisabled = false;
  hydrated = false;

  let migrated = false;
  try {
    const r = await fetch(`/api/layouts/${id}/current`);
    if (r.ok) {
      const json = await r.json();
      if (json && typeof json === "object" && !Array.isArray(json)) {
        cache = json as LayoutSnapshot;
      }
    } else if (r.status === 404) {
      // No current.json yet — first run for this deployment. Pick up any
      // legacy ca-web.<id>.* localStorage entries from a pre-folder build.
      const legacy = drainLegacyLocalStorage(id);
      if (Object.keys(legacy).length > 0) {
        cache = legacy;
        migrated = true;
      }
    } else {
      console.error("[layouts] hydrate failed:", r.status, await r.text());
      writeDisabled = true;
    }
  } catch (e) {
    console.error("[layouts] layouts API unreachable, persistence disabled:", e);
    writeDisabled = true;
  }

  hydrated = true;
  if (migrated) scheduleSave();
}

export function layoutGet<T = unknown>(suffix: string): T | undefined {
  return cache[suffix] as T | undefined;
}

export function layoutSet(suffix: string, value: unknown): void {
  if (!hydrated) {
    console.warn("[layouts] write before hydrate:", suffix);
  }
  cache[suffix] = value;
  scheduleSave();
}

export function layoutDelete(suffix: string): void {
  delete cache[suffix];
  scheduleSave();
}

function scheduleSave(): void {
  if (writeDisabled || !activeDeploymentId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveCurrent(); }, SAVE_DEBOUNCE_MS);
}

async function saveCurrent(): Promise<void> {
  saveTimer = null;
  if (!activeDeploymentId || writeDisabled) return;
  // If a save is already in flight, mark dirty and bail — the in-flight save
  // will scheduleSave again on completion so the latest cache state lands.
  if (inflight) { dirty = true; return; }
  const id = activeDeploymentId;
  const snapshot = JSON.stringify(cache);
  dirty = false;
  inflight = (async () => {
    try {
      const r = await fetch(`/api/layouts/${id}/current`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshot,
      });
      if (!r.ok) console.error("[layouts] PUT current failed:", r.status);
    } catch (e) {
      console.error("[layouts] PUT current failed:", e);
    } finally {
      inflight = null;
      if (dirty) scheduleSave();
    }
  })();
  await inflight;
}

// ── Named drafts (one file per draft) ────────────────────────────────────────

export async function listLayouts(): Promise<string[]> {
  if (!activeDeploymentId) return [];
  try {
    const r = await fetch(`/api/layouts/${activeDeploymentId}`);
    if (!r.ok) return [];
    const all = (await r.json()) as string[];
    return all.filter(n => n !== "current");
  } catch { return []; }
}

export async function readLayout(name: string): Promise<LayoutSnapshot | null> {
  if (!activeDeploymentId || !NAME_RX.test(name)) return null;
  try {
    const r = await fetch(`/api/layouts/${activeDeploymentId}/${name}`);
    if (!r.ok) return null;
    return (await r.json()) as LayoutSnapshot;
  } catch { return null; }
}

export async function writeLayout(name: string, data: LayoutSnapshot): Promise<boolean> {
  if (!activeDeploymentId || !NAME_RX.test(name)) return false;
  try {
    const r = await fetch(`/api/layouts/${activeDeploymentId}/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return r.ok;
  } catch { return false; }
}

export async function deleteLayout(name: string): Promise<boolean> {
  if (!activeDeploymentId || !NAME_RX.test(name) || name === "current") return false;
  try {
    const r = await fetch(`/api/layouts/${activeDeploymentId}/${name}`, { method: "DELETE" });
    return r.ok;
  } catch { return false; }
}

export function slugifyLayoutName(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ── Legacy migration ─────────────────────────────────────────────────────────

function drainLegacyLocalStorage(id: string): LayoutSnapshot {
  const prefix = `ca-web.${id}.`;
  const out: LayoutSnapshot = {};
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    toRemove.push(k);
    const suffix = k.slice(prefix.length);
    // The old drafts list ("panel:layouts") becomes per-name files via the
    // gear menu — we don't auto-migrate it because draft names need slugging.
    if (suffix === "panel:layouts") continue;
    const raw = localStorage.getItem(k);
    if (raw == null) continue;
    try { out[suffix] = JSON.parse(raw); } catch { /* skip malformed */ }
  }
  for (const k of toRemove) localStorage.removeItem(k);
  return out;
}
