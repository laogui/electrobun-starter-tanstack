import type { Node } from '@xyflow/react';

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
