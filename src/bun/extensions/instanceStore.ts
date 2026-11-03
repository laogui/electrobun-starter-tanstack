import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
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
import { isPluginId } from '../../shared/plugins/ids';
import { atomicWrite } from '../atomicWrite';
import { withNoteWorkspace } from '../noteTransactions';
import { notifyContentChanged } from '../plugins/contentEvents';
import { resolveWorkspaceSubpath } from '../workspacePaths';

const MIGRATION_BACKUP_SCHEMA = 'ghostboard-plugin-migration-backup/v1';
const MIGRATION_BACKUP_MAX_BYTES = INSTANCE_JSON_MAX_BYTES + 16 * 1024;

interface PluginMigrationBackup {
  createdAt: string;
  instance: ParsedExtensionInstance;
  kind: 'migration' | 'restore-guard';
  pluginId: string;
  schema: typeof MIGRATION_BACKUP_SCHEMA;
}

export interface PluginMigrationBackupSummary {
  count: number;
  latestAt?: string;
}

function pluginIdForCanvasType(canvasTypeId: string): string | undefined {
  const separator = canvasTypeId.lastIndexOf('/');
  const pluginId = separator > 0 ? canvasTypeId.slice(0, separator) : '';
  return isPluginId(pluginId) ? pluginId : undefined;
}

function migrationBackupDirectory(wsPath: string, pluginId: string): string {
  if (!isPluginId(pluginId)) {
    throw new Error('Invalid pluginId for migration backup.');
  }
  return resolve(
    wsPath,
    '.ghostboard',
    'plugin-migrations',
    encodeURIComponent(pluginId)
  );
}

function parseMigrationBackup(
  value: unknown
): PluginMigrationBackup | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('schema' in value) ||
    value.schema !== MIGRATION_BACKUP_SCHEMA ||
    !('kind' in value) ||
    !['migration', 'restore-guard'].includes(String(value.kind)) ||
    !('pluginId' in value) ||
    typeof value.pluginId !== 'string' ||
    !isPluginId(value.pluginId) ||
    !('createdAt' in value) ||
    typeof value.createdAt !== 'string' ||
    !('instance' in value) ||
    !value.instance ||
    typeof value.instance !== 'object' ||
    !('record' in value.instance) ||
    !('extras' in value.instance) ||
    !value.instance.extras ||
    typeof value.instance.extras !== 'object' ||
    Array.isArray(value.instance.extras)
  ) {
    return;
  }
  const parsed = parseExtensionInstanceRecord(
    serializeExtensionInstance(value.instance as ParsedExtensionInstance)
  );
  if (parsedToError(parsed)) {
    return;
  }
  if (pluginIdForCanvasType(parsed.record.canvasTypeId) !== value.pluginId) {
    return;
  }
  return {
    schema: MIGRATION_BACKUP_SCHEMA,
    kind: value.kind as PluginMigrationBackup['kind'],
    pluginId: value.pluginId,
    createdAt: value.createdAt,
    instance: parsed,
  };
}

async function writeMigrationBackup(
  wsPath: string,
  parsed: ParsedExtensionInstance,
  kind: PluginMigrationBackup['kind']
): Promise<void> {
  const pluginId = pluginIdForCanvasType(parsed.record.canvasTypeId);
  if (!pluginId) {
    return;
  }
  const directory = migrationBackupDirectory(wsPath, pluginId);
  await mkdir(directory, { recursive: true });
  const backup: PluginMigrationBackup = {
    schema: MIGRATION_BACKUP_SCHEMA,
    kind,
    pluginId,
    createdAt: new Date().toISOString(),
    instance: parsed,
  };
  const text = JSON.stringify(backup, null, 2);
  if (new TextEncoder().encode(text).byteLength > MIGRATION_BACKUP_MAX_BYTES) {
    throw new Error('Extension migration backup exceeds the size limit.');
  }
  await atomicWrite(
    resolve(
      directory,
      `${parsed.record.id}-v${parsed.record.dataVersion}-r${parsed.record.revision}-${kind}.json`
    ),
    text
  );
}

