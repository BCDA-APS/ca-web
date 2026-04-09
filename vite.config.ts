import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

// ── synApps display path resolution ───────────────────────────────────────────
//
// Parses the caQtDM startup script directly to build CAQTDM_DISPLAY_PATH,
// including the sourced release file and all append_QDP* calls.
// No paths are hardcoded here — upgrading synApps or adding new directories
// to the startup script is picked up automatically.

const STARTUP_SCRIPT = "/net/s29dserv/xorApps/ui/start_epics_29id";
const ADL2UI        = "/APSshare/bin/adl2ui";
const CACHE_DIR     = path.join(process.cwd(), ".ui-cache");

// Convert an .adl file to .ui, cache the result in CACHE_DIR, return the
// cached path. Returns null if conversion fails.
function convertAdl(adlPath: string): string | null {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const baseName   = path.basename(adlPath, ".adl");
  const cachedPath = path.join(CACHE_DIR, `${baseName}.ui`);

  if (fs.existsSync(cachedPath)) {
    console.log(`[ui-search-path] serving cached conversion: ${cachedPath}`);
    return cachedPath;
  }

  console.log(`[ui-search-path] converting: ${adlPath}`);
  const result = spawnSync(ADL2UI, [adlPath], { cwd: CACHE_DIR, timeout: 15000 });

  if (result.status !== 0) {
    console.error(`[ui-search-path] conversion failed for ${adlPath}: ${result.stderr?.toString()}`);
    return null;
  }

  return fs.existsSync(cachedPath) ? cachedPath : null;
}

function buildSearchPaths(): string[] {
  if (!fs.existsSync(STARTUP_SCRIPT)) {
    console.warn(`[ui-search-path] Startup script not found: ${STARTUP_SCRIPT}`);
    return [];
  }

  const lines = fs.readFileSync(STARTUP_SCRIPT, "utf8").split("\n");
  const vars: Record<string, string> = {};

  // Pass 1: collect simple KEY=VALUE assignments (no shell substitution).
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=([^$({\s][^\s]*)$/);
    if (m) vars[m[1]] = m[2];
  }

  // Pass 2: find and parse the sourced release file (`. ${UI_DIR}/release_X.Y`).
  for (const line of lines) {
    const m = line.trim().match(/^\.\s+(.+)$/);
    if (!m) continue;
    const releasePath = m[1].replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, k) => vars[k] ?? "");
    if (!fs.existsSync(releasePath)) continue;
    for (const rl of fs.readFileSync(releasePath, "utf8").split("\n")) {
      const rv = rl.match(/^([A-Z_][A-Z0-9_]*)=([^#\s].*)$/);
      if (rv) vars[rv[1]] = rv[2].trim();
    }
    break;
  }

  function subst(s: string): string {
    return s.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, k) => vars[k] ?? "");
  }

  const paths: string[] = [];

  // Pass 3: process append_QDP*, append_QDP_module, append_QDP_uidir calls
  // and the final CAQTDM_DISPLAY_PATH=... line.
  for (const line of lines) {
    const t = line.trim();

    // append_QDP /some/path
    let m = t.match(/^append_QDP\s+(\S+)$/);
    if (m) {
      const p = subst(m[1]);
      if (p && p !== ".") paths.push(p);
      continue;
    }

    // append_QDP_module VAR subdir
    m = t.match(/^append_QDP_module\s+(\S+)\s+(\S+)$/);
    if (m) {
      const base = vars[m[1]];
      if (base) {
        paths.push(path.join(base, m[2]));
        paths.push(path.join(base, m[2], "autoconvert"));
      }
      continue;
    }

    // append_QDP_uidir subdir
    m = t.match(/^append_QDP_uidir\s+(\S+)$/);
    if (m) {
      const uiDir = vars["UI_DIR"] ?? "";
      const uiSubdir = vars["UI_SUBDIR"] ?? "";
      paths.push(path.join(uiDir, uiSubdir, m[1]));
      paths.push(path.join(`${uiDir}-autoconvert`, uiSubdir, m[1]));
      continue;
    }

    // Final CAQTDM_DISPLAY_PATH=$CAQTDM_DISPLAY_PATH:extra_path
    m = t.match(/^CAQTDM_DISPLAY_PATH=\$CAQTDM_DISPLAY_PATH:(.+)$/);
    if (m) {
      paths.push(subst(m[1]));
      continue;
    }
  }

  const existing = paths.filter(p => fs.existsSync(p));
  console.log(`[ui-search-path] ${existing.length}/${paths.length} search paths available`);
  return existing;
}

