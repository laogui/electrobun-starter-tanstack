import type { Node, NodeChange, NodeDimensionChange } from '@xyflow/react';
import { applyNodeChanges } from '@xyflow/react';
import type { CSSProperties } from 'react';

function isDimensionChange(
  change: NodeChange
): change is NodeDimensionChange & {
  dimensions: { width: number; height: number };
} {
  return change.type === 'dimensions' && change.dimensions !== undefined;
}

/**
 * React Flow writes resize results to runtime width/height fields.
 * Mirror those dimensions into node.style so persistence keeps the latest size.
 */
export function applyCanvasNodeChanges(
  changes: NodeChange[],
  nodes: Node[]
): Node[] {
  const updatedNodes = applyNodeChanges(changes, nodes);
  const dimensionsById = new Map(
    changes
      .filter(isDimensionChange)
      .map((change) => [change.id, change.dimensions] as const)
  );

  if (dimensionsById.size === 0) {
    return updatedNodes;
  }

  return updatedNodes.map((node) => {
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

    return {
      ...node,
      style: {
        ...style,
        width: dimensions.width,
        height: dimensions.height,
      },
    } as Node;
  });
}
