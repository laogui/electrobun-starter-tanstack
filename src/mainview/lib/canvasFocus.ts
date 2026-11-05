import type { Node, ReactFlowInstance } from '@xyflow/react';
import { prefetchBlockNoteForData } from '@/lib/blockNotePrefetch';
import { openFocusedItem } from '@/lib/focusedItem';
import { VIEWPORT_PAN_MS, viewportMotion } from '@/lib/motion';
import { markOpenRequested } from '@/lib/perfMarks';
import { revealShift } from '@/lib/sidePanelGeometry';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';
import { absoluteNodePosition } from '../../shared/canvasGeometry';

import { isFocusableNode } from './canvasNodePredicates';

const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 160;
/** Extra padding (ms) waited after setCenter resolves the flight animation,
 *  so React Flow's measured layout has a chance to flush before we read DOM. */
const POST_CENTER_LAYOUT_FRAME_MS = 16;
/** Pan that keeps an opened card beside the panel (motion rule: 150–180ms). */
const PANEL_REVEAL_MS = 160;
let navigationRequest = 0;

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
    width:
      node.measured?.width ??
      node.width ??
      (typeof node.style?.width === 'number'
        ? node.style.width
        : DEFAULT_NODE_WIDTH),
    height:
      node.measured?.height ??
      node.height ??
      (typeof node.style?.height === 'number'
        ? node.style.height
        : DEFAULT_NODE_HEIGHT),
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
  const position = absoluteNodePosition(node, useCanvasStore.getState().nodes);
  const pane = getFlowPaneRect();
  const left = position.x * zoom + viewport.x + pane.left;
  const top = position.y * zoom + viewport.y + pane.top;
  const w = width * zoom;
  const h = height * zoom;
  return new DOMRect(left, top, w, h);
}

/** Screen rect of the React Flow pane (setCenter centers within it). */
function getFlowPaneRect(): DOMRect {
  const pane =
    typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>('.react-flow');
  if (pane) {
    return pane.getBoundingClientRect();
  }
  return new DOMRect(
    0,
    0,
    typeof window === 'undefined' ? 1024 : window.innerWidth,
    typeof window === 'undefined' ? 768 : window.innerHeight
  );
}

/**
 * Pan the canvas so the node sits fully left of the side panel. With
 * `center`, centre it in that area (search / library jumps). No-op when the
 * node is already visible there or is not on the canvas (folder children).
 */
export function revealNodeBesidePanel(
  nodeId: string,
  rfInstance: ReactFlowInstance<any, any> | null,
  { center = false, durationMs = PANEL_REVEAL_MS } = {}
): void {
  const viewport = rfInstance?.getViewport?.();
  if (!(viewport && rfInstance?.setViewport)) {
    return;
  }
  const { nodes } = useCanvasStore.getState();
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return;
  }
  const { width, height } = getNodeBoxMetrics(node);
  const rect = computeRectFromViewport(node, rfInstance, width, height);
  const shift = revealShift(
    {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    },
    {
      width: typeof window === 'undefined' ? 1024 : window.innerWidth,
      height: typeof window === 'undefined' ? 768 : window.innerHeight,
    },
    center
  );
  if (!shift) {
    return;
  }
  const motion = viewportMotion(durationMs);
  suppressViewportPersist(motion.duration + 50);
  rfInstance.setViewport(
    {
      x: viewport.x + shift.dx,
      y: viewport.y + shift.dy,
      zoom: viewport.zoom,
    },
    motion
  );
}

/**
 * Open `nodeId` from outside the canvas (library, search): notes and other
 * focusable cards open in the side panel at once while the canvas pans them
 * into view beside it; folders centre first and then expand, because their
 * expansion reads the live canvas DOM.
 */
export async function openFocusedById({
  nodeId,
  rfInstance,
  centerDurationMs = VIEWPORT_PAN_MS,
}: OpenFocusedOptions): Promise<void> {
  markOpenRequested();
  const request = ++navigationRequest;
  const { nodes, setFocusedFolder, _canvasGeneration } =
    useCanvasStore.getState();
  const stillCurrent = () =>
    request === navigationRequest &&
    useCanvasStore.getState()._canvasGeneration === _canvasGeneration;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return;
  }

  const { width, height } = getNodeBoxMetrics(node);
  const isFolder = node.type === 'folder';

  if (!isFolder) {
    if (!isFocusableNode(node.type, node.data as Record<string, unknown>)) {
      return;
    }
    prefetchBlockNoteForData(node.data as Record<string, unknown>);
    openFocusedItem({
      id: node.id,
      type: node.type,
      data: node.data,
      rect: computeRectFromViewport(node, rfInstance, width, height),
    });
    revealNodeBesidePanel(node.id, rfInstance, {
      center: true,
      durationMs: centerDurationMs,
    });
    return;
  }

  // 1. Centre the folder.
  const viewport = rfInstance?.getViewport?.();
  const zoom = viewport?.zoom ?? 1;
  const flight = viewportMotion(centerDurationMs);
  suppressViewportPersist(flight.duration + 50);
  const position = absoluteNodePosition(node, nodes);
  rfInstance?.setCenter?.(position.x + width / 2, position.y + height / 2, {
    ...flight,
    zoom,
  });

  // 2b. Folders: wait for the flight to settle + one frame for layout flush.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, flight.duration + POST_CENTER_LAYOUT_FRAME_MS);
  });

  const current = useCanvasStore
    .getState()
    .nodes.find((item) => item.id === node.id);
  if (!(stillCurrent() && current) || current.type !== 'folder') {
    return;
  }
  // 3. Prefer the real DOM rect (accurate). Fall back to viewport math when
  //    the node is still culled.
  const el =
    typeof document === 'undefined'
      ? null
      : (document.querySelector(
          `[data-id="${CSS.escape(nodeId)}"]`
        ) as HTMLElement | null);
  const rect =
    el?.getBoundingClientRect() ??
    computeRectFromViewport(current, rfInstance, width, height);

  setFocusedFolder({
    id: node.id,
    data: current.data,
    rect,
  });
}
