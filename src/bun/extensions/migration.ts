import {
  canvasTypeIdForLegacyNodeType,
  canvasTypeIdForWidgetKind,
} from '../../shared/extensions/builtinIds';
import {
  buildFilePresentation,
  buildImagePresentation,
  buildRecordingPresentation,
  normalizeFileState,
  normalizeImageState,
  normalizeRecordingState,
} from '../../shared/extensions/media/state';
import {
  persistableExtensionNode,
  readWidgetId,
  readWidgetKind,
} from '../../shared/extensions/migrateNodes';
import {
  instanceIdFromInlineNode,
  instanceIdFromWidgetId,
  LEGACY_MIGRATION_ENABLED,
} from '../../shared/extensions/migrationIds';
import {
  buildChecklistPresentation,
  buildPomodoroPresentation,
  buildReminderPresentation,
  normalizeChecklistState,
  normalizePomodoroState,
  normalizeReminderState,
} from '../../shared/extensions/productivity/state';
import {
  buildLinkPresentation,
  normalizeLinkState,
} from '../../shared/extensions/web/link';
import type { ManifestNode } from '../manifest';
import { copyLegacyWidgetTagsOnce } from '../nodeMetadata';
import {
  loadWidget,
  type WidgetLoadError,
  type WidgetRecord,
} from '../widgets';
import {
  createExtensionInstance,
  loadExtensionInstance,
} from './instanceStore';

function isWidgetLoadError(
  record: WidgetRecord | WidgetLoadError
): record is WidgetLoadError {
  return 'error' in record;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nodeData(node: { data?: unknown }): Record<string, unknown> {
  return isRecord(node.data) ? node.data : {};
}

/**
 * Apply a migrated node (an open record from the shared migration helpers)
 * back onto its typed manifest node. Migration only rewrites `type` and
 * `data`; every other field is carried over from the spread of the original.
 */
function withMigratedFields(
  original: ManifestNode,
  migrated: Record<string, unknown>
): ManifestNode {
  return {
    ...original,
    type: typeof migrated.type === 'string' ? migrated.type : original.type,
    data: nodeData(migrated),
  };
}

async function ensureInstance(
  wsPath: string,
  input: {
    appVersion: string;
    canvasTypeId: string;
    dataVersion: number;
    id: string;
    presentation: { title: string; subtitle?: string; plainText?: string };
    state: unknown;
  }
): Promise<boolean> {
  const existing = await loadExtensionInstance(wsPath, input.id);
  if (!('error' in existing)) {
    return true;
  }
  if (existing.error === 'corrupted') {
    return false;
  }
  try {
    await createExtensionInstance(wsPath, {
      id: input.id,
      appVersion: input.appVersion,
      canvasTypeId: input.canvasTypeId,
      dataVersion: input.dataVersion,
      presentation: input.presentation,
      state: input.state,
    });
    return true;
  } catch (error) {
    console.warn('[extensions] migrate create instance failed', error);
    return false;
  }
}

function presentationForWidget(kind: string, state: unknown) {
  switch (kind) {
    case 'checklist':
      return buildChecklistPresentation(normalizeChecklistState(state));
    case 'pomodoro':
      return buildPomodoroPresentation(normalizePomodoroState(state));
    case 'reminder':
      return buildReminderPresentation(normalizeReminderState(state));
    default:
      return { title: kind };
  }
}

function stateForWidget(kind: string, record: WidgetRecord): unknown {
  switch (kind) {
    case 'checklist':
      return normalizeChecklistState({
        title: record.title,
        ...(isRecord(record.data) ? record.data : {}),
      });
    case 'pomodoro':
      return normalizePomodoroState({
        title: record.title,
        ...(isRecord(record.data) ? record.data : {}),
      });
    case 'reminder':
      return normalizeReminderState({
        title: record.title,
        ...(isRecord(record.data) ? record.data : {}),
      });
    default:
      return record.data;
  }
}

async function migrateWidgetLike(
  wsPath: string,
  appVersion: string,
  node: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!LEGACY_MIGRATION_ENABLED.widget) {
    return null;
  }
  const data = nodeData(node);
  const widgetId = readWidgetId(data);
  const kind = readWidgetKind(data);
  const canvasTypeId = kind ? canvasTypeIdForWidgetKind(kind) : undefined;
  if (!(widgetId && canvasTypeId)) {
    return null;
  }
  const record = await loadWidget(wsPath, widgetId);
  if (isWidgetLoadError(record)) {
    return null;
  }
  const state = stateForWidget(record.kind, record);
  const ok = await ensureInstance(wsPath, {
    id: instanceIdFromWidgetId(widgetId),
    appVersion,
    canvasTypeId,
    dataVersion: 1,
    state,
    presentation: presentationForWidget(record.kind, state),
  });
  if (!ok) {
    return null;
  }
  if (typeof node.id === 'string') {
    await copyLegacyWidgetTagsOnce(wsPath, widgetId, node.id);
  }
  return persistableExtensionNode(
    node,
    canvasTypeId,
    instanceIdFromWidgetId(widgetId)
  );
}

