import type { Node } from '@xyflow/react';

export const NOTE_CONTENT_KEYS = [
  'title',
  'color',
  'content',
  'editor',
  'blocknoteRevision',
  'previewHtml',
  'previewExcerpt',
  'previewBlocks',
  'previewVersion',
  'createdAt',
  'updatedAt',
  'pieData',
  'blocks',
  'markdown',
] as const;

/**
 * Note fields the canvas undo history leaves to the note side. `color` is
 * deliberately absent: a card's colour is a canvas operation (same as
 * Heptabase's whiteboard), so canvas undo snapshots keep it and Cmd+Z on the
 * canvas reverts it. See docs/remediation-plan.md, 4.3.
 */
export const HISTORY_NOTE_KEYS: readonly string[] = NOTE_CONTENT_KEYS.filter(
  (key) => key !== 'color'
);
export type NoteContentCache = Map<string, Record<string, unknown>>;
function visitData(
  data: Record<string, unknown>,
  visit: (data: Record<string, unknown>, id: string) => Record<string, unknown>,
  fallbackId?: string
): Record<string, unknown> {
  const id = typeof data.noteId === 'string' ? data.noteId : fallbackId;
  let next = id ? visit(data, id) : data;
  if (Array.isArray(data.children)) {
    const children = data.children.map((value: unknown) => {
      if (!value || typeof value !== 'object') {
        return value;
      }
      const child = value as {
        noteId?: string;
        data?: Record<string, unknown>;
      };
      if (!child.data) {
        return value;
      }
      const nested = visitData(child.data, visit, child.noteId);
      return nested === child.data ? value : { ...child, data: nested };
    });
    if (
      children.some(
        (child, index) => child !== (data.children as unknown[])[index]
      )
    ) {
      next = { ...next, children };
    }
  }
  return next;
}
export function rememberNoteContent(
  nodes: Node[],
  cache: NoteContentCache,
  keys: readonly string[] = HISTORY_NOTE_KEYS
) {
  for (const node of nodes) {
    visitData(node.data, (data, id) => {
      const known = cache.get(id) ?? {};
      if (
        typeof data.blocknoteRevision === 'number' &&
        typeof known.blocknoteRevision === 'number' &&
        data.blocknoteRevision < known.blocknoteRevision
      ) {
        return data;
      }
      const content = { ...known };
      for (const key of keys) {
        if (key in data) {
          content[key] = data[key];
        }
      }
      cache.set(id, content);
      return data;
    });
  }
}
export function stripHistoryNoteContent(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    const data = visitData(node.data, (value) => {
      const next = { ...value };
      for (const key of HISTORY_NOTE_KEYS) {
        delete next[key];
      }
      return next;
    });
    return data === node.data ? node : { ...node, data };
  });
}
export function restoreHistoryNoteContent(
  nodes: Node[],
  cache: NoteContentCache
): Node[] {
  return nodes.map((node) => ({
    ...node,
    data: visitData(node.data, (data, id) => ({ ...data, ...cache.get(id) })),
  }));
}

const caches = new Set<WeakRef<NoteContentCache>>();
export function registerHistoryNoteCache(cache: NoteContentCache) {
  caches.add(new WeakRef(cache));
}
export function updateHistoryNoteMetadata(
  changes: readonly import('../../shared/contentEvents').NoteMetadataChange[]
) {
  for (const reference of caches) {
    const cache = reference.deref();
    if (!cache) {
      caches.delete(reference);
      continue;
    }
    for (const change of changes) {
      const known = cache.get(change.id);
      if (
        !known ||
        (typeof known.blocknoteRevision === 'number' &&
          known.blocknoteRevision >= change.after.revision)
      ) {
        continue;
      }
      const next = {
        ...known,
        title: change.after.title,
        blocknoteRevision: change.after.revision,
      };
      if (!change.metadataOnly) {
        for (const key of [
          'content',
          'blocks',
          'markdown',
          'previewHtml',
          'previewExcerpt',
          'previewBlocks',
          'previewVersion',
        ]) {
          delete (next as Record<string, unknown>)[key];
        }
      }
      cache.set(change.id, next);
    }
  }
}

export function replaceNoteSources(
  nodes: Node[],
  sources: Node[],
  ids: readonly string[]
): Node[] {
  const cache: NoteContentCache = new Map();
  rememberNoteContent(sources, cache, NOTE_CONTENT_KEYS);
  return nodes.map((node) => ({
    ...node,
    data: visitData(node.data, (data, id) => {
      if (!(ids.includes(id) && cache.has(id))) {
        return data;
      }
      const clean = { ...data };
      for (const key of NOTE_CONTENT_KEYS) {
        delete clean[key];
      }
      return { ...clean, ...cache.get(id) };
    }),
  }));
}
