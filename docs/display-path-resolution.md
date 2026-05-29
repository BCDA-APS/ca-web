# Display Path Resolution

## Problem

In the original caQtDM desktop application, a `CAQTDM_DISPLAY_PATH` environment variable
defines a colon-separated list of directories to search when resolving display filenames.
When a `caRelatedDisplay` or `caInclude` widget references a display by bare filename
(e.g. `motor.ui`), caQtDM searches each directory in the path until it finds the file.

The caqtdm-web application does not implement this search. It resolves filenames relative
to the directory of the currently open `.ui` file only (`BaseDirContext` in
`src/UiRenderer.tsx`). This works for displays that live alongside the main display, but
fails for any reference to a synApps engineering display library, which lives in a
completely different directory tree.

At 29-ID the main displays are flat (one directory), so `caInclude` works fine. The
problem is `caRelatedDisplay` widgets that open synApps displays — motor, calc, sscan,
optics, etc.

## Current behavior

`UiRenderer.tsx:539` (caRelatedDisplay):
```ts
file: `${baseDir}/${f.replace(/\.adl$/, ".ui")}`,
```

`UiRenderer.tsx:1520` (caInclude):
```ts
const file = filename ? `${baseDir}/${filename.replace(/\.adl$/, ".ui")}` : "";
```

`baseDir` is derived from the URL of the currently open `.ui` file. If the referenced
file is not in that same directory, the `fetch()` returns a 404 and the display fails
to open.

Note: `.adl` → `.ui` renaming is already handled, matching caQtDM's behavior of
converting MEDM files to caQtDM format.

## 29-ID startup script analysis

The startup script `/net/s29dserv/xorApps/ui/start_epics_29id` builds
`CAQTDM_DISPLAY_PATH` dynamically by sourcing `release_6.3` and calling helper
functions that expand module variables to their UI subdirectories.

The release file `/net/s29dserv/xorApps/ui/release_6.3` defines variables like:

```
MOTOR=/APSshare/epics/synApps_6_3/support/motor-R7-3-1
CALC=/APSshare/epics/synApps_6_3/support/calc-R3-7-5
SSCAN=/APSshare/epics/synApps_6_3/support/sscan-R2-11-6
...
```

The startup script's `append_QDP_module MODULE subdir` function expands each to:
- `$MODULE/subdir`
- `$MODULE/subdir/autoconvert`

So `MOTOR` + `motorApp/op/ui` becomes:
- `/APSshare/epics/synApps_6_3/support/motor-R7-3-1/motorApp/op/ui`
- `/APSshare/epics/synApps_6_3/support/motor-R7-3-1/motorApp/op/ui/autoconvert`

The full module list used at 29-ID:

| Variable      | Subdir                      |
|---------------|-----------------------------|
| ADCORE        | ADApp/op/ui                 |
| ALIVE         | aliveApp/op/ui              |
| ASYN          | opi/caqtdm                  |
| AUTOSAVE      | asApp/op/ui                 |
| BUSY          | busyApp/op/ui               |
| CALC          | calcApp/op/ui               |
| CAMAC         | camacApp/op/ui              |
| CAPUTRECORDER | caputRecorderApp/op/ui      |
| DAC128V       | dac128VApp/op/ui            |
| DELAYGEN      | delaygenApp/op/ui           |
| DEVIOCSTATS   | op/ui                       |
| DXP           | dxpApp/op/ui                |
| IP            | ipApp/op/ui                 |
| IP330         | ip330App/op/ui              |
| IPUNIDIG      | ipUnidigApp/op/ui           |
| LOVE          | loveApp/op/ui               |
| LUA           | luaApp/op/ui                |
| MCA           | mcaApp/op/ui                |
| MEASCOMP      | measCompApp/op/ui           |
| MOTOR         | motorApp/op/ui              |
| OPTICS        | opticsApp/op/ui             |
| QUADEM        | quadEMApp/op/ui             |
| SOFTGLUE      | softGlueApp/op/ui           |
| SOFTGLUEZYNQ  | softGlueApp/op/ui           |
| SSCAN         | sscanApp/op/ui              |
| STD           | stdApp/op/ui                |
| VAC           | vacApp/op/ui                |
| VME           | vmeApp/op/ui                |
| YOKOGAWA_DAS  | yokogawaDasApp/op/ui        |
| K648X         | k648xApp/op/ui              |

Plus fixed paths:
- `/net/s29dserv/xorApps/ui/29id/` (main 29-ID displays)
- `/net/s29dserv/xorApps/ui/29id/ID/`
- `/net/s29dserv/xorApps/epics/synApps_6_3/ioc/29idcScienta/29idcScientaApp/op/ui`
- `/APSshare/adlsys/` and subdirectories (MEDM format, likely not relevant for .ui)

## Proposed solution

### Approach

Add a Vite dev server middleware (and equivalent production server logic) that intercepts
`GET /ui/<filename>` requests. If the file is not found in `public/ui/` (the existing
location for main 29-ID displays), the middleware searches through the synApps directories
in order and serves the file directly from the NFS filesystem.

