import { homedir } from 'node:os';
import { basename, join } from 'node:path';

import { Utils } from 'electrobun/bun';

const APP_IDENTIFIER = 'com.ghostboard.app';
const KNOWN_CHANNELS = new Set(['dev', 'canary', 'stable']);

/**
 * Resolve the Electrobun build channel (`dev` / `canary` / `stable`).
 * Derived from `Utils.paths.userData`, which is `{osAppData}/{identifier}/{channel}`.
 */
export function getAppChannel(): string {
  const userData = Utils.paths.userData;
  const leaf = basename(userData);
  if (KNOWN_CHANNELS.has(leaf)) {
    return leaf;
  }

  const normalized = userData.replace(/\\/g, '/');
  const marker = `/${APP_IDENTIFIER}/`;
  const idx = normalized.lastIndexOf(marker);
  if (idx >= 0) {
    const channel = normalized.slice(idx + marker.length).split('/')[0];
    if (channel) {
      return channel;
    }
  }

  return 'unknown';
}

/**
 * App-level personal data root (outside any workspace).
 *
 * Default: `~/.ghostboard/{channel}`
 * Override: `GHOSTBOARD_DATA_DIR` (absolute path; used by tests / local isolation)
 */
export function getAppDataRoot(): string {
  const override = process.env.GHOSTBOARD_DATA_DIR?.trim();
  if (override) {
    return override;
  }
  return join(homedir(), '.ghostboard', getAppChannel());
}
