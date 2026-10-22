import type { Node, ReactFlowInstance } from '@xyflow/react';
import { VIEWPORT_PAN_MS, viewportMotion } from '@/lib/motion';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';

import { isFocusableNode } from './canvasNodePredicates';

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 160;
/** Extra padding (ms) waited after setCenter resolves the flight animation,
 *  so React Flow's measured layout has a chance to flush before we read DOM. */
const POST_CENTER_LAYOUT_FRAME_MS = 16;

export interface OpenFocusedOptions {
  /** Animation duration passed to `setCenter`. */
  centerDurationMs?: number;
  nodeId: string;
  rfInstance: ReactFlowInstance<any, any> | null;
}

interface NodeBoxMetrics {
  height: number;
  width: number;
}

function getNodeBoxMetrics(node: Node): NodeBoxMetrics {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH,
    height: node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT,
  };
}

/** Fallback rect computed from the React Flow viewport when the DOM node is
 *  off-screen / culled and `document.querySelector` returns null. */
function computeRectFromViewport(
  node: Node,
  rfInstance: ReactFlowInstance<any, any> | null,
  width: number,
  height: number
): DOMRect {
  const viewport = rfInstance?.getViewport?.() ?? { x: 0, y: 0, zoom: 1 };
  const zoom = viewport.zoom || 1;
  const left = node.position.x * zoom + viewport.x;
  const top = node.position.y * zoom + viewport.y;
  const w = width * zoom;
  const h = height * zoom;
  return new DOMRect(left, top, w, h);
}

/**
 * Center the canvas on `nodeId` then open the matching FocusedView (or
 * FolderView for folders). Awaits the flight animation before reading the DOM
 * so the focus enter animation starts from the correct rect.
 */
export async function openFocusedById({
  nodeId,
  rfInstance,
  centerDurationMs = VIEWPORT_PAN_MS,
}: OpenFocusedOptions): Promise<void> {
  const { nodes, setFocusedNode, setFocusedFolder } = useCanvasStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return;
  }

  const { width, height } = getNodeBoxMetrics(node);

  // 1. Trigger flight animation.
  const viewport = rfInstance?.getViewport?.();
  const zoom = viewport?.zoom ?? 1;
  const flight = viewportMotion(centerDurationMs);
  suppressViewportPersist(flight.duration + 50);
  rfInstance?.setCenter?.(
    node.position.x + width / 2,
    node.position.y + height / 2,
    { ...flight, zoom }
  );

  // 2. Wait for the flight to settle + one extra frame for layout flush.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, flight.duration + POST_CENTER_LAYOUT_FRAME_MS);
  });

  // 3. Prefer the real DOM rect (accurate). Fall back to viewport math when
  //    the node is still culled.
  const el =
    typeof document === 'undefined'
      ? null
      : (document.querySelector(`[data-id="${nodeId}"]`) as HTMLElement | null);
  const rect =
    el?.getBoundingClientRect() ??
    computeRectFromViewport(node, rfInstance, width, height);

  if (node.type === 'folder') {
    setFocusedFolder({
      id: node.id,
      data: node.data as Record<string, unknown>,
      rect,
    });
    return;
  }

  if (!isFocusableNode(node.type, node.data as Record<string, unknown>)) {
    return;
  }

  setFocusedNode({
    id: node.id,
    type: node.type,
    data: node.data as Record<string, unknown>,
    rect,
  });
}
