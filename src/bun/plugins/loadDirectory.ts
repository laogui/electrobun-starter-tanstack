import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  isPluginManifestError,
  LEGACY_PLUGIN_MESSAGE,
  type PluginManifest,
  parsePluginManifest,
} from '../../shared/plugins/manifest';

export interface LoadedPluginDirectory {
  directory: string;
  manifest: PluginManifest;
  sources: Record<string, string>;
}

export class PluginDirectoryError extends Error {
  code: 'not-found' | 'invalid-manifest' | 'legacy-contract' | 'missing-entry';

  constructor(code: PluginDirectoryError['code'], message: string) {
    super(message);
    this.name = 'PluginDirectoryError';
    this.code = code;
  }
}

async function readPackageFile(root: string, path: string): Promise<string> {
  const filename = join(root, path);
  const resolved = await realpath(filename);
  const local = relative(root, resolved);
  if (
    isAbsolute(local) ||
    local === '..' ||
    local.startsWith(`..${sep}`) ||
    !(await lstat(resolved)).isFile()
  ) {
    throw new Error(
      `package file escapes its directory or is not a file: ${path}`
    );
  }
  return await readFile(resolved, 'utf8');
}

export async function loadPluginDirectory(
  directory: string
): Promise<LoadedPluginDirectory> {
  const root = await realpath(resolve(directory));
  let raw: string;
  try {
    raw = await readPackageFile(root, 'manifest.json');
  } catch (error) {
    try {
      await lstat(join(root, 'ghostboard.plugin.json'));
    } catch {
      throw new PluginDirectoryError(
        'not-found',
        `Cannot read manifest.json in ${root}: ${String(error)}`
      );
    }
    throw new PluginDirectoryError('legacy-contract', LEGACY_PLUGIN_MESSAGE);
  }
  const manifest = parsePluginManifest(raw);
  if (isPluginManifestError(manifest)) {
    throw new PluginDirectoryError(
      manifest.code === 'legacy-contract'
        ? 'legacy-contract'
        : 'invalid-manifest',
      manifest.message
    );
  }
  let source: string;
  try {
    source = await readPackageFile(root, manifest.entrypoints.app);
  } catch {
    throw new PluginDirectoryError(
      'missing-entry',
      `Missing or unsafe app entry: ${manifest.entrypoints.app}`
    );
  }
  return {
    directory: resolve(directory),
    manifest,
    sources: { [manifest.entrypoints.app]: source },
  };
}
