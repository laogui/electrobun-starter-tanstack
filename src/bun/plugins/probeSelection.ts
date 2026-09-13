import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Packaged acceptance probes cannot drive the native file dialog. When a probe
 * directory is configured they select `<dir>/selected.csv` (or nothing when
 * the file is absent, which models a cancelled dialog). The T5 probe can opt
 * out with `GHOSTBOARD_PLUGIN_T5_PICKER=manual` so a person exercises the real
 * picker; every other start keeps the native dialog.
 */
export function scriptedProbeSelection(
  env: Record<string, string | undefined>,
  kind: 'directory' | 'file'
): string[] | null {
  if (kind !== 'file') {
    return null;
  }
  const directory =
    env.GHOSTBOARD_PLUGIN_T3_DIR ??
    (env.GHOSTBOARD_PLUGIN_T5_DIR &&
    env.GHOSTBOARD_PLUGIN_T5_PICKER !== 'manual'
      ? env.GHOSTBOARD_PLUGIN_T5_DIR
      : undefined);
  if (!directory) {
    return null;
  }
  return [join(directory, 'selected.csv')].filter(existsSync);
}
