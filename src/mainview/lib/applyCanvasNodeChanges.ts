import { type DimensionChange, type Node, NodeChangeset } from '@xyflow/react';
import type { CSSProperties } from 'react';
import { isTopicNodeType } from '../../shared/topic';
import { isPinnedSticky } from './canvasNodePredicates';

/** React Flow always returns a fresh array; keep the input when no node changed
 *  so the store can skip publishing a no-op update. */
function applyNodeChangesStable(changes: NodeChangeset, nodes: Node[]): Node[] {
  if (changes.isEmpty()) {
    return nodes;
  }
  const next = changes.applyTo(nodes);
  if (next.length !== nodes.length) {
    return next;
  }
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== nodes[i]) {
      return next;
    }
  }
  return nodes;
}

/**
 * React Flow writes resize results to runtime width/height fields.
 * Mirror those dimensions into node.style so persistence keeps the latest size.
 */
export function applyCanvasNodeChanges(
  changes: NodeChangeset,
  nodes: Node[]
): Node[] {
  const pinnedIds = new Set(
    nodes.filter(isPinnedSticky).map((node) => node.id)
  );
  const allowedChanges = pinnedIds.size
    ? new NodeChangeset(
        changes
          .toArray()
          .filter(
            (change) => change.type !== 'position' || !pinnedIds.has(change.id)
          )
      )
    : changes;
  const hasDimensionChange = allowedChanges.getByType('dimensions').length > 0;
  if (!hasDimensionChange) {
    return applyNodeChangesStable(allowedChanges, nodes);
  }

  // Topic dimensions belong to title commits. React Flow also reports the
  // render-only edit size (sometimes after the preview has been cleared), so
  // accepting its dimension events would leak that size into the saved graph.
  const topicIds = new Set(
    nodes.filter((node) => isTopicNodeType(node.type)).map((node) => node.id)
  );
  const savedChanges = topicIds.size
    ? new NodeChangeset(
        allowedChanges
          .toArray()
          .filter(
            (change) => change.type !== 'dimensions' || !topicIds.has(change.id)
          )
      )
    : allowedChanges;
  if (savedChanges.isEmpty()) {
    return nodes;
  }
  const updatedNodes = applyNodeChangesStable(savedChanges, nodes);
  const dimensionsById = new Map<string, { width: number; height: number }>();
  for (const change of savedChanges.getByType('dimensions')) {
    if ((change as DimensionChange).dimensions !== undefined) {
      dimensionsById.set(change.id, change.dimensions!);
    }
  }

  if (dimensionsById.size === 0) {
    return updatedNodes;
  }

  // Dimension changes for render-only nodes (e.g. folder expansion children)
  // match no stored node; returning a fresh array for them would publish a
  // no-op store update, rebuild those nodes, and make React Flow re-measure
  // them — a per-frame loop.
  let styleChanged = false;
  const styledNodes = updatedNodes.map((node) => {
    const dimensions = dimensionsById.get(node.id);
    if (!dimensions) {
      return node;
    }

    const style = (node as Node & { style?: CSSProperties }).style;
    const currentWidth = Number(style?.width);
    const currentHeight = Number(style?.height);
    if (
      currentWidth === dimensions.width &&
      currentHeight === dimensions.height
    ) {
      return node;
    }

    styleChanged = true;
    return {
      ...node,
      style: {
        ...style,
        width: dimensions.width,
        height: dimensions.height,
      },
    } as Node;
  });
  return styleChanged ? styledNodes : updatedNodes;
}