async function migrateInlineNode(
  wsPath: string,
  appVersion: string,
  viewId: string,
  node: Record<string, unknown>,
  childPath?: string
): Promise<Record<string, unknown> | null> {
  const type = typeof node.type === 'string' ? node.type : '';
  const canvasTypeId = canvasTypeIdForLegacyNodeType(type);
  if (!canvasTypeId) {
    return null;
  }
  if (type === 'link' && !LEGACY_MIGRATION_ENABLED.link) {
    return null;
  }
  if (type === 'image' && !LEGACY_MIGRATION_ENABLED.image) {
    return null;
  }
  if (type === 'asset' && !LEGACY_MIGRATION_ENABLED.asset) {
    return null;
  }
  if (type === 'recording' && !LEGACY_MIGRATION_ENABLED.recording) {
    return null;
  }
  const nodeId = typeof node.id === 'string' ? node.id : '';
  if (!nodeId) {
    return null;
  }
  const instanceId = instanceIdFromInlineNode({
    viewId,
    nodeId,
    type,
    childPath,
  });
  const data = nodeData(node);
  let state: unknown;
  let presentation: { title: string; subtitle?: string; plainText?: string };
  switch (type) {
    case 'link': {
      state = normalizeLinkState(data);
      presentation = buildLinkPresentation(normalizeLinkState(data));
      break;
    }
    case 'image': {
      state = normalizeImageState(data);
      presentation = buildImagePresentation(normalizeImageState(data));
      break;
    }
    case 'asset': {
      state = normalizeFileState(data);
      presentation = buildFilePresentation(normalizeFileState(data));
      break;
    }
    case 'recording': {
      state = normalizeRecordingState(data);
      presentation = buildRecordingPresentation(normalizeRecordingState(data));
      break;
    }
    default:
      return null;
  }
  const ok = await ensureInstance(wsPath, {
    id: instanceId,
    appVersion,
    canvasTypeId,
    dataVersion: 1,
    state,
    presentation,
  });
  if (!ok) {
    return null;
  }
  return persistableExtensionNode(node, canvasTypeId, instanceId);
}

async function migrateOneNode(
  wsPath: string,
  appVersion: string,
  viewId: string,
  node: Record<string, unknown>,
  childPath?: string
): Promise<{ changed: boolean; node: Record<string, unknown> }> {
  // Repair references migrated by older hosts, including Folder children.
  // Only built-in widget migrations use this deterministic instance prefix.
  if (node.type === 'extension') {
    const data = nodeData(node);
    if (
      typeof node.id === 'string' &&
      typeof data.instanceId === 'string' &&
      data.instanceId.startsWith('extinst_widget_') &&
      ['checklist', 'pomodoro', 'reminder'].some(
        (kind) => data.canvasTypeId === canvasTypeIdForWidgetKind(kind)
      )
    ) {
      await copyLegacyWidgetTagsOnce(
        wsPath,
        data.instanceId.slice('extinst_'.length),
        node.id
      );
    }
    return { changed: false, node };
  }
  if (node.type === 'widget') {
    const migrated = await migrateWidgetLike(wsPath, appVersion, node);
    return migrated
      ? { changed: true, node: migrated }
      : { changed: false, node };
  }
  const inline = await migrateInlineNode(
    wsPath,
    appVersion,
    viewId,
    node,
    childPath
  );
  return inline ? { changed: true, node: inline } : { changed: false, node };
}

