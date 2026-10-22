import type { ReactFlowInstance } from '@xyflow/react';
// Flow-space centre of the visible canvas (default anchor for menu-created nodes).

/** Flow coordinates at the centre of the visible canvas, used as the default
 *  anchor for a node created from a menu rather than a cursor position. */
export function getViewportCenter(
  rfInstance: ReactFlowInstance<any, any> | null
): {
  x: number;
  y: number;
} {
  // Prefer React Flow's own projection so this does not couple to window size.
  if (rfInstance?.screenToFlowPosition) {
    return rfInstance.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }
  const viewport = rfInstance?.getViewport();
  const zoom = viewport?.zoom ?? 1;
  return {
    x: (window.innerWidth / 2 - (viewport?.x ?? 0)) / zoom,
    y: (window.innerHeight / 2 - (viewport?.y ?? 0)) / zoom,
  };
}
