import { existsSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import {
  generateInstanceId,
  isCanvasTypeId,
  isInstanceId,
} from '../../shared/extensions/ids';
import {
  EXTENSION_INSTANCE_SCHEMA,
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
  INSTANCE_JSON_MAX_BYTES,
  instanceJsonSize,
  type ParsedExtensionInstance,
  parseExtensionInstanceRecord,
  serializeExtensionInstance,
} from '../../shared/extensions/instance';
import type { ExtensionPresentation } from '../../shared/extensions/presentation';
import { atomicWrite } from '../atomicWrite';
import { notifyContentChanged } from '../plugins/contentEvents';

export function instanceRelativePath(instanceId: string): string {
  if (!isInstanceId(instanceId)) {
    throw new Error('Invalid instanceId for extension path.');
  }
  return `.ghostboard/extension-instances/${instanceId}.json`;
}

function assertWorkspaceInstancePath(
  wsPath: string,
  relativePath: string
): string {
  if (!relativePath.trim()) {
    throw new Error('Instance path is required.');
  }
  if (isAbsolute(relativePath)) {
    throw new Error('Instance path must be relative.');
  }
  const normalized = normalize(relativePath).replaceAll('\\', '/');
  if (
    !normalized.startsWith('.ghostboard/extension-instances/') ||
    normalized.split('/').includes('..') ||
    !normalized.endsWith('.json')
  ) {
    throw new Error(
      'Instance path must stay inside .ghostboard/extension-instances/.'
    );
  }
  const fullPath = resolve(wsPath, normalized);
  const root = resolve(wsPath, '.ghostboard', 'extension-instances');
  const rel = relative(root, fullPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      'Instance path must stay inside .ghostboard/extension-instances/.'
    );
  }
  return fullPath;
}

function parsedToError(
  parsed: ParsedExtensionInstance | ExtensionInstanceLoadError
): parsed is ExtensionInstanceLoadError {
  return 'error' in parsed;
}

export async function createExtensionInstance(
  wsPath: string,
  input: {
    appVersion: string;
    canvasTypeId: string;
    dataVersion: number;
    id?: string;
    presentation: ExtensionPresentation;
    state: unknown;
  }
): Promise<ExtensionInstanceRecord> {
  if (!isCanvasTypeId(input.canvasTypeId)) {
    throw new Error('Invalid canvasTypeId.');
  }
  const id = input.id ?? generateInstanceId();
  if (!isInstanceId(id)) {
    throw new Error('Invalid instanceId.');
  }
  const existing = await loadExtensionInstance(wsPath, id);
  if (!parsedToError(existing)) {
    return existing.record;
  }
  const now = new Date().toISOString();
  const record: ExtensionInstanceRecord = {
    schema: EXTENSION_INSTANCE_SCHEMA,
    id,
    canvasTypeId: input.canvasTypeId,
    appVersion: input.appVersion,
    dataVersion: input.dataVersion,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    state: input.state,
    presentation: input.presentation,
  };
  await saveExtensionInstance(wsPath, { extras: {}, record });
  return record;
}

export async function loadExtensionInstance(
  wsPath: string,
  instanceId: string
): Promise<ParsedExtensionInstance | ExtensionInstanceLoadError> {
  if (!isInstanceId(instanceId)) {
    return { id: instanceId, error: 'corrupted' };
  }
  const fullPath = assertWorkspaceInstancePath(
    wsPath,
    instanceRelativePath(instanceId)
  );
  const file = Bun.file(fullPath);
  if (!(await file.exists())) {
    return { id: instanceId, error: 'missing' };
  }
  try {
    const parsed = parseExtensionInstanceRecord(await file.json());
    if (parsedToError(parsed)) {
      return { id: instanceId, error: 'corrupted' };
    }
    return parsed;
  } catch {
    return { id: instanceId, error: 'corrupted' };
  }
}

export async function loadExtensionInstances(
  wsPath: string,
  instanceIds: string[]
): Promise<
  Record<string, ExtensionInstanceRecord | ExtensionInstanceLoadError>
> {
  const uniqueIds = [...new Set(instanceIds)];
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      const loaded = await loadExtensionInstance(wsPath, id);
      if (parsedToError(loaded)) {
        return [id, loaded] as const;
      }
      return [id, loaded.record] as const;
    })
  );
  return Object.fromEntries(results);
}

