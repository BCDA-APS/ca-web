import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { visualizer } from "rollup-plugin-visualizer";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

// ── Per-deployment external paths ─────────────────────────────────────────────
//
// Each src/deployments/<id>/config.json may declare a "paths" block:
//   paths.uiDirs:        Record<key, absolute target>   — /ui/<key>/* serves from target
//   paths.startupScript: absolute path                  — caQtDM startup script to parse
//   paths.adl2ui:        absolute path                  — converter binary
//
// All fields optional. Missing targets are tolerated; conflicts on uiDirs keys
// across deployments throw. Lets the package run on hosts without 29ID NFS.

const CACHE_DIR       = path.join(process.cwd(), ".ui-cache");
const DEPLOYMENTS_DIR = path.join(process.cwd(), "src", "deployments");
const VIRTUAL_MODULE  = "virtual:deployment-path-status";
const RESOLVED_ID     = "\0" + VIRTUAL_MODULE;
const VALID_KEYS      = new Set(["uiDirs", "startupScript", "adl2ui"]);

type UiDirEntry = { target: string; deploymentId: string };

type LoadedPaths = {
  uiDirs: Record<string, UiDirEntry>;
  startupScripts: string[];
  adl2ui: string | null;
  perDeploymentStatus: Record<string, { missing: string[] }>;
};

function loadDeploymentPaths(): LoadedPaths {
  const uiDirs: Record<string, UiDirEntry> = {};
  const startupScripts: string[] = [];
  let adl2ui: string | null = null;
  const perDeploymentStatus: Record<string, { missing: string[] }> = {};

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(DEPLOYMENTS_DIR, { withFileTypes: true });
  } catch {
    return { uiDirs, startupScripts, adl2ui, perDeploymentStatus };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const file = path.join(DEPLOYMENTS_DIR, id, "config.json");
    if (!fs.existsSync(file)) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`[deployments] failed to parse ${file}: ${e}`);
    }

    let pathsBlock: Record<string, unknown> = {};
    if (parsed.paths !== undefined) {
      if (typeof parsed.paths !== "object" || parsed.paths === null || Array.isArray(parsed.paths)) {
        throw new Error(`[deployments] ${file}: "paths" must be an object`);
      }
      pathsBlock = parsed.paths as Record<string, unknown>;
    }

    for (const k of Object.keys(pathsBlock)) {
      if (!VALID_KEYS.has(k)) {
        throw new Error(
          `[deployments] ${file}: unknown key "paths.${k}". Allowed: ${[...VALID_KEYS].join(", ")}`
        );
      }
    }

    const missing: string[] = [];

    const ud = pathsBlock.uiDirs;
    if (ud && typeof ud === "object") {
      for (const [key, target] of Object.entries(ud as Record<string, unknown>)) {
        if (typeof target !== "string") {
          throw new Error(`[deployments] ${file}: paths.uiDirs.${key} must be a string`);
        }
        const existing = uiDirs[key];
        if (existing && existing.target !== target) {
          throw new Error(
            `[deployments] uiDirs conflict on key "${key}": ` +
            `${existing.deploymentId} -> ${existing.target} vs ${id} -> ${target}`
          );
        }
        uiDirs[key] = { target, deploymentId: id };
        if (!fs.existsSync(target)) missing.push(`uiDirs.${key}`);
      }
    }

    if (typeof pathsBlock.startupScript === "string") {
      if (fs.existsSync(pathsBlock.startupScript)) {
        if (!startupScripts.includes(pathsBlock.startupScript)) startupScripts.push(pathsBlock.startupScript);
      } else {
        missing.push("startupScript");
      }
    }

    if (typeof pathsBlock.adl2ui === "string") {
      if (fs.existsSync(pathsBlock.adl2ui)) {
        if (adl2ui === null) adl2ui = pathsBlock.adl2ui;
      } else {
        missing.push("adl2ui");
      }
    }

    perDeploymentStatus[id] = { missing };
  }

  return { uiDirs, startupScripts, adl2ui, perDeploymentStatus };
}

