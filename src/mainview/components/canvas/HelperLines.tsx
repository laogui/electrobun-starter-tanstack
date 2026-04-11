import { useViewport } from '@xyflow/react';

type HelperLinesProps = {
  horizontal?: number;
  vertical?: number;
};

export function HelperLines({ horizontal, vertical }: HelperLinesProps) {
  const { x, y, zoom } = useViewport();

  if (horizontal === undefined && vertical === undefined) return null;

  const canvasStyle = {
    position: 'absolute' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex: 1000,
  };

  return (
    <div style={canvasStyle}>
      <svg width='100%' height='100%'>
        {vertical === undefined ? null : (
          <line
            x1={vertical * zoom + x}
            y1={0}
            x2={vertical * zoom + x}
            y2='100%'
            stroke='#0096ff'
            strokeWidth={1}
            strokeDasharray='6 3'
          />
        )}
        {horizontal === undefined ? null : (
          <line
            x1={0}
            y1={horizontal * zoom + y}
            x2='100%'
            y2={horizontal * zoom + y}
            stroke='#0096ff'
            strokeWidth={1}
            strokeDasharray='6 3'
          />
        )}
      </svg>
    </div>
  );
}
