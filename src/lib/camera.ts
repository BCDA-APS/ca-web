/** Entry in CameraViewer's `knownCameras` list. Shared by the widget
 * (consumer) and the deployment-specific camera lists (producers) so the
 * shape stays consistent.
 *
 * The standard AreaDetector convention assumes `${prefix}cam1:` for the
 * AD controls and `${prefix}image1:` for the image data. Set `cam` or
 * `image` to override when the IOC uses different plugin instance names
 * (e.g. an `image4:` plugin). Set `settingsFile`/`settingsMacros` to
 * point the gear button at a custom .ui screen instead of the default
 * ADAravis/ADVimba/ADBase derivation. */
export interface CameraEntry {
  label: string;
  prefix: string;
  image?: string;
  cam?: string;
  settingsFile?: string;
  settingsMacros?: Record<string, string>;
}
