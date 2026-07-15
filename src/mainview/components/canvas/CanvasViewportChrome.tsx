import type { Node } from '@xyflow/react';
import { Controls, MiniMap, Panel } from '@xyflow/react';

import { cn } from '@/lib/utils';

interface CanvasViewportChromeProps {
  backgroundColor: string;
  maskColor: string;
  nodeColor: (node: Node) => string;
  nodeStrokeColor: string;
  /** When false, only the zoom controls strip is shown. */
  showMinimap?: boolean;
}

/**
 * Bottom-right viewport chrome: optional minimap + zoom controls as one frosted card.
 * React Flow only ships separate Controls/MiniMap panels — this composes them.
 */
export function CanvasViewportChrome({
  backgroundColor,
  maskColor,
  nodeColor,
  nodeStrokeColor,
  showMinimap = true,
}: CanvasViewportChromeProps) {
  return (
    <Panel
      className={cn(
        'canvas-viewport-chrome canvas-floating-surface !m-3 overflow-hidden p-0',
        !showMinimap && 'canvas-viewport-chrome--controls-only'
      )}
      position="bottom-right"
    >
      {showMinimap ? (
        <MiniMap
          ariaLabel="Canvas overview"
          maskColor={maskColor}
          nodeColor={nodeColor}
          nodeStrokeColor={nodeStrokeColor}
          pannable
          style={{
            backgroundColor,
            border: 'none',
            borderRadius: 0,
            margin: 0,
          }}
          zoomable
        />
      ) : null}
      <Controls
        className="canvas-viewport-controls"
        orientation="horizontal"
        showInteractive={false}
      />
    </Panel>
  );
}
