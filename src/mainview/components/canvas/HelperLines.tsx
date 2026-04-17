import { useViewport } from '@xyflow/react';

interface HelperLinesProps {
  horizontal?: number;
  vertical?: number;
}

export function HelperLines({ horizontal, vertical }: HelperLinesProps) {
  const { x, y, zoom } = useViewport();

  if (horizontal === undefined && vertical === undefined) {
    return null;
  }

  const canvasStyle = {
    position: 'absolute' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex: 1000,
  };

  return (
    <div style={canvasStyle}>
      <svg height="100%" width="100%">
        <title>Helper alignment lines</title>
        {vertical === undefined ? null : (
          <line
            stroke="#0096ff"
            strokeDasharray="6 3"
            strokeWidth={1}
            x1={vertical * zoom + x}
            x2={vertical * zoom + x}
            y1={0}
            y2="100%"
          />
        )}
        {horizontal === undefined ? null : (
          <line
            stroke="#0096ff"
            strokeDasharray="6 3"
            strokeWidth={1}
            x1={0}
            x2="100%"
            y1={horizontal * zoom + y}
            y2={horizontal * zoom + y}
          />
        )}
      </svg>
    </div>
  );
}
