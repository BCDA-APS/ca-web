// Shared monotonically-increasing z-index counter so panels and overlays
// compete for stacking on the same axis. Without this, OverlayPanel's
// hardcoded z keeps UI-rendered screens forever above React panels.
let gZ = 10;
export function nextZ(): number {
  return ++gZ;
}