// Builds a list of all available .ui files from public/ui/ and NFS search paths.
// .adl files are included as .ui (the serving layer converts them transparently).
function buildFileList(searchPaths: string[]): { name: string; dir: string }[] {
  const files: { name: string; dir: string }[] = [];

  // public/ui/ first
  const publicUiDir = path.join(process.cwd(), "public", "ui");
  try {
    for (const f of fs.readdirSync(publicUiDir)) {
      if (f.endsWith(".ui")) files.push({ name: f, dir: "app" });
    }
  } catch {}

  // NFS search paths
  for (const dir of searchPaths) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".ui"))  files.push({ name: f,                         dir: path.basename(dir) });
        if (f.endsWith(".adl")) files.push({ name: f.replace(/\.adl$/, ".ui"), dir: path.basename(dir) });
      }
    } catch {}
  }

  return files;
}

// Vite plugin: intercepts GET /ui/<filename> and searches NFS paths as fallback.
function uiSearchPathPlugin() {
  const searchPaths = buildSearchPaths();
  const uiFileList  = buildFileList(searchPaths);
  console.log(`[ui-search-path] ${uiFileList.length} display files indexed`);

  return {
    name: "ui-search-path",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = req.url ?? "";

        // File index endpoint for the file picker.
        if (url === "/api/ui-files" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(uiFileList));
          return;
        }

        if (!url.startsWith("/ui/")) return next();

        const filename = url.slice(4).split("?")[0]; // strip /ui/ prefix and query
        if (!filename) return next();

        // If the file exists in public/ui/, let Vite serve it normally.
        const publicPath = path.join(process.cwd(), "public", "ui", filename);
        if (fs.existsSync(publicPath)) return next();

        // If the URL contains // the original filename was an absolute path (e.g.
        // /APSshare/adlsys/sr/fe/SR_Status.ui stored in the .ui file). Extract and
        // serve it directly without searching.
        const doubleSlash = filename.indexOf("//");
        if (doubleSlash !== -1) {
          const absPath = "/" + filename.slice(doubleSlash + 2);
          if (fs.existsSync(absPath)) {
            console.log(`[ui-search-path] found (absolute): ${absPath}`);
            res.setHeader("Content-Type", "application/xml");
            fs.createReadStream(absPath).pipe(res);
            return;
          }
          // Try .adl fallback for absolute paths.
          const absAdlPath = absPath.replace(/\.ui$/, ".adl");
          if (fs.existsSync(absAdlPath)) {
            const converted = convertAdl(absAdlPath);
            if (converted) {
              res.setHeader("Content-Type", "application/xml");
              fs.createReadStream(converted).pipe(res);
              return;
            }
          }
        }

        // Search by full relative path first, then by basename only (mirrors caQtDM behavior).
        const basename = path.basename(filename);
        const candidates = filename === basename ? [basename] : [filename, basename];

        console.log(`[ui-search-path] looking for: ${filename}`);

        for (const name of candidates) {
          for (const dir of searchPaths) {
            // Try .ui first.
            const fullPath = path.join(dir, name);
            if (fs.existsSync(fullPath)) {
              console.log(`[ui-search-path] found: ${fullPath}`);
              res.setHeader("Content-Type", "application/xml");
              fs.createReadStream(fullPath).pipe(res);
              return;
            }
            // Try .adl fallback — convert on the fly with adl2ui.
            const adlName = name.replace(/\.ui$/, ".adl");
            const adlPath = path.join(dir, adlName);
            if (fs.existsSync(adlPath)) {
              const converted = convertAdl(adlPath);
              if (converted) {
                res.setHeader("Content-Type", "application/xml");
                fs.createReadStream(converted).pipe(res);
                return;
              }
            }
          }
        }

        console.warn(`[ui-search-path] NOT FOUND: ${filename}`);
        next();
      });
    },
  };
}

// ── Vite config ───────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [react(), nodePolyfills(), uiSearchPathPlugin()],
  server: {
    port: 4200,
    host: "0.0.0.0",
    allowedHosts: true
  }
});
