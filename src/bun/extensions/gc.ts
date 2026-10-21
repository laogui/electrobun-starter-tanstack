import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { collectAttachmentPaths } from '../../shared/extensions/media/state';
import { collectExtensionInstanceIds } from '../../shared/extensions/refs';
import { loadManifestsStrict } from '../manifest';
import { loadWorkspaceConfig } from '../workspace';
import { instanceDir, loadExtensionInstance } from './instanceStore';

function isInstanceLoadError(value: {
  error?: string;
  record?: unknown;
}): value is { error: string } {
  return typeof value.error === 'string';
}

/** Instance ids referenced by any active or trashed canvas. */
export async function collectReferencedInstanceIds(
  wsPath: string
): Promise<Set<string>> {
  const config = await loadWorkspaceConfig(wsPath);
  const files = [
    ...config.views.map((view) => view.file),
    ...(config.trash ?? []).map((entry) => entry.trashFile),
  ];
  const ids = new Set<string>();
  // Fail closed: see loadManifestsStrict.
  const manifests = await loadManifestsStrict(wsPath, files);
  for (const manifest of manifests) {
    for (const id of collectExtensionInstanceIds(manifest.nodes)) {
      ids.add(id);
    }
  }
  return ids;
}

export async function collectReferencedAttachmentPaths(
  wsPath: string
): Promise<Set<string>> {
  const dir = instanceDir(wsPath);
  const paths = new Set<string>();
  if (!existsSync(dir)) {
    return paths;
  }
  const names = await readdir(dir);
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const loaded = await loadExtensionInstance(wsPath, name.slice(0, -5));
    if (isInstanceLoadError(loaded) || !('record' in loaded)) {
      continue;
    }
    for (const path of collectAttachmentPaths(loaded.record.state)) {
      paths.add(path);
    }
  }
  return paths;
}

export async function listOrphanExtensionInstanceFiles(
  wsPath: string
): Promise<string[]> {
  const referenced = await collectReferencedInstanceIds(wsPath);
  const dir = instanceDir(wsPath);
  if (!existsSync(dir)) {
    return [];
  }
  const names = await readdir(dir);
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
    .filter((id) => !referenced.has(id))
    .map((id) => join('.ghostboard', 'extension-instances', `${id}.json`));
}
