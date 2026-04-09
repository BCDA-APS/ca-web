// Parses a caQtDM .ui (Qt Designer XML) file into a typed widget list.
// Only the subset of caQtDM widgets needed for the motorx_tiny spike.

export interface WidgetGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedTab {
  title: string;
  widgets: ParsedWidget[];
}

export interface ParsedWidget {
  class: string;        // e.g. "caLineEdit", "caGraphics"
  name: string;         // widget instance name
  geometry: WidgetGeometry;
  props: Record<string, string>;  // all properties as strings (colors as "rgba(r,g,b,a)")
  zIndex: number;       // from <zorder> list
  tabs?: ParsedTab[];   // only present for QTabWidget
  children?: ParsedWidget[]; // only present for caFrame (relative positions)
}

export interface ParsedUi {
  nativeWidth: number;
  nativeHeight: number;
  widgets: ParsedWidget[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function applyMacros(s: string, macros: Record<string, string>): string {
  return s.replace(/\$\((\w+)\)/g, (_, k) => macros[k] ?? `$(${k})`);
}

function parseColor(colorEl: Element | null): string {
  if (!colorEl) return "transparent";
  const r = colorEl.querySelector("red")?.textContent ?? "0";
  const g = colorEl.querySelector("green")?.textContent ?? "0";
  const b = colorEl.querySelector("blue")?.textContent ?? "0";
  // Alpha may be a child <alpha> element OR an attribute on the <color> tag.
  const a = colorEl.querySelector("alpha")?.textContent ?? colorEl.getAttribute("alpha") ?? "255";
  return `rgba(${r},${g},${b},${(parseInt(a) / 255).toFixed(3)})`;
}

function getPropEl(widget: Element, name: string): Element | null {
  for (const child of widget.children) {
    if (child.tagName === "property" && child.getAttribute("name") === name)
      return child;
  }
  return null;
}

function getGeometry(widget: Element): WidgetGeometry | null {
  const el = getPropEl(widget, "geometry");
  if (!el) return null;
  const rect = el.querySelector("rect");
  if (!rect) return null;
  return {
    x: parseInt(rect.querySelector("x")?.textContent ?? "0"),
    y: parseInt(rect.querySelector("y")?.textContent ?? "0"),
    width: parseInt(rect.querySelector("width")?.textContent ?? "100"),
    height: parseInt(rect.querySelector("height")?.textContent ?? "20"),
  };
}

function collectProps(child: Element, m: (s: string) => string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const propEl of child.children) {
    if (propEl.tagName !== "property") continue;
    const propName = propEl.getAttribute("name") ?? "";

    const colorEl = propEl.querySelector("color");
    if (colorEl) {
      props[propName] = parseColor(colorEl);
      continue;
    }

    const val =
      propEl.querySelector("string")?.textContent ??
      propEl.querySelector("enum")?.textContent ??
      propEl.querySelector("number")?.textContent ??
      propEl.querySelector("double")?.textContent ??
      propEl.querySelector("set")?.textContent ??
      "";
    props[propName] = m(val);
  }
  return props;
}

// ── main parser ───────────────────────────────────────────────────────────────

export function parseUi(
  xml: string,
  macros: Record<string, string> = {}
): ParsedUi {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const m = (s: string) => applyMacros(s, macros);

  // Native screen size — from QMainWindow geometry if present, else root widget.
  // Some .ui files (e.g. E816.ui) use QWidget as the root form instead of QMainWindow.
  const mainWidget = doc.querySelector('widget[class="QMainWindow"]');
  const rootWidget = mainWidget ?? doc.querySelector('widget');
  const rootGeom   = rootWidget ? getGeometry(rootWidget) : null;
  const nativeWidth  = rootGeom?.width  ?? 800;
  const nativeHeight = rootGeom?.height ?? 600;

  const central = doc.querySelector('widget[name="centralWidget"]') ??
                  doc.querySelector('widget[name="centralwidget"]') ??
                  (mainWidget ? null : rootWidget);  // QWidget-rooted files: use root as central
  if (!central) return { nativeWidth, nativeHeight, widgets: [] };

  // Build z-index map from <zorder> elements (rendering order = z-index).
  // Top-level items are spaced 1000 apart so that local sub-indices (which use
  // integer offsets of 0,1,2,...) stay within [N*1000, (N+1)*1000) and remain
  // distinct integers in CSS — avoiding the CSS z-index truncation problem where
  // fractional values like 2.003 and 2.000 both become CSS z-index:2.
  const zorders = Array.from(central.querySelectorAll(":scope > zorder"));
  const zMap: Record<string, number> = {};
  zorders.forEach((z, i) => { zMap[z.textContent ?? ""] = i * 1000; });

  // Recursively collect widgets into `out`.
  // offsetX/Y accumulate parent container positions (absolute screen coords).
  // Tab widget children use offset 0,0 — they are positioned relative to the tab page.
  // parentW/H: the containing area's pixel size, used to compute layout-managed geometry.
  function collectWidgets(parent: Element, out: ParsedWidget[], offsetX: number, offsetY: number, parentZ: number, parentW = 0, parentH = 0) {
    for (const child of parent.children) {
      // Qt layout elements (QHBoxLayout, QVBoxLayout, QGridLayout) contain widgets
      // via <item> children. These widgets typically have no explicit geometry — their
      // bounds are computed from the layout's margin/spacing and the container size.
      if (child.tagName === "layout") {
        const layoutClass = child.getAttribute("class") ?? "";
        const isH = layoutClass.includes("HBox");
        const margin = parseInt(child.querySelector(":scope > property[name='margin'] > number")?.textContent ?? "0");
        const spacing = parseInt(child.querySelector(":scope > property[name='spacing'] > number")?.textContent ?? "0");
        const items = Array.from(child.children).filter(c => c.tagName === "item");
        const n = items.length || 1;
        const totalW = parentW - 2 * margin;
        const totalH = parentH - 2 * margin;
        items.forEach((item, i) => {
          for (const w of item.children) {
            if (w.tagName !== "widget") continue;
            const wCls = w.getAttribute("class") ?? "";
            const wName = w.getAttribute("name") ?? "";
            let geom = getGeometry(w);
            if (!geom) {
              // Compute geometry from layout rules.
              if (isH) {
                const ww = Math.floor((totalW - spacing * (n - 1)) / n);
                geom = { x: margin + i * (ww + spacing), y: margin, width: ww, height: totalH };
              } else {
                const hh = Math.floor((totalH - spacing * (n - 1)) / n);
                geom = { x: margin, y: margin + i * (hh + spacing), width: totalW, height: hh };
              }
            }
            const props = collectProps(w, m);
            const zIndex = zMap[wName] ?? parentZ;
            out.push({
              class: wCls, name: wName,
              geometry: { ...geom, x: geom.x + offsetX, y: geom.y + offsetY },
              props, zIndex,
            });
            // Recurse in case this layout-managed widget has its own children.
            collectWidgets(w, out, offsetX + geom.x, offsetY + geom.y, zIndex, geom.width, geom.height);
          }
        });
        continue;
      }

      if (child.tagName !== "widget") continue;

      const cls = child.getAttribute("class") ?? "";
      const name = child.getAttribute("name") ?? "";
      const geometry = getGeometry(child);
      const props = collectProps(child, m);

      // QTabWidget — emit as a widget with structured tab data.
      if (cls === "QTabWidget") {
        if (!geometry) continue;
        const zIndex = zMap[name] ?? parentZ;
        const tabs: ParsedTab[] = [];
        for (const tabEl of child.children) {
          if (tabEl.tagName !== "widget") continue;
          const titleAttr = Array.from(tabEl.children).find(
            el => el.tagName === "attribute" && el.getAttribute("name") === "title"
          );
          const title = titleAttr?.querySelector("string")?.textContent ?? "";
          const tabWidgets: ParsedWidget[] = [];
          // Build local z-order map for this tab page's children.
          const tabZorders = Array.from(tabEl.querySelectorAll(":scope > zorder"));
          if (tabZorders.length > 0) {
            tabZorders.forEach((lz, i) => { zMap[lz.textContent ?? ""] = zIndex + i; });
          }
          // Tab-page children are positioned relative to the tab page (0,0).
          collectWidgets(tabEl, tabWidgets, 0, 0, zIndex);
          tabWidgets.sort((a, b) => a.zIndex - b.zIndex);
          tabs.push({ title, widgets: tabWidgets });
        }
        out.push({
          class: cls, name,
          geometry: { ...geometry, x: geometry.x + offsetX, y: geometry.y + offsetY },
          props, zIndex, tabs,
        });
        continue;
      }

      // caFrame — emit as a widget with relative-positioned children so visibility
      // can hide the whole group at once.
      if (cls === "caFrame") {
        if (!geometry) continue;
        const zIndex = zMap[name] ?? parentZ;
        const localZorders = Array.from(child.querySelectorAll(":scope > zorder"));
        if (localZorders.length > 0) {
          localZorders.forEach((lz, i) => { zMap[lz.textContent ?? ""] = zIndex + i; });
        }
        const children: ParsedWidget[] = [];
        collectWidgets(child, children, 0, 0, zIndex);
        children.sort((a, b) => a.zIndex - b.zIndex);
        out.push({
          class: cls, name,
          geometry: { ...geometry, x: geometry.x + offsetX, y: geometry.y + offsetY },
          props, zIndex, children,
        });
        continue;
      }

      // QGroupBox — emit as a widget with relative-positioned children so the
      // renderer can draw the border and title around them.
      if (cls === "QGroupBox") {
        if (!geometry) continue;
        const zIndex = zMap[name] ?? parentZ;
        const localZorders = Array.from(child.querySelectorAll(":scope > zorder"));
        if (localZorders.length > 0) {
          localZorders.forEach((lz, i) => { zMap[lz.textContent ?? ""] = zIndex + i; });
        }
        const children: ParsedWidget[] = [];
        collectWidgets(child, children, 0, 0, zIndex, geometry.width, geometry.height);
        children.sort((a, b) => a.zIndex - b.zIndex);
        out.push({
          class: cls, name,
          geometry: { ...geometry, x: geometry.x + offsetX, y: geometry.y + offsetY },
          props, zIndex, children,
        });
        continue;
      }

      // Other known transparent containers (Qt internals) — recurse and flatten.
      const isContainer = cls === "QWidget" || cls === "QFrame";
      if (isContainer) {
        const z = zMap[name] ?? parentZ;
        const dx = geometry ? geometry.x : 0;
        const dy = geometry ? geometry.y : 0;
        // Build a local z-order map for children of this container.
        const localZorders = Array.from(child.querySelectorAll(":scope > zorder"));
        if (localZorders.length > 0) {
          localZorders.forEach((lz, i) => { zMap[lz.textContent ?? ""] = z + i; });
        }
        collectWidgets(child, out, offsetX + dx, offsetY + dy, z);
      } else if (geometry) {
        const zIndex = zMap[name] ?? parentZ;
        out.push({
          class: cls, name,
          geometry: { ...geometry, x: geometry.x + offsetX, y: geometry.y + offsetY },
          props, zIndex,
        });
      }
    }
  }

  const widgets: ParsedWidget[] = [];
  collectWidgets(central, widgets, 0, 0, 0, nativeWidth, nativeHeight);

  // Render back-to-front
  widgets.sort((a, b) => a.zIndex - b.zIndex);
  return { nativeWidth, nativeHeight, widgets };
}
