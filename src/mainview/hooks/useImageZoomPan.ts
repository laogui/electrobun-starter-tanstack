import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
/** Zoom factor per wheel pixel; a 100px mouse notch ≈ 18%. */
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const MAX_WHEEL_DELTA = 100;
const LINE_HEIGHT_PX = 16;
/** Idle time after the last wheel event before transitions resume. */
const WHEEL_IDLE_MS = 150;

interface UseImageZoomPanReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPanning: boolean;
  isWheeling: boolean;
  panX: number;
  panY: number;
  reset: () => void;
  zoom: number;
}

export function clampPan(
  pan: number,
  zoom: number,
  containerSize: number
): number {
  if (zoom <= 1) {
    return 0;
  }
  const maxPan = ((zoom - 1) * containerSize) / 2;
  return Math.max(-maxPan, Math.min(maxPan, pan));
}

export function useImageZoomPan(): UseImageZoomPanReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isWheeling, setIsWheeling] = useState(false);

  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Mirror the latest zoom/pan into refs so the pointer listeners (registered
  // once) can read fresh values without re-subscribing on every state change.
  const zoomRef = useRef(zoom);
  const panRef = useRef({ x: panX, y: panY });

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = { x: panX, y: panY };
  });

  const reset = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setIsPanning(false);
    pointerStartRef.current = null;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let wheelIdleTimer: ReturnType<typeof setTimeout> | undefined;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Wheel zoom is direct manipulation: track 1:1, no easing lag.
      setIsWheeling(true);
      clearTimeout(wheelIdleTimer);
      wheelIdleTimer = setTimeout(() => {
        setIsWheeling(false);
      }, WHEEL_IDLE_MS);

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;
      const rawDelta = e.deltaMode === 1 ? e.deltaY * LINE_HEIGHT_PX : e.deltaY;
      const delta = Math.max(
        -MAX_WHEEL_DELTA,
        Math.min(MAX_WHEEL_DELTA, rawDelta)
      );

      setZoom((prevZoom) => {
        const newZoom = Math.min(
          MAX_ZOOM,
          Math.max(
            MIN_ZOOM,
            prevZoom * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY)
          )
        );

        if (newZoom === prevZoom) {
          return prevZoom;
        }

        const zoomRatio = newZoom / prevZoom;
        setPanX((prev) => {
          const adjusted = cursorX - (cursorX - prev) * zoomRatio;
          return clampPan(adjusted, newZoom, rect.width);
        });
        setPanY((prev) => {
          const adjusted = cursorY - (cursorY - prev) * zoomRatio;
          return clampPan(adjusted, newZoom, rect.height);
        });

        return newZoom;
      });
    };

    // Custom zoom intentionally prevents native scroll on the image surface.
    // react-doctor-disable-next-line react-doctor/client-passive-event-listeners
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      clearTimeout(wheelIdleTimer);
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (zoomRef.current <= 1) {
        return;
      }
      e.preventDefault();
      container.setPointerCapture(e.pointerId);
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...panRef.current };
      setIsPanning(true);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!pointerStartRef.current) {
        return;
      }
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      const rect = container.getBoundingClientRect();
      const zoomLevel = zoomRef.current;
      setPanX(clampPan(panStartRef.current.x + dx, zoomLevel, rect.width));
      setPanY(clampPan(panStartRef.current.y + dy, zoomLevel, rect.height));
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (pointerStartRef.current) {
        container.releasePointerCapture(e.pointerId);
      }
      pointerStartRef.current = null;
      setIsPanning(false);
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  return { containerRef, isPanning, isWheeling, panX, panY, reset, zoom };
}
