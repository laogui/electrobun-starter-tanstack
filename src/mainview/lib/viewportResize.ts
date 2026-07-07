import type { CanvasViewport } from '@/store/canvasStore';

export interface ViewportSize {
  height: number;
  width: number;
}

export interface AnchorViewportOptions {
  maxZoom?: number;
  minZoom?: number;
  /** Scale zoom with the pane's width/height change (geometric mean). */
  scaleZoom?: boolean;
}

const DEFAULT_MIN_ZOOM = 0.1;
const DEFAULT_MAX_ZOOM = 4;
const SIZE_EPSILON = 0.5;

/** Whether two measured sizes are effectively unchanged (sub-pixel noise). */
export function viewportSizesEqual(a: ViewportSize, b: ViewportSize): boolean {
  return (
    Math.abs(a.width - b.width) < SIZE_EPSILON &&
    Math.abs(a.height - b.height) < SIZE_EPSILON
  );
}

function resizeZoomScale(
  prevSize: ViewportSize,
  nextSize: ViewportSize
): number {
  const widthRatio = nextSize.width / prevSize.width;
  const heightRatio = nextSize.height / prevSize.height;
  return Math.sqrt(widthRatio * heightRatio);
}

/**
 * Recompute pan so the flow coordinate that was at the previous screen center
 * stays at the new screen center. Optionally scales zoom with the pane resize.
 */
export function anchorViewportToCenter(
  viewport: CanvasViewport,
  prevSize: ViewportSize,
  nextSize: ViewportSize,
  options?: AnchorViewportOptions
): CanvasViewport {
  const { x, y, zoom } = viewport;
  const flowX = (prevSize.width / 2 - x) / zoom;
  const flowY = (prevSize.height / 2 - y) / zoom;

  let nextZoom = zoom;
  if (options?.scaleZoom) {
    const minZoom = options.minZoom ?? DEFAULT_MIN_ZOOM;
    const maxZoom = options.maxZoom ?? DEFAULT_MAX_ZOOM;
    nextZoom = Math.min(
      maxZoom,
      Math.max(minZoom, zoom * resizeZoomScale(prevSize, nextSize))
    );
  }

  return {
    x: nextSize.width / 2 - flowX * nextZoom,
    y: nextSize.height / 2 - flowY * nextZoom,
    zoom: nextZoom,
  };
}
