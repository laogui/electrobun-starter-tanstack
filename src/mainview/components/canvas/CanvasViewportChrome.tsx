import type { Node } from '@xyflow/react';
import { Controls, MiniMap, Panel } from '@xyflow/react';

import { Map as MapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as m from '../../../paraglide/messages.js';

interface CanvasViewportChromeProps {
  backgroundColor: string;
  maskColor: string;
  nodeColor: (node: Node) => string;
  nodeStrokeColor: string;
  onShowMinimapChange: (show: boolean) => void;
  /** When false, keep the overview toggle alongside the zoom controls. */
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
  onShowMinimapChange,
  showMinimap = false,
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
          ariaLabel={m.settings_canvas_minimap_label()}
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
      >
        <button
          aria-expanded={showMinimap}
          aria-label={m.settings_canvas_minimap_label()}
          aria-pressed={showMinimap}
          className="react-flow__controls-button canvas-minimap-toggle"
          onClick={() => onShowMinimapChange(!showMinimap)}
          title={m.settings_canvas_minimap_label()}
          type="button"
        >
          <MapIcon aria-hidden size={15} strokeWidth={1.8} />
        </button>
      </Controls>
    </Panel>
  );
}
