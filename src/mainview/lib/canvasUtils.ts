import type { Node } from '@xyflow/react';

/** Sort nodes so parents always appear before children (React Flow requirement) */
export function sortNodesByParent(nodes: Node[]): Node[] {
  const sorted: Node[] = [];
  const remaining = [...nodes];
  const placed = new Set<string>();

  // First pass: place all nodes without parentId
  for (let i = remaining.length - 1; i >= 0; i--) {
    if (!remaining[i]?.parentId) {
      placed.add(remaining[i]?.id);
      sorted.push(remaining[i]!);
      remaining.splice(i, 1);
    }
  }

  // Iteratively place nodes whose parent is already placed
  let safety = remaining.length + 1;
  while (remaining.length > 0 && safety-- > 0) {
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (placed.has(remaining[i]?.parentId!)) {
        placed.add(remaining[i]?.id);
        sorted.push(remaining[i]!);
        remaining.splice(i, 1);
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
