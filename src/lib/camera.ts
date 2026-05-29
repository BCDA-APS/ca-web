/** Entry in CameraViewer's `knownCameras` list. Shared by the widget
 * (consumer) and the deployment-specific camera lists (producers) so the
 * shape stays consistent. The widget assumes the standard AreaDetector
 * convention: `${prefix}cam1:` for AD controls and `${prefix}image1:`
 * for the image data. */
export interface CameraEntry {
  label: string;
  prefix: string;
}
