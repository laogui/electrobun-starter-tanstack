import {
  CHECKLIST_CANVAS_TYPE_ID,
  canvasTypeIdForLegacyNodeType,
  canvasTypeIdForWidgetKind,
  FILE_CANVAS_TYPE_ID,
  RECORDING_CANVAS_TYPE_ID,
} from '../../shared/extensions/builtinIds';
import {
  type ChecklistState,
  normalizeChecklistState,
} from '../../shared/extensions/legacyChecklist';
import {
  buildFilePresentation,
  buildImagePresentation,
  fileStateFromRecording,
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
  stableHex,
} from '../../shared/extensions/migrationIds';
import {
  buildLinkPresentation,
  normalizeLinkState,
} from '../../shared/extensions/web/link';
import type { ManifestNode } from '../manifest';
import { copyLegacyWidgetTagsOnce, moveNodeMetadataKey } from '../nodeMetadata';
import { loadNoteRecord, noteRecordToCardData } from '../noteStore';
import { createNote, serializeChecklistItems } from '../notes';
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

/** Titles for retired widget kinds, which render as a "removed" placeholder. */
const RETIRED_WIDGET_TITLES: Record<string, string> = {
  pomodoro: 'Pomodoro',
  reminder: 'Reminder',
};

/**
 * Checklist cards were retired in favour of task lists inside a note. An old
 * checklist (widget or extension instance) becomes a note whose body is the
 * same items as GFM task-list markdown. The note id is derived from the old
 * id, so a load that fails to persist re-uses the same note next time.
 * Returns the card node (hydrated with the note) or null on failure.
 */
async function checklistToNoteCard(
  wsPath: string,
  node: Record<string, unknown>,
  sourceId: string,
  checklist: ChecklistState,
  color?: string
): Promise<Record<string, unknown> | null> {
  const noteId = `note_${stableHex(`checklist:${sourceId}`)}`;
  try {
    let record = await loadNoteRecord(wsPath, noteId);
    let file: string | undefined;
    if (!record) {
      file = await createNote(
        wsPath,
        noteId,
        checklist.title,
        'note',
        serializeChecklistItems(checklist.items ?? []),
        color
      );
      record = await loadNoteRecord(wsPath, noteId, file);
    }
    if (!record) {
      return null;
    }
    if (typeof node.id === 'string') {
      await moveNodeMetadataKey(wsPath, node.id, noteId);
    }
    const { data: _data, type: _type, ...rest } = node;
    return {
      ...rest,
      type: 'card',
      noteId,
      data: { ...noteRecordToCardData(record), noteId },
    };
  } catch (error) {
    console.warn('[extensions] checklist → note migration failed', error);
    return null;
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
  const recordData = isRecord(record.data) ? record.data : {};
  if (record.kind === 'checklist') {
    if (typeof node.id === 'string') {
      await copyLegacyWidgetTagsOnce(wsPath, widgetId, node.id);
    }
    return checklistToNoteCard(
      wsPath,
      node,
      instanceIdFromWidgetId(widgetId),
      normalizeChecklistState({ title: record.title, ...recordData })
    );
  }
  const ok = await ensureInstance(wsPath, {
    id: instanceIdFromWidgetId(widgetId),
    appVersion,
    canvasTypeId,
    dataVersion: 1,
    state: { title: record.title, ...recordData },
    presentation: {
      title: record.title || RETIRED_WIDGET_TITLES[record.kind] || record.kind,
    },
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
  // Recording cards were retired: legacy recordings land as audio files.
  const canvasTypeId =
    type === 'recording'
      ? FILE_CANVAS_TYPE_ID
      : canvasTypeIdForLegacyNodeType(type);
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
      const file = fileStateFromRecording(normalizeRecordingState(data));
      state = file;
      presentation = buildFilePresentation(file);
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

/**
 * A recording instance from before recordings were retired becomes a file
 * instance (new deterministic id) holding the same audio attachment.
 */
async function migrateRecordingInstance(
  wsPath: string,
  appVersion: string,
  node: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const data = nodeData(node);
  if (
    data.canvasTypeId !== RECORDING_CANVAS_TYPE_ID ||
    typeof data.instanceId !== 'string'
  ) {
    return null;
  }
  const loaded = await loadExtensionInstance(wsPath, data.instanceId);
  if ('error' in loaded) {
    return null;
  }
  const file = fileStateFromRecording(
    normalizeRecordingState(loaded.record.state)
  );
  const instanceId = `${data.instanceId}_file`;
  const ok = await ensureInstance(wsPath, {
    id: instanceId,
    appVersion,
    canvasTypeId: FILE_CANVAS_TYPE_ID,
    dataVersion: 1,
    state: file,
    presentation: buildFilePresentation(file),
  });
  if (!ok) {
    return null;
  }
  return persistableExtensionNode(node, FILE_CANVAS_TYPE_ID, instanceId);
}

async function migrateChecklistInstance(
  wsPath: string,
  node: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const data = nodeData(node);
  if (
    data.canvasTypeId !== CHECKLIST_CANVAS_TYPE_ID ||
    typeof data.instanceId !== 'string'
  ) {
    return null;
  }
  const instanceId = data.instanceId;
  if (typeof node.id === 'string' && instanceId.startsWith('extinst_widget_')) {
    await copyLegacyWidgetTagsOnce(
      wsPath,
      instanceId.slice('extinst_'.length),
      node.id
    );
  }
  const loaded = await loadExtensionInstance(wsPath, instanceId);
  if ('error' in loaded) {
    return null;
  }
  const state = loaded.record.state;
  return checklistToNoteCard(
    wsPath,
    node,
    instanceId,
    normalizeChecklistState(state),
    isRecord(state) && typeof state.color === 'string' ? state.color : undefined
  );
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
    const recording = await migrateRecordingInstance(wsPath, appVersion, node);
    if (recording) {
      return { changed: true, node: recording };
    }
    const checklist = await migrateChecklistInstance(wsPath, node);
    if (checklist) {
      return { changed: true, node: checklist };
    }
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

/** Thin manifest reference for a card a retired type was converted into. */
function persistableCardFrom(
  original: Record<string, unknown>,
  migrated: { data?: unknown }
): Record<string, unknown> | null {
  const data = nodeData(migrated);
  if (typeof data.noteId !== 'string') {
    return null;
  }
  const { data: _data, ...rest } = original;
  return {
    ...rest,
    type: 'card',
    noteId: data.noteId,
    data: {
      noteId: data.noteId,
      ...(typeof data.title === 'string' ? { title: data.title } : {}),
      ...(typeof data.color === 'string' ? { color: data.color } : {}),
    },
  };
}

function extensionRefChanged(
  original: { data?: unknown; type?: unknown },
  migrated: { data?: unknown }
): boolean {
  if (original.type !== 'extension') {
    return true;
  }
  const before = nodeData(original);
  const after = nodeData(migrated);
  return (
    before.canvasTypeId !== after.canvasTypeId ||
    before.instanceId !== after.instanceId
  );
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

    if (node.type !== 'card' && migrated.type === 'card') {
      const card = persistableCardFrom({ ...node }, migrated);
      return card ? (card as unknown as ManifestNode) : node;
    }

    if (migrated.type === 'extension' && extensionRefChanged(node, migrated)) {
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
        if (next && child.type !== 'card' && next.type === 'card') {
          const card = persistableCardFrom(child, next);
          if (card) {
            childChanged = true;
            return card;
          }
          return child;
        }
        if (
          !next ||
          next.type !== 'extension' ||
          !extensionRefChanged(child, next)
        ) {
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
