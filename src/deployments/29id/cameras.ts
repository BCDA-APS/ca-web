// 29ID-hutch cameras. Full list is shared by the BL Layout shortcut
// (29ID-A) and the "Open react…" Cameras template; the ARPES Chamber
// More menu (29ID-C) uses the smaller `CAMERAS_29IDC` subset relevant
// to that endstation. Shape documented at the CameraEntry type definition.
import type { CameraEntry } from "../../lib/camera";

export const CAMERAS_29ID: CameraEntry[] = [
  { label: "Cam 1", prefix: "29id_arv1:" },
  { label: "Cam 2", prefix: "29id_vmb2:" },
  { label: "Cam 3", prefix: "29id_vmb3:" },
  { label: "Cam 4", prefix: "29id_vmb4:" },
  { label: "Cam 5", prefix: "29id_arv5:" },
  { label: "Cam 6", prefix: "29id_vmb6:" },
  { label: "Cam 7", prefix: "29id_vmb7:" },
  { label: "Cam 8", prefix: "29id_arv8:" },
  { label: "Cam 9", prefix: "29id_arv9:" },
];

export const CAMERAS_29IDC: CameraEntry[] =
  CAMERAS_29ID.filter(c => c.prefix === "29id_arv1:" || c.prefix === "29id_arv9:");

export function spawnCameras(cameras: CameraEntry[] = CAMERAS_29ID) {
  window.dispatchEvent(new CustomEvent("open-camera", { detail: {
    label: "Cameras",
    knownCameras: cameras,
  }}));
}
