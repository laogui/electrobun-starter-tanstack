import {
  assertWorkspaceAttachmentPath,
  attachmentExists,
  loadAttachment as loadWorkspaceAttachment,
  saveAttachment as saveWorkspaceAttachment,
} from './attachments';
import type { ManifestNode } from './manifest';
import { moveNodeMetadataKey } from './nodeMetadata';
import {
  loadNoteRecord,
  mergeNoteMeta,
  type NoteLocation,
  noteRecordToCardData,
} from './noteStore';
import { cardDataToNote, loadNote } from './notes';
import { writeNoteWithPreview } from './preview';
import {
  type ChecklistWidgetItem,
  loadWidget,
  saveWidget,
  WIDGET_SCHEMA,
  type WidgetLoadError,
  type WidgetRecord,
} from './widgets';

export const NOTE_ID_PREFIX_RE = /^note_/;

export function stripAttachmentRuntimeData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const {
    missing: _missing,
    previewUrl: _previewUrl,
    thumbnailUrl: _thumbnailUrl,
    ...restData
  } = data;
  return restData;
}

export function serializeWidgetReference(
  data: unknown
): Record<string, string> {
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    widgetId: typeof record.widgetId === 'string' ? record.widgetId : '',
    kind: typeof record.kind === 'string' ? record.kind : '',
  };
}

export const IMAGE_DATA_URL_RE = /^data:image\//i;

export async function serializeImageDataForManifest(
  wsPath: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { imageUrl, thumbnailUrl: _thumbnailUrl, ...restData } = data;
  const nextData: Record<string, unknown> = { ...restData };

  if (typeof nextData.imageFile === 'string' && nextData.imageFile.trim()) {
    return nextData;
  }

  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return nextData;
  }

  if (IMAGE_DATA_URL_RE.test(imageUrl)) {
    const saved = await saveWorkspaceAttachment(wsPath, {
      dataUrl: imageUrl,
      kind: 'image',
    });
    nextData.imageFile = saved.filePath;
    return nextData;
  }

  try {
    const { relativePath } = assertWorkspaceAttachmentPath(wsPath, imageUrl);
    nextData.imageFile = relativePath;
  } catch {
    // Non-workspace URLs are runtime-only for image nodes and are not persisted.
  }

  return nextData;
}

export async function hydrateAssetData(
  wsPath: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nextData: Record<string, unknown> = { ...data };
  const attachmentFile = data.attachmentFile;
  if (typeof attachmentFile === 'string') {
    try {
      const exists = await attachmentExists(wsPath, attachmentFile);
      if (!exists) {
        nextData.missing = true;
      }
    } catch {
      nextData.missing = true;
    }
  }

  const thumbnailFile = data.thumbnailFile;
  if (typeof thumbnailFile === 'string') {
    try {
      const thumbnail = await loadWorkspaceAttachment(wsPath, thumbnailFile);
      if (thumbnail) {
        nextData.thumbnailUrl = thumbnail.dataUrl;
      }
    } catch {
      // Thumbnail hydrate is best-effort; keep the asset usable without it.
    }
  }

  return nextData;
}

export async function hydrateImageData(
  wsPath: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const nextData: Record<string, unknown> = { ...data };
  const existingPreview =
    typeof data.thumbnailUrl === 'string' && Boolean(data.thumbnailUrl);
  let hasPreview = existingPreview;

  const thumbnailFile = data.thumbnailFile;
  if (typeof thumbnailFile === 'string' && !hasPreview) {
    try {
      const thumbnail = await loadWorkspaceAttachment(wsPath, thumbnailFile);
      if (thumbnail) {
        nextData.thumbnailUrl = thumbnail.dataUrl;
        hasPreview = true;
      }
    } catch {
      // Thumbnail hydrate is best-effort; fall back to the original below.
    }
  }

  const imageFile = data.imageFile;
  if (typeof imageFile === 'string' && !data.imageUrl && !hasPreview) {
    try {
      const image = await loadWorkspaceAttachment(wsPath, imageFile);
      if (image) {
        nextData.imageUrl = image.dataUrl;
      } else {
        console.warn(`[persistence] Attachment not found: ${imageFile}`);
      }
    } catch {
      console.warn(`[persistence] Attachment not found: ${imageFile}`);
    }
  }

  return nextData;
}

