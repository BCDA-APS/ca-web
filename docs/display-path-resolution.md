# Display Path Resolution

How ca-web finds a caQtDM `.ui` file when a display references it by name.
Implemented by the `ui-search-path` plugin in `vite.config.ts`.

## How to encode a UI file URL in app code

When writing a `/ui/<...>` URL in TSX (for `open-ui` events, `<UiRenderer file=...>`,
`quickLinks`, etc.), prefer in this order:

1. **Search-path basename** — `/ui/<filename>.ui`. Use when the file's directory is
   reachable via the deployment's caQtDM startup script. The vite middleware walks the
   union of `append_QDP*` entries and serves the **first** directory that has the file
   (adl2ui-converting on the fly for `.adl` originals). There is no uniqueness check,
   so a basename present in two search directories silently resolves to whichever
   comes first — which is what option 2 exists to disambiguate. Zero config, zero
   maintenance. This is the default; most synApps / IOC screens land here.

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

## Background: what caQtDM does

In the caQtDM desktop application, a `CAQTDM_DISPLAY_PATH` environment variable
defines a colon-separated list of directories to search when resolving display
filenames. When a `caRelatedDisplay` or `caInclude` widget references a display by
bare filename (e.g. `motor.ui`), caQtDM searches each directory in the path until
it finds the file.

`UiRenderer.tsx` on its own resolves filenames only against the directory of the
currently open `.ui` file (`BaseDirContext`). That is enough for displays that sit
alongside the main screen — at 29-ID the main displays are flat, so `caInclude`
works — but not for `caRelatedDisplay` widgets that open synApps engineering
screens (motor, calc, sscan, optics), which live in entirely separate trees.

The server closes that gap, so the client stays unchanged.

## How resolution works

The plugin intercepts every `GET /ui/<...>` request and tries three strategies in
order, falling through to the next when a path does not exist on disk. At each
level, if the `.ui` file is absent it retries the same path with a `.adl`
extension and converts on the fly via `adl2ui`, caching the result in `.ui-cache/`
(git-ignored) so later opens are instant.

1. **`uiDirs` prefix.** If the URL is `/ui/<key>/<rest>` and `<key>` is declared in
   some deployment's `paths.uiDirs`, serve `<target>/<rest>` directly.
2. **Embedded absolute.** If the filename contains `//`, everything up to it is
   discarded and the remainder is served as a literal absolute path.
3. **Search path.** Try the full relative path in each search directory, then the
   basename alone in each search directory — matching caQtDM's own behavior of
   falling back to the bare filename.

Each strategy logs its own hit — `found (uiDirs.<key>):`, `found (absolute):`,
or plain `found:` for a search-path hit. An `.adl` that had to be converted logs
`converting:` or `serving cached conversion:` instead. An exhausted lookup logs
`[ui-search-path] NOT FOUND: <filename>` and calls `next()`, handing the request
back to Vite.

Two sharp edges worth knowing:

- `convertAdl` returns null when no `adl2ui` binary was found on this host, so on
  a machine without `/APSshare/bin/adl2ui` the `.adl` fallback silently does
  nothing and the lookup continues as if the file were absent.
- The conversion cache in `.ui-cache/` is keyed by basename alone, so two `.adl`
  files with the same name in different directories map to one cache entry.

The plugin also serves `GET /api/ui-files`, the index the file picker lists.

## Building the search path

Rather than hardcoding directories, the plugin parses the caQtDM startup script
named in each deployment's `paths.startupScript` at server startup, replicating
the logic the script itself uses to build `CAQTDM_DISPLAY_PATH`:

1. Collect simple `KEY=VALUE` variable assignments from the startup script
2. Find and parse the sourced release file (e.g. `release_6.3`) to get module paths
3. Process every `append_QDP`, `append_QDP_module`, and `append_QDP_uidir` call
4. Pick up the final `CAQTDM_DISPLAY_PATH=...` line for any extra paths (e.g. Scienta)

Scripts from all deployments are unioned. The intent is that the web server's search
path tracks the desktop caQtDM's, so that when 29-ID upgrades to synApps 6.4 only the
startup script and release file change and no web code is touched. It is a close
approximation rather than a guarantee: the parser handles simple `KEY=VALUE` lines
and the first sourced release file only, and drops directories that do not exist on
the current host (reported just as an `N/M search paths available` count at startup).

Deployments whose declared paths are missing on the current host are tolerated:
they are reported to the deployment picker through the
`virtual:deployment-path-status` module as a "paths unreachable" hint, and their
`/ui/*` requests 404 cleanly. See
[adr/005](adr/005-portable-deployment-paths.md).

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

The main module list used at 29-ID. This is a snapshot, not a live mirror —
the startup script is the authority, and it also carries `ADPROSILICA`,
`ADPOINTGREY` and `ADLIGHTFIELD` entries not reproduced here:

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
- `/APSshare/adlsys/` and subdirectories (MEDM format, converted on demand)

`K648X` is a local path outside synApps 6.3
(`/net/s29dserv/xorApps/epics/synApps_6_1/support/keithley648x/k648xApp/op/ui`);
`release_6.1` is legacy and is not sourced by the startup script.

## Dev server only

`ui-search-path` is registered in `configureServer` but **not** in
`configurePreviewServer`, so under `npm run preview` both `/ui/*` resolution and
the `/api/ui-files` index the file picker depends on are unhandled. This is the
one place the two servers differ: the `layouts-api` plugin is registered for
both.

That is adequate today, because ca-web runs from `npm run dev` on the beamline
host and there is no static production deployment (see
[architecture.md](architecture.md)). Serving a built `dist/` from nginx or a
plain file server would leave every `/ui/*` request unhandled. If that ever
becomes the deployment model, the same search logic has to move into whatever
serves the bundle — either generated nginx `try_files` rules, or a small Node
server reusing the functions already written in `vite.config.ts`.
