import {
  type Edge,
  type EdgeMarker,
  MarkerType,
  type Node,
} from '@xyflow/react';

import { isTopicTreeEdge } from '../../shared/topic';
import { topicEdgeStroke } from './topicColors';

/**
 * Persisted edges reference the arrow by this id (see `canvasStore`,
 * `topicTree`, template manifests). It is resolved to a built-in React Flow
 * marker at render time so user files never need rewriting.
 */
export const ARROW_MARKER_REF = 'compact-arrow';

// No spaces: React Flow derives the marker element id from these values.
export const DEFAULT_EDGE_STROKE = 'var(--xy-edge-stroke,#b1b1b7)';
export const SELECTED_EDGE_STROKE = 'var(--color-accent)';

export const ARROW_SIZE = 22;

/** The edge's own stroke colour, or `undefined` when it uses the theme default. */
export function resolveEdgeCustomColor(
  data: Record<string, unknown> | undefined,
  sourceColorToken: unknown
): string | undefined {
  if (isTopicTreeEdge({ data })) {
    // Derived from the parent Topic, so the branch reads as one unit and the
    // edge has no colour of its own to edit.
    return topicEdgeStroke(sourceColorToken);
  }
  return typeof data?.color === 'string' ? data.color : undefined;
}

export function arrowMarker(color: string): EdgeMarker {
  return {
    type: MarkerType.ArrowClosed,
    color,
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    markerUnits: 'userSpaceOnUse',
  };
}

export function resolveEdgeMarkers<E extends Edge>(
  edges: E[],
  nodes: readonly Node[]
): E[] {
  let colorTokenById: Map<string, unknown> | undefined;
  const sourceColorToken = (id: string) => {
    colorTokenById ??= new Map(
      nodes.map((node) => [node.id, node.data?.color])
    );
    return colorTokenById.get(id);
  };

  return edges.map((edge) => {
    const hasStart = edge.markerStart === ARROW_MARKER_REF;
    const hasEnd = edge.markerEnd === ARROW_MARKER_REF;
    if (!(hasStart || hasEnd)) {
      return edge;
    }
    const customColor = resolveEdgeCustomColor(
      edge.data,
      sourceColorToken(edge.source)
    );
    const marker = arrowMarker(
      customColor ??
        (edge.selected ? SELECTED_EDGE_STROKE : DEFAULT_EDGE_STROKE)
    );
    return {
      ...edge,
      ...(hasStart && { markerStart: marker }),
      ...(hasEnd && { markerEnd: marker }),
    };
  });
}
