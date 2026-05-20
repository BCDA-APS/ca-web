import { useState, useEffect, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import { DeploymentContext, clearActive } from "./lib/deployment";
import { layoutGet, layoutSet } from "./lib/layoutStorage";
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { DraggablePanel } from "./shell/DraggablePanel";
import { OverlayPanel, type AppOverlay } from "./shell/OverlayPanel";
import { CameraViewer } from "./widgets/CameraViewer";
import { Sidebar } from "./shell/Sidebar";
import { SettingsPanel, type SavedOverlay } from "./shell/SettingsPanel";
import type { SavedCameraOverlay } from "./lib/deployment";
import { FilePickerDialog, useUiFiles } from "./shell/FilePickerDialog";
import { PanelPickerDialog } from "./shell/PanelPickerDialog";
import { PvContextMenu, type PvContextEvent } from "./shell/PvContextMenu";
import apsLogoUrl from "./assets/aps-logo.png";

export default function App({ wsDown = false, wsUrl = "" }: { wsDown?: boolean; wsUrl?: string }) {
  const config = useContext(DeploymentContext)!;
  const [overlays, setOverlays] = useState<AppOverlay[]>([]);
  const [pvContext, setPvContext] = useState<PvContextEvent | null>(null);
  const counter = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [layoutBump, setLayoutBump] = useState(0);
  const [activeTab, setActiveTab] = useState(config.tabs[0].id);
  const activeTabColor = config.tabs.find(t => t.id === activeTab)?.color ?? "#0a1520";
  const [hiddenPanels, setHiddenPanels] = useState<Set<string>>(() => {
    const saved = layoutGet<string[]>("panel-hidden");
    return saved ? new Set(saved) : new Set(config.defaultHiddenPanels ?? []);
  });
  // Per-session "borrowed panel" map: panelId → set of tabIds where
  // the user has opened it via "Open react…" (in addition to its home
  // tab). Each entry adds the panel on the target tab without touching
  // its native visibility on the home tab. Closing a borrowed instance
  // (X button) removes only that tab from the set. Not persisted across
  // reload.
  const [borrowedPanels, setBorrowedPanels] = useState<Map<string, Set<number>>>(new Map());
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const uiFiles = useUiFiles();

  useEffect(() => {
    function handler(e: Event) { setPvContext((e as CustomEvent<PvContextEvent>).detail); }
    window.addEventListener("pv-context", handler);
    return () => window.removeEventListener("pv-context", handler);
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      // Find which tab the panel is declared on (its home tab).
      let homeTabId: number | null = null;
      for (const tab of config.tabs) {
        if ((config.tabPanels[tab.id] ?? []).some(p => p.id === id)) {
          homeTabId = tab.id;
          break;
        }
      }
      // Unknown panel id (maybe a future feature, or an @-suffix already):
      // fall through to plain unhide.
      const currentTab = activeTabRef.current;
      if (homeTabId === null || homeTabId === currentTab) {
        setHiddenPanels(prev => { const next = new Set(prev); next.delete(id); return next; });
        return;
      }
      // Panel lives on a different tab. Borrow it onto the current tab
      // so the user sees it appear where they are (same logic as the
      // "Open react…" picker).
      setBorrowedPanels(prev => {
        const next = new Map(prev);
        const tabs = new Set(next.get(id) ?? []);
        tabs.add(currentTab);
        next.set(id, tabs);
        return next;
      });
    }
    window.addEventListener("show-panel", handler);
    return () => window.removeEventListener("show-panel", handler);
  }, []);

  useEffect(() => {
    layoutSet("panel-hidden", [...hiddenPanels]);
  }, [hiddenPanels]);

  useEffect(() => {
    function handler(e: Event) {
      const { file, macros, label, replace, sourceFile, hostOverlayId, singleton } = (e as CustomEvent).detail;
      const tabId = activeTabRef.current;
      const id = ++counter.current;
      const offset = ((id - 1) % 6) * 24;
      if (replace && hostOverlayId != null) {
        // Replace the host overlay: remove that specific overlay by id, then
        // open the new one inheriting its position so the replacement feels
        // in-place. Falls back to the original sourceFile filter if no
        // hostOverlayId (e.g. caRelatedDisplay clicked outside any overlay).
        setOverlays(prev => {
          const host = prev.find(o => o.id === hostOverlayId);
          const pos = host?.pos ?? { x: 120, y: 80 };
          return [
            ...prev.filter(o => o.id !== hostOverlayId),
            { id, file, macros, label, pos, sourceFile, tabId },
          ];
        });
      } else if (replace && sourceFile) {
        setOverlays(prev => [
          ...prev.filter(o => o.sourceFile !== sourceFile),
          { id, file, macros, label, pos: { x: 120, y: 80 }, sourceFile, tabId },
        ]);
      } else if (singleton) {
        const macrosKey = JSON.stringify(macros);
        setOverlays(prev => {
          if (prev.some(o => o.file === file && JSON.stringify(o.macros) === macrosKey)) return prev;
          return [...prev, { id, file, macros, label, pos: { x: 120 + offset, y: 80 + offset }, sourceFile, tabId }];
        });
      } else {
        setOverlays(prev => [...prev, { id, file, macros, label, pos: { x: 120 + offset, y: 80 + offset }, sourceFile, tabId }]);
      }
    }
    window.addEventListener("open-ui", handler);

    function cameraHandler(e: Event) {
      const { label, initialPrefix, knownCameras } = (e as CustomEvent).detail ?? {};
      const tabId = activeTabRef.current;
      const id = ++counter.current;
      const offset = ((id - 1) % 6) * 24;
      setOverlays(prev => [...prev, {
        id, kind: "camera",
        file: "", macros: {},
        label: label ?? "Camera",
        pos: { x: 120 + offset, y: 80 + offset },
        initialPrefix, knownCameras,
        tabId,
      }]);
    }
    window.addEventListener("open-camera", cameraHandler);

    return () => {
      window.removeEventListener("open-ui", handler);
      window.removeEventListener("open-camera", cameraHandler);
    };
  }, []);

  function openFromPicker(file: string, macros: Record<string, string>) {
    window.dispatchEvent(new CustomEvent("open-ui", {
      detail: { file, macros, label: file.split("/").pop() ?? file }
    }));
  }

  function restoreOverlays(saved: SavedOverlay[]) {
    saved.forEach(ov => layoutSet(`overlay:${ov.file}`, { x: ov.pos.x, y: ov.pos.y, locked: ov.locked ?? false }));
    const tabId = activeTabRef.current;
    // Replace UI overlays only; cameras are restored by restoreCameras().
    setOverlays(prev => [
      ...prev.filter(o => o.kind === "camera"),
      ...saved.map(ov => ({ id: ++counter.current, file: ov.file, macros: ov.macros, label: ov.label, pos: ov.pos, tabId })),
    ]);
  }

  function restoreCameras(saved: SavedCameraOverlay[]) {
    const tabId = activeTabRef.current;
    setOverlays(prev => [
      ...prev.filter(o => o.kind !== "camera"),
      ...saved.map(cam => ({
        id: ++counter.current,
        kind: "camera" as const,
        file: "", macros: {},
        label: cam.label,
        pos: cam.pos,
        size: cam.size,
        initialPrefix: cam.prefix,
        knownCameras: cam.knownCameras,
        tabId: cam.tabId ?? tabId,
      })),
    ]);
  }

  return (
    <ErrorBoundary>
    <div
      style={{ background: "rgb(222,222,227)", minHeight: "100vh", minWidth: 2000, position: "relative", fontFamily: "Liberation Sans, Arial, sans-serif" }}
      onClick={() => settingsOpen && setSettingsOpen(false)}
    >

      {overlays.map(ov => {
        const close = () => setOverlays(prev => prev.filter(o => o.id !== ov.id));
        const visible = ov.tabId == null || ov.tabId === activeTab;
        if (ov.kind === "camera") {
          // Always render so React state survives tab switches; lift the
          // prefix / pos / size up via callbacks so the overlay record is
          // the source of truth (needed for save/restore).
          const onPrefix = (prefix: string) => setOverlays(prev =>
            prev.map(o => o.id === ov.id ? { ...o, initialPrefix: prefix } : o));
          const onPanelState = (s: { x: number; y: number; w?: number; h?: number }) =>
            setOverlays(prev => prev.map(o => o.id === ov.id ? {
              ...o,
              pos: { x: s.x, y: s.y },
              size: (s.w != null && s.h != null) ? { w: s.w, h: s.h } : o.size,
            } : o));
          return (
            <div key={ov.id} style={{ display: visible ? "contents" : "none" }}>
              <DraggablePanel
                id={`camera-${ov.id}`}
                title={ov.label}
                defaultPos={ov.pos}
                defaultSize={ov.size ?? { w: 380, h: 440 }}
                scale="fit"
                aspectLock
                transient
                onState={onPanelState}
                onClose={close}
              >
                <CameraViewer initialPrefix={ov.initialPrefix} knownCameras={ov.knownCameras}
                  onPrefixChange={onPrefix} />
              </DraggablePanel>
            </div>
          );
        }
        if (!visible) return null;
        return <OverlayPanel key={ov.id} ov={ov} onClose={close} />;
      })}

      <Sidebar tabs={config.tabs} active={activeTab} onSelect={setActiveTab} />

      <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000, opacity: 0.85 }}>
        <img src={apsLogoUrl} alt="Argonne National Laboratory | APS" style={{ height: "40px", width: "auto", display: "block" }} />
      </div>

      {wsDown && (
        <div role="alert" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 2002, background: "#c62828", color: "#ffffff", fontSize: 13, padding: "6px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: "1px solid rgba(0,0,0,0.25)" }}>
          <span><strong>EPICS gateway unreachable</strong> — {wsUrl}. PVs are disconnected.</span>
          <button onClick={() => window.location.reload()} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 12, padding: "3px 10px" }}>Retry</button>
        </div>
      )}

      <div style={{ position: "fixed", top: wsDown ? 32 : 0, left: 0, right: 0, zIndex: 2001, background: activeTabColor, borderBottom: "1px solid rgba(0,0,0,0.15)", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.3s" }}>
        <span style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, letterSpacing: 0.5 }}>{config.title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} onClick={e => e.stopPropagation()}>
          {(config.quickLinks ?? []).map(ql => (
            <button
              key={ql.label}
              onClick={() => window.dispatchEvent(new CustomEvent("open-ui", {
                detail: { file: ql.file, macros: ql.macros ?? {}, label: ql.label }
              }))}
              style={{ background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
            >
              {ql.label}
            </button>
          ))}
          <button
            onClick={() => {
              clearActive();
              const url = new URL(window.location.href);
              url.searchParams.delete("deployment");
              window.location.assign(url.toString());
            }}
            title="Return to deployment picker"
            style={{ background: "none", border: "1px solid transparent", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
          >
            Switch deployment…
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            style={{ background: "none", border: "1px solid transparent", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
          >
            Open ui…
          </button>
          <button
            onClick={() => setPanelPickerOpen(true)}
            style={{ background: "none", border: "1px solid transparent", borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 13, padding: "3px 10px" }}
          >
            Open react…
          </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setSettingsOpen(o => !o)}
            title="Settings"
            style={{ background: settingsOpen ? "rgba(0,0,0,0.15)" : "none", border: "1px solid " + (settingsOpen ? "rgba(255,255,255,0.4)" : "transparent"), borderRadius: 4, color: "#ffffff", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "3px 7px" }}
          >
            ⚙
          </button>
          {settingsOpen && createPortal(<SettingsPanel
            panelDefaults={config.panelDefaults}
            hiddenPanels={hiddenPanels}
            overlays={overlays}
            sharedLayouts={config.layouts ?? []}
            onClose={() => setSettingsOpen(false)}
            onBumpLayout={() => setLayoutBump(k => k + 1)}
            onResetHidden={() => setHiddenPanels(new Set(config.defaultHiddenPanels ?? []))}
            onRestoreHidden={hidden => setHiddenPanels(new Set(hidden))}
            onRestoreOverlays={restoreOverlays}
            onRestoreCameras={restoreCameras}
          />, document.body)}
        </div>
        </div>
      </div>

      {pickerOpen && (
        <FilePickerDialog
          files={uiFiles}
          onClose={() => setPickerOpen(false)}
          onOpen={openFromPicker}
        />
      )}

      {panelPickerOpen && (
        <PanelPickerDialog
          config={config}
          onClose={() => setPanelPickerOpen(false)}
          onOpen={(id, homeTabId) => {
            if (activeTab === homeTabId) {
              // Native: just unhide on the home tab.
              setHiddenPanels(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            } else {
              // Borrow onto the current tab. Home-tab state untouched.
              setBorrowedPanels(prev => {
                const next = new Map(prev);
                const tabs = new Set(next.get(id) ?? []);
                tabs.add(activeTab);
                next.set(id, tabs);
                return next;
              });
            }
            // Bring to front if already visible.
            window.dispatchEvent(new CustomEvent("show-panel", { detail: { id } }));
          }}
        />
      )}

      {/* Two render sources for the active tab:
          1. Native panels (declared in config.tabPanels[activeTab]) that
             aren't in `hiddenPanels`.
          2. Borrowed panels — declared in some OTHER tab's tabPanels but
             added to `borrowedPanels[id]` for the active tab via the
             "Open react…" picker.
          A panel can render in both modes simultaneously on different
          tabs; the home-tab visibility and borrowed-tab visibility are
          independent. */}
      {[
        ...(config.tabPanels[activeTab] ?? [])
          .filter(panel => !hiddenPanels.has(panel.id))
          .map(panel => ({ panel, borrowed: false as const })),
        ...config.tabs.flatMap(tab =>
          tab.id === activeTab ? [] :
          (config.tabPanels[tab.id] ?? [])
            .filter(panel => borrowedPanels.get(panel.id)?.has(activeTab))
            .map(panel => ({ panel, borrowed: true as const }))
        ),
      ].map(({ panel, borrowed }) => (
        <DraggablePanel
          key={`${panel.id}-${borrowed ? `borrowed-${activeTab}` : "native"}-${layoutBump}`}
          id={borrowed ? `${panel.id}@${activeTab}` : panel.id}
          title={panel.title}
          defaultPos={config.panelDefaults[panel.id]}
          defaultSize={panel.defaultSize}
          scale={panel.scale}
          aspectLock={panel.aspectLock}
          onClose={() => {
            if (borrowed) {
              setBorrowedPanels(prev => {
                const next = new Map(prev);
                const tabs = new Set(next.get(panel.id));
                tabs.delete(activeTab);
                if (tabs.size === 0) next.delete(panel.id);
                else                 next.set(panel.id, tabs);
                return next;
              });
            } else {
              setHiddenPanels(prev => new Set([...prev, panel.id]));
            }
          }}
        >
          <panel.Content />
        </DraggablePanel>
      ))}

      {pvContext && <PvContextMenu ctx={pvContext} onClose={() => setPvContext(null)} />}
    </div>
    </ErrorBoundary>
  );
}
