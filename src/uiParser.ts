// Parses a caQtDM .ui (Qt Designer XML) file into a typed widget list.
// Only the subset of caQtDM widgets needed for the motorx_tiny spike.

export interface WidgetGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedWidget {
  class: string;        // e.g. "caLineEdit", "caGraphics"
  name: string;         // widget instance name
  geometry: WidgetGeometry;
  props: Record<string, string>;  // all properties as strings (colors as "rgba(r,g,b,a)")
  zIndex: number;       // from <zorder> list
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
  const a = colorEl.querySelector("alpha")?.textContent ?? "255";
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

// ── main parser ───────────────────────────────────────────────────────────────

export function parseUi(
  xml: string,
  macros: Record<string, string> = {}
): ParsedUi {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const m = (s: string) => applyMacros(s, macros);

  // Native screen size from the QMainWindow geometry
  const mainWidget = doc.querySelector('widget[class="QMainWindow"]');
  const rootGeom = mainWidget ? getGeometry(mainWidget) : null;
  const nativeWidth = rootGeom?.width ?? 800;
  const nativeHeight = rootGeom?.height ?? 600;

  const central = doc.querySelector('widget[name="centralWidget"]');
  if (!central) return { nativeWidth, nativeHeight, widgets: [] };

  // Build z-index map from <zorder> elements (rendering order = z-index)
  const zorders = Array.from(central.querySelectorAll(":scope > zorder"));
  const zMap: Record<string, number> = {};
  zorders.forEach((z, i) => { zMap[z.textContent ?? ""] = i; });

  const widgets: ParsedWidget[] = [];

  // Recursively collect widgets. offsetX/Y accumulate parent container positions.
  function collectWidgets(parent: Element, offsetX: number, offsetY: number, parentZ: number) {
    for (const child of parent.children) {
      if (child.tagName !== "widget") continue;

      const cls = child.getAttribute("class") ?? "";
      const name = child.getAttribute("name") ?? "";
      const geometry = getGeometry(child);

      // Collect all properties.
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

      // Known container types — recurse into them, offsetting by their position.
      // QTabWidget children (tab pages) are QWidgets with no geometry — they fill the parent.
      const isContainer = cls === "caFrame" || cls === "QGroupBox" || cls === "QWidget" || cls === "QTabWidget" || cls === "QFrame";
      if (isContainer) {
        const z = zMap[name] ?? parentZ;
        const dx = geometry ? geometry.x : 0;
        const dy = geometry ? geometry.y : 0;
        // Build a local z-order map for children of this container.
        const localZorders = Array.from(child.querySelectorAll(":scope > zorder"));
        if (localZorders.length > 0) {
          localZorders.forEach((lz, i) => { zMap[lz.textContent ?? ""] = z + i * 0.001; });
        }
        collectWidgets(child, offsetX + dx, offsetY + dy, z);
      } else if (geometry) {
        const zIndex = zMap[name] ?? parentZ;
        widgets.push({
          class: cls, name,
          geometry: { ...geometry, x: geometry.x + offsetX, y: geometry.y + offsetY },
          props, zIndex,
        });
      }
    }
  }

  collectWidgets(central, 0, 0, 0);

  // Render back-to-front
  widgets.sort((a, b) => a.zIndex - b.zIndex);
  return { nativeWidth, nativeHeight, widgets };
}
