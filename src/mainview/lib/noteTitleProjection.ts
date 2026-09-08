import type { Node } from '@xyflow/react';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function noteIdOf(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return;
  }
  const noteId = value.noteId;
  return typeof noteId === 'string' && noteId.length > 0 ? noteId : undefined;
}

function collectFromNodeData(
  data: unknown,
  ids: Set<string>,
  includeChildren: boolean
): void {
  const record = isRecord(data) ? data : undefined;
  if (!record) {
    return;
  }
  const noteId = noteIdOf(record);
  if (noteId) {
    ids.add(noteId);
  }
  if (!(includeChildren && Array.isArray(record.children))) {
    return;
  }
  for (const child of record.children) {
    if (!isRecord(child)) {
      continue;
    }
    const nested = noteIdOf(child.data) ?? noteIdOf(child);
    if (nested) {
      ids.add(nested);
    }
  }
}

export function collectNoteIdsFromCanvasNodes(
  nodes: Node[],
  options?: { selectedOnly?: boolean }
): string[] {
  const ids = new Set<string>();
  const selectedOnly = options?.selectedOnly ?? false;
  for (const node of nodes) {
    if (selectedOnly && !node.selected) {
      continue;
    }
    collectFromNodeData(node.data, ids, true);
  }
  return [...ids];
}

function applyTitleToData(
  data: Record<string, unknown>,
  titles: ReadonlyMap<string, string>
): Record<string, unknown> {
  let next = data;
  const noteId = noteIdOf(data);
  const title = noteId ? titles.get(noteId) : undefined;
  if (typeof title === 'string' && data.title !== title) {
    next = { ...next, title };
  }
  if (!Array.isArray(data.children)) {
    return next;
  }
  let childrenChanged = false;
  const children = data.children.map((child) => {
    if (!isRecord(child)) {
      return child;
    }
    const childData = isRecord(child.data) ? child.data : undefined;
    const childNoteId = noteIdOf(childData) ?? noteIdOf(child);
    const childTitle = childNoteId ? titles.get(childNoteId) : undefined;
    if (typeof childTitle !== 'string') {
      return child;
    }
    childrenChanged = true;
    const nextChild: Record<string, unknown> = {
      ...child,
      title: childTitle,
    };
    if (childData) {
      nextChild.data = { ...childData, title: childTitle };
    }
    return nextChild;
  });
  if (!childrenChanged) {
    return next;
  }
  return { ...next, children };
}

export function applyNoteTitlesToCanvasNodes(
  nodes: Node[],
  titles: ReadonlyMap<string, string>
): Node[] {
  if (titles.size === 0) {
    return nodes;
  }
  return nodes.map((node) => {
    if (!isRecord(node.data)) {
      return node;
    }
    const data = applyTitleToData(node.data, titles);
    return data === node.data ? node : { ...node, data };
  });
}
