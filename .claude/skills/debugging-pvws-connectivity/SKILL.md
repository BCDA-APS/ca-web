---
name: debugging-pvws-connectivity
description: Diagnose why ca-web PV widgets are not connecting. Use
  whenever the user reports any of: "PVs aren't connecting", "the dashboard
  is blank", "everything shows dashes", "red banner at the top", "wsDown",
  "No connections for ca://" in the console, "pvws is broken", "EPICS
  gateway is down", "I deployed to <new host> and nothing works", "widgets
  are disconnected after a reboot", "Cannot write unknown PV". Explains the
  boot probe / WebSocket stub / red banner design (it is intentionally
  silent on dead gateways — read this before debugging the silence) and
  walks a four-step diagnostic recipe. Do not use for *individual* PVs that
  are stale while others connect — that's an IOC problem, not pvws.
---

# Debugging pvws connectivity

## When to use

The dashboard loads but every PV widget shows `"—"`; or a red banner
sits above the header saying the pvws gateway is unreachable; or the
console fills with `"No connections for ca://…"` messages. The
symptom is *connectivity*, not *layout* or *widget code*. If the
widget itself is broken, see [adding-a-widget](../adding-a-widget/SKILL.md).

## How ca-web treats a dead gateway

At boot, `src/main.tsx:32` runs `probeWebSocket(wsUrl, 3000)` from
`src/lib/pvwsProbe.ts:3-19`. The probe opens a single WebSocket
against `ws[s]://<config.pvws.socket>/pvws/pv` with a 3-second
timeout and resolves true/false.

If the probe fails, `installPvwsWebSocketStub(wsUrl)` from
`src/lib/wsStub.ts:35-46` swaps `window.WebSocket` for a `Proxy` that
returns a stub *only for that exact URL*. The stub stays in
`readyState = CONNECTING` forever and never fires open/close/error.
cs-web-lib's library guards every `send()` with
`readyState === OPEN`, so queued writes silently no-op, the
hardcoded 500ms reconnect loop fires harmlessly, and PVs render in
their default disconnected state instead of cascading errors.

`App` then renders with `wsDown={!wsAlive}` and `wsUrl={wsUrl}`
(`src/main.tsx:46`). The red banner with the Retry button comes from
those props. **The stub is boot-only** — it does not cover
mid-session drops, which fall through to cs-web-lib's reconnect.

## Steps

1. **Confirm the symptom.**

   - `npm run dev` and open `http://localhost:4200/?deployment=<id>`.
   - Open DevTools → Console. Look for
     `[main] pvws gateway unreachable: ws://<host>:<port>/pvws/pv`.
     That line means the probe ran and failed.
   - Look for the red banner at top of screen. Banner up → probe
     said dead. No banner but PVs still disconnected → probe said
     alive but channels aren't reaching IOCs (jump to step 4).

2. **Check `config.pvws.socket`.**

   ```bash
   cat src/deployments/<id>/config.json | grep -A2 '"pvws"'
   ```

   Verify `socket` matches the host:port where pvws is actually
   listening. Common mistakes: `localhost:8080` when pvws runs on a
   different machine; `nerdy:8080` when DNS doesn't resolve `nerdy`
   from this host; the wrong port.

3. **Probe the WebSocket from your shell.**

   ```bash
   # plain HTTP healthcheck (matches docs/how-to-start-pvws.md):
   curl -sS http://<socket>/pvws/ | grep -c img/connected.png
   ```

   A non-zero count means pvws is up and the channel pool is
   connected. Zero means pvws is down or unreachable. For the
   WebSocket itself:

   ```bash
   # if wscat is installed:
   wscat -c ws://<socket>/pvws/pv
   # type: {"type":"subscribe","pvs":["sim://sine"]}
   # you should see periodic update messages.
   ```

   If `curl` works but the WS doesn't, suspect a proxy / firewall
   between you and the host.

4. **Verify pvws can reach the IOCs.**

   The probe alive + widgets disconnected means pvws is running but
   its EPICS_CA_ADDR_LIST doesn't include the IOC subnet. Per
   `docs/how-to-start-pvws.md:14-22`, that list is **baked into the
   container at build time** via `../pvws/docker/setenv.sh`, not
   passed at run time. Rebuild the image with the correct list
   (typically `164.54.112.168` at APS) and reload.

   Also confirm `EPICS_CA_MAX_ARRAY_BYTES=8000000` is set on the
   container — without it, area-detector waveform PVs connect but
   return zero elements (`docs/how-to-start-pvws.md:84-87`).

5. **If everything checks out, retry the boot probe.**

   Click the Retry button in the red banner — it reloads the page,
   which reruns `probeWebSocket`. If the probe now succeeds, you're
   done. If not, return to step 2.

## What the stub deliberately hides

- **Reconnect storms**: cs-web-lib's 500ms reconnect loop has no
  max-retries option (`src/lib/wsStub.ts:1-6` documents this). Without
  the stub, a dead gateway would flood the console with reconnect
  attempts and the Redux store with churn.
- **`Cannot write unknown PV`**: pvws requires a subscription on the
  same socket before a write is accepted
  (`docs/how-to-start-pvws.md:185-188`). The stub no-ops writes so
  panels with motor controls don't throw on user clicks.

## What the stub does NOT cover

- **Mid-session drops** — the probe only runs once at boot. If pvws
  dies after the app is alive, cs-web-lib's reconnect kicks in. The
  banner won't reappear without a reload.
- **Per-PV failures** — a widget showing `"—"` while others connect
  means the IOC for that specific PV is down, not pvws. Check the PV
  name in the gateway's `/pvws/` UI (`http://<socket>/pvws/`).

## Verification

- `curl -sS http://<socket>/pvws/ | grep -c img/connected.png`
  returns a non-zero count.
- Reload `http://localhost:4200/?deployment=<id>` — no red banner.
- Console no longer shows `[main] pvws gateway unreachable`.
- A motor or readback widget shows a real value (not `"—"`) within
  ~1 second of the page settling.
- Right-click any `ChanRbvBox` / `ChanSpBox` — the pvCtx info
  dialog opens and shows the current value.

## See also

- `docs/how-to-start-pvws.md` — operator setup for the pvws
  container (build, run, beamline-specific flags). This skill links
  to it; it does not duplicate it.
- `src/main.tsx` — boot flow, probe + stub + render.
- `src/lib/pvwsProbe.ts` — the one-shot probe.
- `src/lib/wsStub.ts` — the WebSocket stub and Proxy install.
- `CHANGELOG.md` "pvws gateway pre-flight gate" — design
  notes for this whole flow.
- [verifying-before-completion](../verifying-before-completion/SKILL.md)
  — for the broader evidence rule once you claim "PVs are
  connecting".
