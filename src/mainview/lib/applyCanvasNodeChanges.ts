import { applyNodeChanges } from '@xyflow/react';
import type { Node, NodeChange, NodeDimensionChange } from '@xyflow/react';

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
  changes: Array<NodeChange<Node>>,
  nodes: Array<Node>
): Array<Node> {
  const updatedNodes = applyNodeChanges<Node>(changes, nodes);
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

    const currentWidth = Number(node.style?.width);
    const currentHeight = Number(node.style?.height);
    if (
      currentWidth === dimensions.width &&
      currentHeight === dimensions.height
    ) {
      return node;
    }

    return {
      ...node,
      style: {
        ...node.style,
        width: dimensions.width,
        height: dimensions.height,
      },
    };
  });
}
