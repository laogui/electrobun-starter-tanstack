import type { Node } from '@xyflow/react';
import { useMemo } from 'react';

import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { useCanvasStore } from '@/store/canvasStore';

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
  query?: string;
  sort?: LibrarySortKey;
}

interface UseLibraryDataResult {
  groups: LibraryGroup[];
  totalItems: number;
}

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

function toItem(params: {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  folderId?: string;
  childId?: string;
}): LibraryItem {
  const { nodeId, type, data, folderId, childId } = params;
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
  return item.title.toLowerCase().includes(normalizedQuery);
}

export function useLibraryData(
  options: UseLibraryDataOptions = {}
): UseLibraryDataResult {
  const nodes = useCanvasStore((s) => s.nodes);
  const { query = '', sort = 'recent' } = options;
  return useMemo(() => buildLibrary(nodes, query, sort), [nodes, query, sort]);
}

export function buildLibrary(
  nodes: Node[],
  query: string,
  sort: LibrarySortKey
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
    }>;
    const items: LibraryItem[] = [];
    for (const child of children) {
      folderChildIds.add(`${node.id}:${child.id}`);
      if (!isFocusableNode(child.type)) {
        continue;
      }
      items.push(
        toItem({
          nodeId: node.id,
          type: child.type as string,
          data: child.data,
          folderId: node.id,
          childId: child.id,
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
    if (!isFocusableNode(node.type)) {
      continue;
    }
    const data = node.data as Record<string, unknown>;
    const item = toItem({
      nodeId: node.id,
      type: node.type as string,
      data,
    });
    if (data.detached) {
      // Library detached pane follows DetachedNotesSidebar: card / image only.
      if (
        (node.type === 'card' || node.type === 'image') &&
        matchesQuery(item, normalizedQuery)
      ) {
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