export function hasAttachmentRuntimeData(type: string | undefined): boolean {
  return type === 'asset' || type === 'recording';
}

export const asNoteString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Persist a manifest card's note during `saveManifest`.
 *
 * Discriminator (ADR 0002 v0.2 A6): a note that already has a BlockNote
 * sidecar is JSON-backed — `saveManifest` only merges note metadata (title /
 * color) into the sidecar and never touches blocks or writes Markdown. Legacy
 * (no-sidecar) checklist / plain-text cards keep the markdown-body round-trip
 * until their next focused-view edit migrates them to a sidecar.
 */
export async function persistManifestCardNote(
  wsPath: string,
  location: NoteLocation,
  noteId: string,
  cardData: Record<string, unknown>
): Promise<void> {
  if (location.hasSidecar) {
    // JSON is the source of truth — merge metadata only, never the body.
    await mergeNoteMeta(wsPath, noteId, {
      expectedRevision:
        typeof cardData.blocknoteRevision === 'number'
          ? cardData.blocknoteRevision
          : undefined,
      title: typeof cardData.title === 'string' ? cardData.title : undefined,
      color: typeof cardData.color === 'string' ? cardData.color : undefined,
    });
    return;
  }

  // Legacy markdown note: derive frontmatter + body from node data and
  // regenerate the markdown preview. Skipped if there is no backing file.
  if (!location.markdownFile) {
    return;
  }
  const existingDoc = await loadNote(wsPath, location.markdownFile);
  const { frontmatter, body } = cardDataToNote(
    noteId,
    cardData,
    existingDoc?.frontmatter
  );
  await writeNoteWithPreview(wsPath, location.markdownFile, frontmatter, body);
}

/**
 * Hydrate a manifest card's `data` blob from its note record (sidecar JSON
 * first, legacy `.md` fallback). Returns `null` when the note cannot be found
 * so the caller can warn and keep the thin manifest reference.
 */
export async function hydrateCardNoteData(
  wsPath: string,
  noteIndex: Map<string, NoteLocation>,
  noteId: string,
  existingData: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const markdownFile =
    asNoteString(existingData.file, '') ||
    noteIndex.get(noteId)?.markdownFile ||
    undefined;
  const record = await loadNoteRecord(wsPath, noteId, markdownFile);
  if (!record) {
    return null;
  }
  return { ...existingData, ...noteRecordToCardData(record), noteId };
}

export function widgetIdForChecklistNote(noteId: string): string {
  return `widget_${noteId.replace(NOTE_ID_PREFIX_RE, '')}`;
}

export function isWidgetLoadFailure(
  record: WidgetRecord | WidgetLoadError
): record is WidgetLoadError {
  return 'error' in record;
}

