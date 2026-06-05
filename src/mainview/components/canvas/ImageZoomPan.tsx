import { type ReactNode, useEffect, useState } from 'react';

import { useImageZoomPan } from '@/hooks/useImageZoomPan';

interface ImageZoomPanProps {
  children: ReactNode;
}

export function ImageZoomPan({ children }: ImageZoomPanProps) {
  const { containerRef, isPanning, panX, panY, reset, zoom } =
    useImageZoomPan();
  const [showIndicator, setShowIndicator] = useState(false);
  const [indicatorTimeout, setIndicatorTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    if (zoom !== 1) {
      setShowIndicator(true);
      if (indicatorTimeout) {
        clearTimeout(indicatorTimeout);
      }
      const timeout = setTimeout(() => setShowIndicator(false), 1500);
      setIndicatorTimeout(timeout);
      return () => clearTimeout(timeout);
    }
    return () => {
      if (indicatorTimeout) {
        clearTimeout(indicatorTimeout);
      }
    };
  }, [zoom, indicatorTimeout]);

  return (
    <div
      className="relative h-full w-full"
      onDoubleClick={reset}
      ref={containerRef}
      style={{
        cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
        overflow: 'hidden',
        touchAction: 'none',
      }}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>

      {showIndicator && zoom !== 1 ? (
        <div className="pointer-events-none absolute right-1/2 bottom-6 translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-white/80 text-xs backdrop-blur-md">
          {Math.round(zoom * 100)}%
        </div>
      ) : null}
    </div>
  );
}