async function migrateFolderChildren(
  wsPath: string,
  appVersion: string,
  viewId: string,
  folderId: string,
  children: unknown[]
): Promise<{ changed: boolean; children: unknown[] }> {
  let changed = false;
  const next = await Promise.all(
    children.map(async (raw) => {
      if (!isRecord(raw)) {
        return raw;
      }
      const childId = typeof raw.id === 'string' ? raw.id : '';
      const childPath = `${folderId}/${childId}`;
      const result = await migrateOneNode(
        wsPath,
        appVersion,
        viewId,
        raw,
        childPath
      );
      if (result.changed) {
        changed = true;
      }
      return result.node;
    })
  );
  return { changed, children: next };
}

export async function migrateLegacyCanvasNodes(
  wsPath: string,
  viewId: string,
  nodes: ManifestNode[],
  appVersion: string
): Promise<{ changed: boolean; nodes: ManifestNode[] }> {
  let changed = false;
  const next: ManifestNode[] = [];
  for (const rawNode of nodes) {
    const node: Record<string, unknown> = { ...rawNode };
    if (node.type === 'folder') {
      const data = nodeData(node);
      const children = Array.isArray(data.children) ? data.children : [];
      const folderId = typeof node.id === 'string' ? node.id : '';
      const migratedChildren = await migrateFolderChildren(
        wsPath,
        appVersion,
        viewId,
        folderId,
        children
      );
      if (migratedChildren.changed) {
        changed = true;
        next.push({
          ...rawNode,
          data: { ...data, children: migratedChildren.children },
        });
        continue;
      }
      next.push(rawNode);
      continue;
    }
    const result = await migrateOneNode(wsPath, appVersion, viewId, node);
    if (result.changed) {
      changed = true;
      next.push(withMigratedFields(rawNode, result.node));
    } else {
      next.push(rawNode);
    }
  }
  return { changed, nodes: next };
}

export function buildManifestNodesAfterExtensionMigration(
  originalNodes: ManifestNode[],
  migratedNodes: ManifestNode[]
): ManifestNode[] {
  const migratedById = new Map(
    migratedNodes.map((node) => [node.id, node] as const)
  );

  return originalNodes.map((node) => {
    const migrated = migratedById.get(node.id);
    if (!migrated) {
      return node;
    }

    if (node.type !== 'extension' && migrated.type === 'extension') {
      const data = nodeData(migrated);
      if (
        typeof data.canvasTypeId === 'string' &&
        typeof data.instanceId === 'string'
      ) {
        return withMigratedFields(
          node,
          persistableExtensionNode(
            { ...node },
            data.canvasTypeId,
            data.instanceId
          )
        );
      }
    }

    if (node.type === 'folder' && migrated.type === 'folder') {
      const originalChildren = Array.isArray(node.data.children)
        ? (node.data.children as Record<string, unknown>[])
        : [];
      const migratedChildren = Array.isArray(
        (migrated.data as Record<string, unknown>).children
      )
        ? ((migrated.data as Record<string, unknown>).children as Record<
            string,
            unknown
          >[])
        : [];
      const migratedChildById = new Map(
        migratedChildren
          .filter((child) => typeof child.id === 'string')
          .map((child) => [child.id as string, child] as const)
      );
      let childChanged = false;
      const nextChildren = originalChildren.map((child) => {
        const next = migratedChildById.get(String(child.id));
        if (!next || next.type !== 'extension' || child.type === 'extension') {
          return child;
        }
        const data = nodeData(next);
        if (
          !(
            typeof data.canvasTypeId === 'string' &&
            typeof data.instanceId === 'string'
          )
        ) {
          return child;
        }
        childChanged = true;
        return persistableExtensionNode(
          child,
          data.canvasTypeId,
          data.instanceId
        );
      });
      if (!childChanged) {
        return node;
      }
      return {
        ...node,
        data: { ...node.data, children: nextChildren },
      };
    }

    return node;
  });
}
