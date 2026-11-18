import type { Node } from '@xyflow/react';
import { useMemo } from 'react';

import { isFocusableNode } from '@/lib/canvasNodePredicates';
import type { Size } from '@/lib/collision';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  type ExtensionInstanceLoadError,
  type ExtensionInstanceRecord,
  isExtensionInstanceLoadError,
} from '../../../shared/extensions/instance';

export type LibrarySortKey = 'recent' | 'name' | 'created';

export interface LibraryItem {
  childId?: string;
  color?: string;
  createdAt: number;
  data: Record<string, unknown>;
  folderId?: string;
  /** "node:<id>" for top-level nodes, "child:<folderId>:<childId>" for folder children. */
  id: string;
  nodeId: string;
  /** Measured canvas size when known; previews fall back to the spec size. */
  size?: Size;
  title: string;
  type: string;
  /** Epoch ms; 0 when missing. Used for sort only. */
  updatedAt: number;
}

export interface LibraryGroup {
  /** "ungrouped" | "detached" | folderId. */
  id: string;
  items: LibraryItem[];
  kind: 'folder' | 'ungrouped' | 'detached';
  name: string;
}

interface UseLibraryDataOptions {
  enabled?: boolean;
  query?: string;
  sort?: LibrarySortKey;
}

interface UseLibraryDataResult {
  groups: LibraryGroup[];
  totalItems: number;
}

const EMPTY_LIBRARY: UseLibraryDataResult = { groups: [], totalItems: 0 };

function readString(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' ? v : '';
}

function readNumber(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  return typeof v === 'number' ? v : 0;
}

function fallbackTitle(data: Record<string, unknown>, type: string): string {
  const title = readString(data, 'title');
  if (title.trim().length > 0) {
    return title;
  }
  if (type === 'asset') {
    const filename = readString(data, 'fileName');
    if (filename) {
      return filename;
    }
  }
  if (type === 'link') {
    const url = readString(data, 'url');
    if (url) {
      return url;
    }
  }
  return '';
}

function dateMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStateRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extensionRecordToLibraryData(
  data: Record<string, unknown>,
  instances: Record<
    string,
    ExtensionInstanceRecord | ExtensionInstanceLoadError
  >
): Record<string, unknown> {
  const instanceId = readString(data, 'instanceId');
  const record = instanceId ? instances[instanceId] : undefined;
  if (!record || isExtensionInstanceLoadError(record)) {
    return data;
  }
  const state = isStateRecord(record.state) ? record.state : {};
  const title =
    record.presentation.title.trim() ||
    readString(state, 'title') ||
    readString(state, 'fileName') ||
    readString(state, 'url');
  return {
    ...data,
    ...state,
    title,
    previewExcerpt: record.presentation.plainText,
    createdAt: dateMs(record.createdAt),
    updatedAt: dateMs(record.updatedAt),
  };
}

function toValidSize(value: unknown): Size | undefined {
  if (!value || typeof value !== 'object') {
    return;
  }
  const { width, height } = value as Partial<Size>;
  if (
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return { width, height };
  }
  return;
}

function toItem(params: {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  extensions?: Record<
    string,
    ExtensionInstanceRecord | ExtensionInstanceLoadError
  >;
  folderId?: string;
  childId?: string;
  size?: Size;
}): LibraryItem {
  const { nodeId, type, folderId, childId, extensions = {}, size } = params;
  const data =
    type === 'extension'
      ? extensionRecordToLibraryData(params.data, extensions)
      : params.data;
  const id =
    folderId && childId ? `child:${folderId}:${childId}` : `node:${nodeId}`;
  const title = fallbackTitle(data, type);
  const colorRaw = data.color;
  return {
    id,
    nodeId,
    type,
    data,
    title,
    folderId,
    childId,
    color: typeof colorRaw === 'string' ? colorRaw : undefined,
    size,
    updatedAt: readNumber(data, 'updatedAt'),
    createdAt: readNumber(data, 'createdAt'),
  };
}