export async function saveExtensionInstance(
  wsPath: string,
  parsed: ParsedExtensionInstance
): Promise<void> {
  const validated = parseExtensionInstanceRecord(
    serializeExtensionInstance(parsed)
  );
  if (parsedToError(validated)) {
    throw new Error(
      `Refusing to save invalid extension instance: ${validated.error}`
    );
  }
  const payload = serializeExtensionInstance(validated);
  if (instanceJsonSize(payload) > INSTANCE_JSON_MAX_BYTES) {
    throw new Error('Extension instance exceeds the 1 MiB limit.');
  }
  const fullPath = assertWorkspaceInstancePath(
    wsPath,
    instanceRelativePath(validated.record.id)
  );
  await atomicWrite(fullPath, JSON.stringify(payload, null, 2));
  notifyContentChanged(wsPath, {
    kind: 'extension',
    ids: [validated.record.id],
    operation: 'upsert',
  });
}

export async function updateExtensionInstance(
  wsPath: string,
  input: {
    appVersion: string;
    expectedRevision?: number;
    instanceId: string;
    presentation: ExtensionPresentation;
    state: unknown;
  }
): Promise<ParsedExtensionInstance | ExtensionInstanceLoadError> {
  const current = await loadExtensionInstance(wsPath, input.instanceId);
  if (parsedToError(current)) {
    return current;
  }
  if (
    input.expectedRevision != null &&
    current.record.revision !== input.expectedRevision
  ) {
    throw new Error('revision-conflict');
  }
  const next: ParsedExtensionInstance = {
    extras: current.extras,
    record: {
      ...current.record,
      appVersion: input.appVersion,
      revision: current.record.revision + 1,
      updatedAt: new Date().toISOString(),
      state: input.state,
      presentation: input.presentation,
    },
  };
  await saveExtensionInstance(wsPath, next);
  return next;
}

export async function cloneExtensionInstance(
  wsPath: string,
  instanceId: string
): Promise<ExtensionInstanceRecord | null> {
  const source = await loadExtensionInstance(wsPath, instanceId);
  if (parsedToError(source)) {
    return null;
  }
  const now = new Date().toISOString();
  const cloned: ParsedExtensionInstance = {
    extras: source.extras,
    record: {
      ...source.record,
      id: generateInstanceId(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    },
  };
  await saveExtensionInstance(wsPath, cloned);
  return cloned.record;
}

export async function deleteExtensionInstance(
  wsPath: string,
  instanceId: string
): Promise<boolean> {
  const fullPath = assertWorkspaceInstancePath(
    wsPath,
    instanceRelativePath(instanceId)
  );
  if (!existsSync(fullPath)) {
    return false;
  }
  await unlink(fullPath);
  notifyContentChanged(wsPath, {
    kind: 'extension',
    ids: [instanceId],
    operation: 'delete',
  });
  return true;
}

export function instanceDir(wsPath: string): string {
  return resolve(wsPath, '.ghostboard', 'extension-instances');
}

export async function deleteInstancesByCanvasType(
  wsPath: string,
  canvasTypeId: string
): Promise<string[]> {
  if (!isCanvasTypeId(canvasTypeId)) {
    throw new Error('Invalid canvasTypeId.');
  }
  const dir = instanceDir(wsPath);
  if (!existsSync(dir)) {
    return [];
  }
  const deleted: string[] = [];
  const names = await readdir(dir);
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const instanceId = name.slice(0, -5);
    const loaded = await loadExtensionInstance(wsPath, instanceId);
    if (parsedToError(loaded) || loaded.record.canvasTypeId !== canvasTypeId) {
      continue;
    }
    if (await deleteExtensionInstance(wsPath, instanceId)) {
      deleted.push(instanceId);
    }
  }
  return deleted;
}

export async function countInstancesByCanvasType(
  wsPath: string
): Promise<Record<string, number>> {
  const dir = instanceDir(wsPath);
  if (!existsSync(dir)) {
    return {};
  }
  const names = await readdir(dir);
  const counts: Record<string, number> = {};
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const loaded = await loadExtensionInstance(wsPath, name.slice(0, -5));
    if (parsedToError(loaded)) {
      continue;
    }
    const key = loaded.record.canvasTypeId;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
