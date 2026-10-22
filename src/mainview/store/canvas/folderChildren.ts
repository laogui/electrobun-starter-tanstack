import type { Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { buildNewNodeSpec, findSpecByNodeType } from '@/lib/canvasNodeRegistry';
import type { Size } from '@/lib/collision';
import { EXTENSION_NODE_TYPE } from '../../../shared/extensions/ids';
// Folder-child entries and their conversion back into top-level canvas nodes.

export interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  noteId?: string;
  size?: Size;
  type?: string;
}

export function uniqueDetachedNodeId(
  candidateId: string,
  usedNodeIds: Set<string>
): string {
  let id = candidateId;
  while (usedNodeIds.has(id)) {
    id = `node-${nanoid(8)}`;
  }
  usedNodeIds.add(id);
  return id;
}

export function uniqueEdgeId(
  candidateId: string,
  usedEdgeIds: Set<string>
): string {
  let id = candidateId;
  while (usedEdgeIds.has(id)) {
    id = `edge-${nanoid(8)}`;
  }
  usedEdgeIds.add(id);
  return id;
}

export function resolveFolderChildSpec(child: FolderChildEntry) {
  if (!child.type) {
    return buildNewNodeSpec('card');
  }
  const spec = findSpecByNodeType(child.type);
  if (spec) {
    return buildNewNodeSpec(spec.kind);
  }
  if (child.type === EXTENSION_NODE_TYPE) {
    const fallback = buildNewNodeSpec('card');
    return {
      ...fallback,
      base: { ...fallback.base, type: EXTENSION_NODE_TYPE },
    };
  }
  // Unknown historical children retain their data but use the safe Card
  // renderer until a compatible runtime type becomes available.
  return buildNewNodeSpec('card');
}

export function resolveFolderChildSize(
  child: FolderChildEntry,
  fallback: Size
): Size {
  const width = child.size?.width;
  const height = child.size?.height;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return fallback;
  }
  return {
    width: Math.min(1200, Math.max(80, width)),
    height: Math.min(1200, Math.max(80, height)),
  };
}

export function folderChildToDetachedNode(
  child: FolderChildEntry,
  usedNodeIds: Set<string>
): Node {
  const spec = resolveFolderChildSpec(child);
  const size = resolveFolderChildSize(child, spec.size);
  const {
    isDropTarget: _isDropTarget,
    isHidden: _isHidden,
    ...data
  } = child.data;
  return {
    id: uniqueDetachedNodeId(child.id, usedNodeIds),
    type: spec.base.type,
    position: { x: 0, y: 0 },
    style: { ...spec.base.style, width: size.width, height: size.height },
    data: {
      ...data,
      ...(child.noteId && spec.base.type === 'card'
        ? { noteId: child.noteId }
        : {}),
      detached: true,
    },
  };
}
