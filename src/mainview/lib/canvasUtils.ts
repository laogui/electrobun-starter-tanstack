import type { Node } from '@xyflow/react';

import { isFolderChildNode, isGroupChildNode } from './canvasNodePredicates';

/** Returns true when the child node type can be parented to the parent node. */
export function canBeChildOf(parent: Node, child: Node): boolean {
  if (parent.type === 'group') {
    return isGroupChildNode(child.type);
  }
  return false;
}

/** Returns true when a node can be absorbed into a folder's children array. */
export function canAbsorbIntoFolder(child: Node): boolean {
  return isFolderChildNode(child.type);
}

/** Strip invalid parent relationships (e.g. group-in-group from legacy data). */
export function normalizeCanvasParenting(nodes: Node[]): Node[] {
  const byId = new Map<string, Node>();
  for (const n of nodes) {
    byId.set(n.id, n);
  }
  return nodes.map((n) => {
    if (!n.parentId) {
      return n;
    }
    // Groups must always be top-level
    if (n.type === 'group') {
      const { parentId, extent, ...rest } = n as any;
      return rest as Node;
    }
    const parent = byId.get(n.parentId);
    if (!(parent && canBeChildOf(parent, n))) {
      const { parentId, extent, ...rest } = n as any;
      return rest as Node;
    }
    return n;
  });
}

/** Sort nodes so parents always appear before children (React Flow requirement) */
export function sortNodesByParent(nodes: Node[]): Node[] {
  const sorted: Node[] = [];
  const remaining: Node[] = [];
  const placed = new Set<string>();

  // First pass: place top-level nodes without changing their z-order.
  for (const node of nodes) {
    if (node.parentId) {
      remaining.push(node);
    } else {
      placed.add(node.id);
      sorted.push(node);
    }
  }

  // Iteratively place nodes whose parent is already placed
  let placedNode = true;
  while (remaining.length > 0 && placedNode) {
    placedNode = false;
    for (let i = 0; i < remaining.length; ) {
      const node = remaining[i];
      if (!node) {
        i += 1;
        continue;
      }
      if (placed.has(node.parentId ?? '')) {
        placed.add(node.id);
        sorted.push(node);
        remaining.splice(i, 1);
        placedNode = true;
      } else {
        i += 1;
      }
    }
  }

  // Append any orphans (broken parentId)
  sorted.push(...remaining);
  return sorted;
}

/** Check if potentialDescendantId is a descendant of ancestorId */
export function isDescendant(
  nodes: Node[],
  ancestorId: string,
  potentialDescendantId: string
): boolean {
  const parentMap = new Map<string, string>();
  for (const n of nodes) {
    if (n.parentId) {
      parentMap.set(n.id, n.parentId);
    }
  }
  const visited = new Set<string>();
  let current = potentialDescendantId;
  while (parentMap.has(current)) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    current = parentMap.get(current)!;
    if (current === ancestorId) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Document mode tree
// ---------------------------------------------------------------------------

export interface DocumentTreeNode {
  /** Folder children: { folderId, childId }; top-level cards/folders/images: top-level node id. */
  childId?: string;
  children?: DocumentTreeNode[];
  data: Record<string, unknown>;
  folderId?: string;
  /** Composite id used as React key + selection token; "node:<id>" or "child:<folderId>:<childId>". */
  id: string;
  kind: 'folder' | 'card' | 'image';
}

function isDocumentTreeNodeType(type: string | undefined): boolean {
  return type === 'folder' || type === 'card' || type === 'image';
}

/**
 * Project React Flow nodes into a tree suitable for the document-mode sidebar.
 * - Folders become expandable branches; their children come from `data.children`.
 * - Top-level cards / images / folders are root entries.
 * - Stickies, groups, and edges are intentionally omitted.
 * - Cards parented to a Group still appear at the root (groups are ignored in document mode).
 */
export function nodesToDocumentTree(nodes: Node[]): DocumentTreeNode[] {
  const roots: DocumentTreeNode[] = [];
  for (const node of nodes) {
    if (!isDocumentTreeNodeType(node.type)) {
      continue;
    }
    if (node.type === 'folder') {
      const rawChildren = ((node.data as any)?.children ?? []) as Array<{
        data: Record<string, unknown>;
        id: string;
        type?: string;
      }>;
      const children = rawChildren.map<DocumentTreeNode>((c) => ({
        id: `child:${node.id}:${c.id}`,
        kind: c.type === 'image' ? 'image' : 'card',
        data: c.data,
        folderId: node.id,
        childId: c.id,
      }));
      roots.push({
        id: `node:${node.id}`,
        kind: 'folder',
        data: node.data as Record<string, unknown>,
        children,
      });
      continue;
    }
    roots.push({
      id: `node:${node.id}`,
      kind: node.type === 'image' ? 'image' : 'card',
      data: node.data as Record<string, unknown>,
    });
  }
  return roots;
}

/** Resolve a sidebar selection token back into the underlying node / folder-child reference. */
export function resolveDocumentSelection(
  token: string | null
):
  | { kind: 'node'; nodeId: string }
  | { kind: 'child'; folderId: string; childId: string }
  | null {
  if (!token) {
    return null;
  }
  if (token.startsWith('node:')) {
    return { kind: 'node', nodeId: token.slice(5) };
  }
  if (token.startsWith('child:')) {
    const rest = token.slice(6);
    const sep = rest.indexOf(':');
    if (sep < 0) {
      return null;
    }
    return {
      kind: 'child',
      folderId: rest.slice(0, sep),
      childId: rest.slice(sep + 1),
    };
  }
  return null;
}