async function readPluginMigrationBackups(
  wsPath: string,
  pluginId: string,
  kind: PluginMigrationBackup['kind'] = 'migration'
): Promise<PluginMigrationBackup[]> {
  const directory = migrationBackupDirectory(wsPath, pluginId);
  const backups: PluginMigrationBackup[] = [];
  for (const name of await readdir(directory).catch(() => [])) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      const text = await readFile(resolve(directory, name), 'utf8');
      if (
        new TextEncoder().encode(text).byteLength > MIGRATION_BACKUP_MAX_BYTES
      ) {
        continue;
      }
      const backup = parseMigrationBackup(JSON.parse(text) as unknown);
      if (backup?.pluginId === pluginId && backup.kind === kind) {
        backups.push(backup);
      }
    } catch {
      // A damaged backup is ignored; it never makes live instance data worse.
    }
  }
  return backups;
}

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
  return resolveWorkspaceSubpath(wsPath, relativePath, {
    dir: '.ghostboard/extension-instances',
    extension: '.json',
    label: 'Instance',
  }).fullPath;
}

function parsedToError(
  parsed: ParsedExtensionInstance | ExtensionInstanceLoadError
): parsed is ExtensionInstanceLoadError {
  return 'error' in parsed;
}

async function createExtensionInstanceUnlocked(
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

async function loadExtensionInstanceUnlocked(
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

async function loadExtensionInstancesUnlocked(
  wsPath: string,
  instanceIds: string[]
): Promise<
  Record<string, ExtensionInstanceRecord | ExtensionInstanceLoadError>
> {
  const uniqueIds = [...new Set(instanceIds)];
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const loaded = await loadExtensionInstance(wsPath, id);
        if (parsedToError(loaded)) {
          return [id, loaded] as const;
        }
        return [id, loaded.record] as const;
      } catch (error) {
        console.warn(`[extensions] Failed to load ${id}:`, error);
        return [id, { id, error: 'corrupted' as const }] as const;
      }
    })
  );
  return Object.fromEntries(results);
}

function newestMigrationByInstance(
  backups: PluginMigrationBackup[]
): PluginMigrationBackup[] {
  const newest = new Map<string, PluginMigrationBackup>();
  for (const backup of backups) {
    const current = newest.get(backup.instance.record.id);
    if (
      !current ||
      backup.instance.record.dataVersion >
        current.instance.record.dataVersion ||
      (backup.instance.record.dataVersion ===
        current.instance.record.dataVersion &&
        backup.instance.record.revision > current.instance.record.revision)
    ) {
      newest.set(backup.instance.record.id, backup);
    }
  }
  return [...newest.values()];
}

async function pluginMigrationBackupSummaryUnlocked(
  wsPath: string,
  pluginId: string
): Promise<PluginMigrationBackupSummary> {
  const available: PluginMigrationBackup[] = [];
  for (const backup of newestMigrationByInstance(
    await readPluginMigrationBackups(wsPath, pluginId)
  )) {
    const current = await loadExtensionInstance(
      wsPath,
      backup.instance.record.id
    );
    if (
      !parsedToError(current) &&
      current.record.canvasTypeId === backup.instance.record.canvasTypeId &&
      current.record.dataVersion > backup.instance.record.dataVersion
    ) {
      available.push(backup);
    }
  }
  const latestAt = available
    .map((backup) => backup.createdAt)
    .sort()
    .at(-1);
  return {
    count: available.length,
    ...(latestAt ? { latestAt } : {}),
  };
}

async function restorePluginMigrationBackupsUnlocked(
  wsPath: string,
  pluginId: string
): Promise<{ restored: number; skipped: number }> {
  let restored = 0;
  let skipped = 0;
  for (const backup of newestMigrationByInstance(
    await readPluginMigrationBackups(wsPath, pluginId)
  )) {
    const current = await loadExtensionInstance(
      wsPath,
      backup.instance.record.id
    );
    if (
      parsedToError(current) ||
      current.record.canvasTypeId !== backup.instance.record.canvasTypeId ||
      current.record.dataVersion <= backup.instance.record.dataVersion
    ) {
      skipped += 1;
      continue;
    }
    await writeMigrationBackup(wsPath, current, 'restore-guard');
    const now = new Date().toISOString();
    await saveExtensionInstance(wsPath, {
      extras: backup.instance.extras,
      record: {
        ...backup.instance.record,
        appVersion: current.record.appVersion,
        revision: current.record.revision + 1,
        updatedAt: now,
      },
    });
    restored += 1;
  }
  return { restored, skipped };
}

