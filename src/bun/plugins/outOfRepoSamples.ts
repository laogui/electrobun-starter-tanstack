import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TITLE_MANIFEST = 'title-tools/ghostboard.plugin.json';

export function ghostboardPluginSamplesRoot(): string {
  const fromEnv = process.env.GHOSTBOARD_PLUGIN_SAMPLES?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return resolve(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../..',
      'ghostboard-plugin-samples'
    )
  );
}

export function tryGhostboardPluginSamplesRoot(): string | null {
  const root = ghostboardPluginSamplesRoot();
  if (!existsSync(join(root, TITLE_MANIFEST))) {
    return null;
  }
  return root;
}

export function requireGhostboardPluginSamplesRoot(): string {
  const root = tryGhostboardPluginSamplesRoot();
  if (!root) {
    throw new Error(
      `independent plugin samples were not found at ${ghostboardPluginSamplesRoot()}; set GHOSTBOARD_PLUGIN_SAMPLES or clone ghostboard-plugin-samples next to this repository`
    );
  }
  return root;
}