export function normalizeChecklistWidgetItems(
  items: unknown
): ChecklistWidgetItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    return {
      id:
        typeof raw.id === 'string' && raw.id
          ? raw.id
          : `item_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
      text: typeof raw.text === 'string' ? raw.text : '',
      checked: raw.checked === true,
      ...(raw.isHeader === true ? { isHeader: true } : {}),
      ...(typeof raw.createdAt === 'string'
        ? { createdAt: raw.createdAt }
        : {}),
      ...(typeof raw.completedAt === 'string'
        ? { completedAt: raw.completedAt }
        : {}),
    };
  });
}

export function checklistRecordFromCard(
  noteId: string,
  cardData: Record<string, unknown>
): WidgetRecord {
  const now = new Date().toISOString();
  return {
    schema: WIDGET_SCHEMA,
    id: widgetIdForChecklistNote(noteId),
    kind: 'checklist',
    title: typeof cardData.title === 'string' ? cardData.title : '',
    createdAt: now,
    updatedAt: now,
    data: {
      items: normalizeChecklistWidgetItems(cardData.items),
    },
  };
}

export async function migrateChecklistCardToWidgetReference(
  wsPath: string,
  noteId: string,
  cardData: Record<string, unknown>,
  migratedWidgets: Record<string, WidgetRecord>
): Promise<{ kind: 'checklist'; widgetId: string } | null> {
  if (cardData.type !== 'checklist') {
    return null;
  }

  const widgetId = widgetIdForChecklistNote(noteId);
  try {
    const existing = await loadWidget(wsPath, widgetId);
    if (!isWidgetLoadFailure(existing)) {
      migratedWidgets[existing.id] = existing;
      await moveNodeMetadataKey(wsPath, noteId, existing.id);
      return { widgetId: existing.id, kind: 'checklist' };
    }
    if (existing.error === 'corrupted') {
      // The deterministic widget file exists but is corrupted. Rebuild it from
      // the legacy card so migration is not permanently blocked by a broken
      // file (which would otherwise abort every subsequent loadCanvas).
      console.warn(
        `[persistence] Overwriting corrupted widget ${widgetId} during migration.`
      );
    }

    const record = checklistRecordFromCard(noteId, cardData);
    await saveWidget(wsPath, record);
    migratedWidgets[record.id] = record;
    await moveNodeMetadataKey(wsPath, noteId, record.id);
    return { widgetId: record.id, kind: 'checklist' };
  } catch (error) {
    console.warn(
      `[persistence] Failed to migrate checklist noteId=${noteId}`,
      error
    );
    return null;
  }
}

export interface FolderChildNode {
  data?: Record<string, unknown>;
  id: string;
  noteId?: string;
  type?: string;
  [key: string]: unknown;
}

export function widgetReferenceFromData(
  data: Record<string, unknown> | undefined
): { kind: string; widgetId: string } | null {
  if (!data) {
    return null;
  }
  const widgetId = data.widgetId;
  const kind = data.kind;
  if (typeof widgetId !== 'string' || !widgetId) {
    return null;
  }
  if (typeof kind !== 'string' || !kind) {
    return null;
  }
  return { widgetId, kind };
}

/**
 * Persist checklist→widget migration by patching only the nodes/children that
 * actually became widgets. Start from the on-disk manifest shape so hydrated
 * card bodies, attachment runtime fields, and preview URLs never get written
 * back into `views/*.canvas.json`.
 */
export function buildManifestNodesAfterWidgetMigration(
  originalNodes: ManifestNode[],
  hydratedNodes: ManifestNode[]
): ManifestNode[] {
  const hydratedById = new Map(
    hydratedNodes.map((node) => [node.id, node] as const)
  );

  return originalNodes.map((node) => {
    const hydrated = hydratedById.get(node.id);
    if (!hydrated) {
      return node;
    }

    // Top-level legacy card (or other non-widget) → widget reference.
    if (node.type !== 'widget' && hydrated.type === 'widget') {
      const ref = widgetReferenceFromData(
        hydrated.data as Record<string, unknown>
      );
      if (!ref) {
        return node;
      }
      return {
        ...node,
        type: 'widget',
        data: ref,
      };
    }

    // Folder: rewrite only children that migrated to widgets; keep every other
    // child exactly as stored on disk (no hydrated card/attachment payload).
    if (node.type === 'folder' && hydrated.type === 'folder') {
      const originalChildren = (node.data.children ?? []) as FolderChildNode[];
      if (!Array.isArray(originalChildren) || originalChildren.length === 0) {
        return node;
      }
      const hydratedChildren = ((hydrated.data as Record<string, unknown>)
        .children ?? []) as FolderChildNode[];
      const hydratedChildById = new Map(
        hydratedChildren
          .filter((child) => typeof child?.id === 'string')
          .map((child) => [child.id, child] as const)
      );

      let changed = false;
      const nextChildren = originalChildren.map((child) => {
        if (child.type === 'widget') {
          return child;
        }
        const hydratedChild = hydratedChildById.get(child.id);
        if (!hydratedChild || hydratedChild.type !== 'widget') {
          return child;
        }
        const ref = widgetReferenceFromData(hydratedChild.data);
        if (!ref) {
          return child;
        }
        changed = true;
        return {
          id: child.id,
          type: 'widget',
          data: ref,
        };
      });

      if (!changed) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          children: nextChildren,
        },
      };
    }

    // Cards, images, assets, stickies, already-widget nodes: leave disk shape.
    return node;
  });
}
