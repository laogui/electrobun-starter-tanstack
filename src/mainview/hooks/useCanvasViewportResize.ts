import type { ReactFlowInstance } from '@xyflow/react';
import { type RefObject, useEffect, useRef } from 'react';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import {
  anchorViewportToCenter,
  type ViewportSize,
  viewportSizesEqual,
} from '@/lib/viewportResize';
import { useCanvasStore } from '@/store/canvasStore';

interface UseCanvasViewportResizeOptions {
  /** Observed canvas pane — typically the React Flow wrapper element. */
  containerRef: RefObject<HTMLElement | null>;
  /** When false, resize observation is paused (e.g. canvas not hydrated). */
  enabled: boolean;
  rfInstance: RefObject<ReactFlowInstance<any, any> | null>;
}

/**
 * Keep the user's focal point stable when the canvas pane resizes.
 *
 * - Session viewport: pan re-anchored to the previous screen center and zoom
 *   scaled with the pane's width/height change (e.g. maximize / restore).
 * - No session viewport (fitView mode): re-fit nodes into the new pane.
 *
 * Resize-driven camera moves are never written to the session cache.
 */
export function useCanvasViewportResize({
  containerRef,
  enabled,
  rfInstance,
}: UseCanvasViewportResizeOptions): void {
  const prevSizeRef = useRef<ViewportSize | null>(null);

  useEffect(() => {
    if (!enabled) {
      prevSizeRef.current = null;
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const applyResize = (nextSize: ViewportSize) => {
      const prevSize = prevSizeRef.current;
      prevSizeRef.current = nextSize;

      if (
        !prevSize ||
        viewportSizesEqual(prevSize, nextSize) ||
        nextSize.width <= 0 ||
        nextSize.height <= 0
      ) {
        return;
      }

      const instance = rfInstance.current;
      if (!instance) {
        return;
      }

      suppressViewportPersist(100);

      const { sessionViewport, setViewport } = useCanvasStore.getState();

      if (!sessionViewport) {
        instance.fitView({ duration: 0 });
        setViewport(instance.getViewport(), { persist: false });
        return;
      }

      const anchored = anchorViewportToCenter(
        instance.getViewport(),
        prevSize,
        nextSize,
        { scaleZoom: true }
      );
      instance.setViewport(anchored, { duration: 0 });
      setViewport(anchored, { persist: false });
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      applyResize({ width, height });
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      prevSizeRef.current = null;
    };
  }, [containerRef, enabled, rfInstance]);
}