This mirrors exactly how caQtDM resolves paths — the **server** does the searching, the
**client** is unchanged. No changes to `UiRenderer.tsx` are needed.

One subtlety: display files are sometimes referenced with a path prefix (e.g.
`29id/Keithley6485.ui`). The middleware first tries the full relative path, then falls
back to the basename only (`Keithley6485.ui`), matching caQtDM's search behavior.

Some directories (e.g. `/APSshare/adlsys/`) contain only `.adl` (MEDM format) files with
no `.ui` equivalent. When a `.ui` file is not found, the middleware automatically tries
the `.adl` version and converts it on the fly using `/APSshare/bin/adl2ui`. The converted
`.ui` file is cached in `.ui-cache/` (git-ignored) so subsequent opens are instant.

### Dynamic path resolution

Rather than hardcoding any paths in `vite.config.ts`, the middleware parses the caQtDM
startup script (`start_epics_29id`) directly at server startup. It replicates the same
logic the script uses to build `CAQTDM_DISPLAY_PATH`:

1. Collect simple `KEY=VALUE` variable assignments from the startup script
2. Find and parse the sourced release file (e.g. `release_6.3`) to get module paths
3. Process every `append_QDP`, `append_QDP_module`, and `append_QDP_uidir` call
4. Pick up the final `CAQTDM_DISPLAY_PATH=...` line for any extra paths (e.g. Scienta)

This means the web server's search path is always identical to the desktop caQtDM's
search path. When 29-ID upgrades to synApps 6.4, only the startup script and release
file need to change — no web code updates needed.

### Configuration

The Vite plugin will need to know:
- Path to the release file: `/net/s29dserv/xorApps/ui/release_6.3` (only 6.3 is sourced
  by the startup script; `release_6.1` is legacy and not used)
- The module→subdir mapping table (matches the startup script)
- Fixed paths not covered by the release file:
  - `K648X` → `/net/s29dserv/xorApps/epics/synApps_6_1/support/keithley648x/k648xApp/op/ui`
    (local path, outside synApps 6.3)
  - Scienta: `/net/s29dserv/xorApps/epics/synApps_6_3/ioc/29idcScienta/29idcScientaApp/op/ui`
  - Main 29-ID dirs: `/net/s29dserv/xorApps/ui/29id/` and `/net/s29dserv/xorApps/ui/29id/ID/`

These will be defined in `vite.config.ts`.

### Files to change

- `vite.config.ts` — add the search-path middleware plugin
- No changes to `src/` needed

## How to encode a UI file URL in app code

When writing a `/ui/<...>` URL in TSX (for `open-ui` events, `<UiRenderer file=...>`,
`quickLinks`, etc.), prefer in this order:

1. **Search-path basename** — `/ui/<filename>.ui`. Use when the file's directory is
   reachable via the deployment's caQtDM startup script. The vite middleware tries each
   directory in the union of `append_QDP*` entries; if a unique basename match exists,
   it serves the file (and adl2ui-converts on the fly for `.adl` originals). Zero
   config, zero maintenance. This is the default — most synApps / IOC screens land
   here.

2. **uiDirs prefix mapping** — `/ui/<key>/<file>.ui`. Requires adding an entry to
   `paths.uiDirs` in the deployment's `config.json`. Use only when one of:
   - the file's directory is **not** in the startup script (e.g. `ADVimba` at 29-ID
     because there is no `append_QDP_module ADVIMBA` line);
   - you need to **pin to a specific module version** different from what the script's
     release file provides (e.g. `ADBase` pinned to synApps 6.2.1 while the script
     uses 6.3);
   - you need to **disambiguate a name collision** between two directories in the
     search path.

3. **Embedded absolute** — `/ui/x//<absolute-path>.ui`. Last resort escape hatch for a
   one-off file where neither of the above fits and adding a uiDirs entry would be
   overkill. The vite middleware strips everything up to `//` and serves the literal
   absolute path (with `.adl` conversion if needed). Avoid in checked-in code.

Resolution priority at runtime is `uiDirs → //abs → search paths` — the cheapest
deterministic lookups first, fuzzy search last. That order is about runtime cost, **not**
developer preference, which is the opposite (basename first, escape hatch last).

## Production considerations

The Vite middleware only runs during development (`npm run dev`). In production, Vite
builds static assets (HTML, JS, CSS) and exits — there is no longer a Vite server to
intercept requests.

For production you would need a real web server (e.g. nginx, Apache, or a small Node.js
Express server) that performs the same search-path logic: serve files from `public/ui/`
first, then fall back to the synApps directories on the NFS mount.

Two practical options:

**Option A — nginx with multiple `root` fallbacks**
Configure nginx to try each directory in sequence using `try_files` or multiple
`location` blocks. Requires the NFS mount to be accessible on the production server.
The release file parsing would need to be done once at deploy time to generate the
nginx config.

**Option B — small Node.js proxy server**
A small Express (or similar) server that reuses the same release-file-parsing logic
from `vite.config.ts`. This is the simplest path since the logic is already written
in TypeScript — the same code runs in both dev and production.

This is a future concern. For active development the Vite middleware is sufficient.