async function saveExtensionInstanceUnlocked(
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

async function updateExtensionInstanceUnlocked(
  wsPath: string,
  input: {
    appVersion: string;
    dataVersion?: number;
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
  if (
    input.dataVersion !== undefined &&
    (!Number.isSafeInteger(input.dataVersion) ||
      input.dataVersion < current.record.dataVersion)
  ) {
    throw new Error('invalid-data-version');
  }
  const next: ParsedExtensionInstance = {
    extras: current.extras,
    record: {
      ...current.record,
      appVersion: input.appVersion,
      dataVersion: input.dataVersion ?? current.record.dataVersion,
      revision: current.record.revision + 1,
      updatedAt: new Date().toISOString(),
      state: input.state,
      presentation: input.presentation,
    },
  };
  if (
    input.dataVersion !== undefined &&
    input.dataVersion > current.record.dataVersion
  ) {
    await writeMigrationBackup(wsPath, current, 'migration');
  }
  await saveExtensionInstance(wsPath, next);
  return next;
}

async function cloneExtensionInstanceUnlocked(
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
  if (
    existsSync(
      assertWorkspaceInstancePath(
        wsPath,
        instanceRelativePath(cloned.record.id)
      )
    )
  ) {
    throw new Error('Clone id already exists');
  }
  await saveExtensionInstance(wsPath, cloned);
  return cloned.record;
}

async function deleteExtensionInstanceUnlocked(
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

async function deleteInstancesByCanvasTypeUnlocked(
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

async function countInstancesByCanvasTypeUnlocked(
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

export const createExtensionInstance = (
  ...args: Parameters<typeof createExtensionInstanceUnlocked>
) => withNoteWorkspace(args[0], () => createExtensionInstanceUnlocked(...args));

export const loadExtensionInstance = (
  ...args: Parameters<typeof loadExtensionInstanceUnlocked>
) => withNoteWorkspace(args[0], () => loadExtensionInstanceUnlocked(...args));

export const saveExtensionInstance = (
  ...args: Parameters<typeof saveExtensionInstanceUnlocked>
) => withNoteWorkspace(args[0], () => saveExtensionInstanceUnlocked(...args));

export const updateExtensionInstance = (
  ...args: Parameters<typeof updateExtensionInstanceUnlocked>
) => withNoteWorkspace(args[0], () => updateExtensionInstanceUnlocked(...args));

export const cloneExtensionInstance = (
  ...args: Parameters<typeof cloneExtensionInstanceUnlocked>
) => withNoteWorkspace(args[0], () => cloneExtensionInstanceUnlocked(...args));

export const deleteExtensionInstance = (
  ...args: Parameters<typeof deleteExtensionInstanceUnlocked>
) => withNoteWorkspace(args[0], () => deleteExtensionInstanceUnlocked(...args));

export const loadExtensionInstances = (
  ...args: Parameters<typeof loadExtensionInstancesUnlocked>
) => withNoteWorkspace(args[0], () => loadExtensionInstancesUnlocked(...args));

export const pluginMigrationBackupSummary = (
  ...args: Parameters<typeof pluginMigrationBackupSummaryUnlocked>
) =>
  withNoteWorkspace(args[0], () =>
    pluginMigrationBackupSummaryUnlocked(...args)
  );

export const restorePluginMigrationBackups = (
  ...args: Parameters<typeof restorePluginMigrationBackupsUnlocked>
) =>
  withNoteWorkspace(args[0], () =>
    restorePluginMigrationBackupsUnlocked(...args)
  );

export const deleteInstancesByCanvasType = (
  ...args: Parameters<typeof deleteInstancesByCanvasTypeUnlocked>
) =>
  withNoteWorkspace(args[0], () =>
    deleteInstancesByCanvasTypeUnlocked(...args)
  );

export const countInstancesByCanvasType = (
  ...args: Parameters<typeof countInstancesByCanvasTypeUnlocked>
) =>
  withNoteWorkspace(args[0], () => countInstancesByCanvasTypeUnlocked(...args));