// Convert an .adl file to .ui via adl2ui, cache the result. Returns null if
// adl2ui isn't available or conversion fails.
function convertAdl(adlPath: string, adl2ui: string | null): string | null {
  if (!adl2ui) return null;
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  const baseName   = path.basename(adlPath, ".adl");
  const cachedPath = path.join(CACHE_DIR, `${baseName}.ui`);

  if (fs.existsSync(cachedPath)) {
    console.log(`[ui-search-path] serving cached conversion: ${cachedPath}`);
    return cachedPath;
  }

  console.log(`[ui-search-path] converting: ${adlPath}`);
  const result = spawnSync(adl2ui, [adlPath], { cwd: CACHE_DIR, timeout: 15000 });

  if (result.status !== 0) {
    console.error(`[ui-search-path] conversion failed for ${adlPath}: ${result.stderr?.toString()}`);
    return null;
  }

  return fs.existsSync(cachedPath) ? cachedPath : null;
}

// Parse caQtDM startup scripts (one or more) and union the resulting search paths.
function buildSearchPaths(scripts: string[]): string[] {
  if (scripts.length === 0) return [];

  const allPaths: string[] = [];

  for (const script of scripts) {
    const lines = fs.readFileSync(script, "utf8").split("\n");
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

    // Pass 3: process append_QDP*, append_QDP_module, append_QDP_uidir calls
    // and the final CAQTDM_DISPLAY_PATH=... line.
    for (const line of lines) {
      const t = line.trim();

      let m = t.match(/^append_QDP\s+(\S+)$/);
      if (m) {
        const p = subst(m[1]);
        if (p && p !== ".") allPaths.push(p);
        continue;
      }

      m = t.match(/^append_QDP_module\s+(\S+)\s+(\S+)$/);
      if (m) {
        const base = vars[m[1]];
        if (base) {
          allPaths.push(path.join(base, m[2]));
          allPaths.push(path.join(base, m[2], "autoconvert"));
        }
        continue;
      }

      m = t.match(/^append_QDP_uidir\s+(\S+)$/);
      if (m) {
        const uiDir = vars["UI_DIR"] ?? "";
        const uiSubdir = vars["UI_SUBDIR"] ?? "";
        allPaths.push(path.join(uiDir, uiSubdir, m[1]));
        allPaths.push(path.join(`${uiDir}-autoconvert`, uiSubdir, m[1]));
        continue;
      }

      m = t.match(/^CAQTDM_DISPLAY_PATH=\$CAQTDM_DISPLAY_PATH:(.+)$/);
      if (m) {
        allPaths.push(subst(m[1]));
        continue;
      }
    }
  }

  // Dedupe while preserving order, then filter to those that exist.
  const seen = new Set<string>();
  const unique = allPaths.filter(p => (seen.has(p) ? false : (seen.add(p), true)));
  const existing = unique.filter(p => fs.existsSync(p));
  console.log(`[ui-search-path] ${existing.length}/${unique.length} search paths available`);
  return existing;
}

