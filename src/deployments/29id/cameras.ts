// 29ID-hutch cameras. Shared by the BL Layout shortcut (29ID-A) and the
// ARPES Chamber More menu (29ID-C). Each entry's `prefix` is the
// AreaDetector record prefix (PFX:cam1: + PFX:image1: pair).
export const CAMERAS_29ID: Array<{ label: string; prefix: string }> = [
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

export function spawnCameras() {
  window.dispatchEvent(new CustomEvent("open-camera", { detail: {
    label: "Cameras",
    knownCameras: CAMERAS_29ID,
  }}));
}