function comparator(sort: LibrarySortKey) {
  if (sort === 'name') {
    return (a: LibraryItem, b: LibraryItem) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  }
  if (sort === 'created') {
    return (a: LibraryItem, b: LibraryItem) => b.createdAt - a.createdAt;
  }
  // recent (default)
  return (a: LibraryItem, b: LibraryItem) => b.updatedAt - a.updatedAt;
}

function matchesQuery(item: LibraryItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }
  const haystack = [
    item.title,
    readString(item.data, 'previewExcerpt'),
    readString(item.data, 'content'),
  ]
    .join('\n')
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

export function useLibraryData(
  options: UseLibraryDataOptions = {}
): UseLibraryDataResult {
  const { enabled = true, query = '', sort = 'recent' } = options;
  const nodes = useCanvasStore((s) => (enabled ? s.nodes : undefined));
  const extensions = useExtensionInstanceStore((s) =>
    enabled ? s.records : undefined
  );
  return useMemo(
    () =>
      nodes ? buildLibrary(nodes, query, sort, extensions) : EMPTY_LIBRARY,
    [nodes, query, sort, extensions]
  );
}

export function buildLibrary(
  nodes: Node[],
  query: string,
  sort: LibrarySortKey,
  extensions: Record<
    string,
    ExtensionInstanceRecord | ExtensionInstanceLoadError
  > = {}
): UseLibraryDataResult {
  const normalizedQuery = query.trim().toLowerCase();
  const sortFn = comparator(sort);

  const folderGroups: LibraryGroup[] = [];
  const folderChildIds = new Set<string>();

  for (const node of nodes) {
    if (node.type !== 'folder') {
      continue;
    }
    const data = node.data as Record<string, unknown>;
    const children = (data.children ?? []) as Array<{
      id: string;
      type?: string;
      data: Record<string, unknown>;
      size?: Size;
    }>;
    const items: LibraryItem[] = [];
    for (const child of children) {
      folderChildIds.add(`${node.id}:${child.id}`);
      if (!isFocusableNode(child.type, child.data)) {
        continue;
      }
      items.push(
        toItem({
          nodeId: node.id,
          type: child.type as string,
          data: child.data,
          extensions,
          folderId: node.id,
          childId: child.id,
          size: toValidSize(child.size),
        })
      );
    }
    folderGroups.push({
      id: node.id,
      kind: 'folder',
      name: readString(data, 'title') || readString(data, 'subtitle') || '',
      items: items
        .filter((it) => matchesQuery(it, normalizedQuery))
        .sort(sortFn),
    });
  }

  const ungroupedItems: LibraryItem[] = [];
  const detachedItems: LibraryItem[] = [];
  for (const node of nodes) {
    if (!isFocusableNode(node.type, node.data as Record<string, unknown>)) {
      continue;
    }
    const data = node.data as Record<string, unknown>;
    const item = toItem({
      nodeId: node.id,
      type: node.type as string,
      data,
      extensions,
      size: toValidSize(node.measured),
    });
    if (data.detached) {
      if (matchesQuery(item, normalizedQuery)) {
        detachedItems.push(item);
      }
      continue;
    }
    if (matchesQuery(item, normalizedQuery)) {
      ungroupedItems.push(item);
    }
  }

  const groups: LibraryGroup[] = [
    ...folderGroups.filter((g) => g.items.length > 0),
  ];
  if (ungroupedItems.length > 0) {
    groups.push({
      id: 'ungrouped',
      kind: 'ungrouped',
      name: '',
      items: ungroupedItems.sort(sortFn),
    });
  }
  if (detachedItems.length > 0) {
    groups.push({
      id: 'detached',
      kind: 'detached',
      name: '',
      items: detachedItems.sort(sortFn),
    });
  }

  const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
  return { groups, totalItems };
}