// Builds a list of all available .ui files from public/ui/, declared uiDirs,
// and NFS search paths. .adl files are included as .ui (served-side converted).
function buildFileList(uiDirs: Record<string, UiDirEntry>, searchPaths: string[]): { name: string; dir: string }[] {
  const files: { name: string; dir: string }[] = [];

  // public/ui/ first
  const publicUiDir = path.join(process.cwd(), "public", "ui");
  try {
    for (const f of fs.readdirSync(publicUiDir)) {
      if (f.endsWith(".ui")) files.push({ name: f, dir: "app" });
    }
  } catch {}

  // Declared uiDirs (replaces what the old public/ui/<key> symlinks listed).
  for (const [key, entry] of Object.entries(uiDirs)) {
    try {
      for (const f of fs.readdirSync(entry.target)) {
        if (f.endsWith(".ui"))  files.push({ name: f, dir: key });
        if (f.endsWith(".adl")) files.push({ name: f.replace(/\.adl$/, ".ui"), dir: key });
      }
    } catch {}
  }

  // Unioned caQtDM search paths
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

// Vite plugin: intercepts GET /ui/<filename> and resolves via (in order):
//   1. public/ui/<filename> — let Vite handle it normally
//   2. /ui/<key>/<rest>     — uiDirs[key].target/<rest> (prefix mapping)
//   3. embedded absolute (//path) — serve directly
//   4. NFS search paths     — caQtDM-style fallback (full path then basename)
function uiSearchPathPlugin(paths: LoadedPaths) {
  const searchPaths = buildSearchPaths(paths.startupScripts);
  const uiFileList  = buildFileList(paths.uiDirs, searchPaths);
  console.log(`[ui-search-path] ${uiFileList.length} display files indexed`);

  return {
    name: "ui-search-path",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url: string = req.url ?? "";

        if (url === "/api/ui-files" && req.method === "GET") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(uiFileList));
          return;
        }

        if (!url.startsWith("/ui/")) return next();

        const filename = url.slice(4).split("?")[0];
        if (!filename) return next();

        // 1. public/ui/<filename>
        const publicPath = path.join(process.cwd(), "public", "ui", filename);
        if (fs.existsSync(publicPath)) return next();

        // 2. Prefix mapping: /ui/<key>/<rest> -> uiDirs[key].target/<rest>
        const slash = filename.indexOf("/");
        if (slash > 0) {
          const key = filename.slice(0, slash);
          const rest = filename.slice(slash + 1);
          const entry = paths.uiDirs[key];
          if (entry) {
            const direct = path.join(entry.target, rest);
            if (fs.existsSync(direct)) {
              console.log(`[ui-search-path] found (uiDirs.${key}): ${direct}`);
              res.setHeader("Content-Type", "application/xml");
              fs.createReadStream(direct).pipe(res);
              return;
            }
            const adl = direct.replace(/\.ui$/, ".adl");
            if (fs.existsSync(adl)) {
              const converted = convertAdl(adl, paths.adl2ui);
              if (converted) {
                res.setHeader("Content-Type", "application/xml");
                fs.createReadStream(converted).pipe(res);
                return;
              }
            }
          }
        }

        // 3. Embedded absolute path (//... in filename)
        const doubleSlash = filename.indexOf("//");
        if (doubleSlash !== -1) {
          const absPath = "/" + filename.slice(doubleSlash + 2);
          if (fs.existsSync(absPath)) {
            console.log(`[ui-search-path] found (absolute): ${absPath}`);
            res.setHeader("Content-Type", "application/xml");
            fs.createReadStream(absPath).pipe(res);
            return;
          }
          const absAdlPath = absPath.replace(/\.ui$/, ".adl");
          if (fs.existsSync(absAdlPath)) {
            const converted = convertAdl(absAdlPath, paths.adl2ui);
            if (converted) {
              res.setHeader("Content-Type", "application/xml");
              fs.createReadStream(converted).pipe(res);
              return;
            }
          }
        }

        // 4. Search paths from caQtDM startup scripts
        const basename = path.basename(filename);
        const candidates = filename === basename ? [basename] : [filename, basename];

        console.log(`[ui-search-path] looking for: ${filename}`);

        for (const name of candidates) {
          for (const dir of searchPaths) {
            const fullPath = path.join(dir, name);
            if (fs.existsSync(fullPath)) {
              console.log(`[ui-search-path] found: ${fullPath}`);
              res.setHeader("Content-Type", "application/xml");
              fs.createReadStream(fullPath).pipe(res);
              return;
            }
            const adlName = name.replace(/\.ui$/, ".adl");
            const adlPath = path.join(dir, adlName);
            if (fs.existsSync(adlPath)) {
              const converted = convertAdl(adlPath, paths.adl2ui);
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

// Per-deployment layout persistence. Each deployment owns a layouts/
// directory under src/deployments/<id>/layouts/ containing one JSON file per
// named layout (plus "current.json" for the live state). The plugin services
// /api/layouts in both `vite dev` and `vite preview` so the same persistence
// works whether you're authoring or running the production build from the
// repo. There is no production-static deployment path: ca-web runs from the
// repo so the server can always write.
const LAYOUT_NAME_RX = /^[a-z0-9-]{1,64}$/;
// Deployment IDs may contain underscores (e.g. "29id_dev"). Layout names must
// be filesystem-safe but stay restrictive for tidy filenames.
const DEPLOYMENT_ID_RX = /^[a-z0-9_-]{1,64}$/;

function layoutsApiPlugin() {
  function layoutDir(deploymentId: string): string | null {
    if (!DEPLOYMENT_ID_RX.test(deploymentId)) return null;
    const deploymentRoot = path.join(DEPLOYMENTS_DIR, deploymentId);
    if (!fs.existsSync(deploymentRoot)) return null;
    return path.join(deploymentRoot, "layouts");
  }

  function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  function handler(req: any, res: any, next: any) {
    const url: string = req.url ?? "";
    const m = url.match(/^\/api\/layouts\/([^/?]+)(?:\/([^/?]+))?(?:\?.*)?$/);
    if (!m) return next();

    const [, deploymentId, nameRaw] = m;
    const dir = layoutDir(deploymentId);
    if (!dir) { res.statusCode = 404; res.end("unknown deployment"); return; }

    // GET /api/layouts/<id>  → list of names
    if (!nameRaw && req.method === "GET") {
      ensureDir(dir);
      const names = fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => f.slice(0, -5))
        .filter(n => LAYOUT_NAME_RX.test(n))
        .sort();
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(names));
      return;
    }
    if (!nameRaw) { res.statusCode = 405; res.end("method not allowed"); return; }

    if (!LAYOUT_NAME_RX.test(nameRaw)) { res.statusCode = 400; res.end("bad name"); return; }
    const file = path.join(dir, `${nameRaw}.json`);

    if (req.method === "GET") {
      if (!fs.existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
      res.setHeader("Content-Type", "application/json");
      fs.createReadStream(file).pipe(res);
      return;
    }

    if (req.method === "PUT") {
      let body = "";
      let aborted = false;
      req.on("data", (c: Buffer) => {
        body += c.toString("utf8");
        if (body.length > 1024 * 1024) {
          aborted = true;
          res.statusCode = 413; res.end("payload too large");
          req.destroy();
        }
      });
      req.on("end", () => {
        if (aborted) return;
        try { JSON.parse(body); } catch { res.statusCode = 400; res.end("bad json"); return; }
        ensureDir(dir);
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, body);
        fs.renameSync(tmp, file);
        res.statusCode = 204; res.end();
      });
      return;
    }

    if (req.method === "DELETE") {
      if (nameRaw === "current") { res.statusCode = 400; res.end("cannot delete current"); return; }
      if (fs.existsSync(file)) fs.unlinkSync(file);
      res.statusCode = 204; res.end();
      return;
    }

    res.statusCode = 405; res.end("method not allowed");
  }

  return {
    name: "layouts-api",
    configureServer(server: any) { server.middlewares.use(handler); },
    configurePreviewServer(server: any) { server.middlewares.use(handler); },
  };
}

// Exposes per-deployment path-status to the browser as a virtual module,
// so the picker can render a "paths unreachable" hint.
function deploymentPathStatusPlugin(paths: LoadedPaths) {
  const code = `export const PATH_STATUS = ${JSON.stringify(paths.perDeploymentStatus)};`;
  return {
    name: "deployment-path-status",
    resolveId(id: string) {
      if (id === VIRTUAL_MODULE) return RESOLVED_ID;
      return null;
    },
    load(id: string) {
      if (id === RESOLVED_ID) return code;
      return null;
    },
  };
}

// ── Vite config ───────────────────────────────────────────────────────────────

export default defineConfig(() => {
  const paths = loadDeploymentPaths();
  const analyze = process.env.ANALYZE === "1";
  return {
    plugins: [
      react(),
      nodePolyfills(),
      uiSearchPathPlugin(paths),
      deploymentPathStatusPlugin(paths),
      layoutsApiPlugin(),
      analyze && visualizer({
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
        template: "treemap",
      }),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
            if (/[\\/]node_modules[\\/](@mui|@emotion)[\\/]/.test(id)) return "mui";
            if (
              /[\\/]node_modules[\\/](@diamondlightsource[\\/]cs-web-lib|@reduxjs[\\/]toolkit|react-redux|redux|reselect|immer)[\\/]/.test(id)
            ) return "cs-web";
          },
        },
      },
    },
    server: {
      port: 4200,
      host: "127.0.0.1",
      allowedHosts: true,
      // Polling-based file watching is opt-in for dev on NFS-mounted repos
      // (inotify events don't propagate to NFS clients). Set VITE_POLL=1
      // when you want HMR to fire on saves. Leave unset for production-ish
      // use so staff browsers don't auto-reload mid-task.
      ...(process.env.VITE_POLL === "1" && {
        watch: { usePolling: true, interval: 1000 },
      }),
    },
  };
});
