import { NodeResizeControl } from '@xyflow/react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  /**
   * Tailwind hover class scoped to the parent node's named group, e.g.
   * `group-hover/card:opacity-100`. Passed as a literal so Tailwind's JIT can
   * detect it; the matching `group/<name>` marker lives on the node wrapper.
   */
  hoverClassName: string;
  maxHeight?: number;
  maxWidth?: number;
  minHeight: number;
  minWidth: number;
  nodeId: string;
  /** Called on resize start, after the global `resizing-nwse` cursor is set. */
  onResizeStart?: () => void;
}

export function beginResizingNwseCursor(): void {
  document.body.classList.add('resizing-nwse');
}

export function endResizingNwseCursor(): void {
  document.body.classList.remove('resizing-nwse');
}

/** Drop the global resize cursor if the handle unmounts mid-gesture. */
export function useResizingNwseCursorCleanup(): void {
  useEffect(() => endResizingNwseCursor, []);
}

/**
 * Shared bottom-right resize affordance for canvas nodes. Wraps React Flow's
 * `NodeResizeControl`, toggles the global `resizing-nwse` cursor class, and
 * renders the standard two-tone resize glyph that fades in on node hover.
 */
export const ResizeHandle = ({
  hoverClassName,
  maxHeight,
  maxWidth,
  minHeight,
  minWidth,
  onResizeStart,
}: ResizeHandleProps) => {
  useResizingNwseCursorCleanup();

  return (
    <NodeResizeControl
      // z-10 lifts the control above `node-visual` wrappers that are
      // `position: relative` (image/asset/link/recording nodes). Without it,
      // the visual layer - which sits later in the DOM - paints over the
      // handle and hides the resize glyph. Mirrors the inline `z-10` already
      // used by StickyNode's own resize control.
      className="z-10 border-none! bg-transparent!"
      maxHeight={maxHeight}
      maxWidth={maxWidth}
      minHeight={minHeight}
      minWidth={minWidth}
      onResizeEnd={endResizingNwseCursor}
      onResizeStart={() => {
        beginResizingNwseCursor();
        onResizeStart?.();
      }}
      position="bottom-right"
      style={{ padding: 0 }}
    >
      <div
        aria-hidden="true"
        className={cn(
          'absolute right-2 bottom-2 cursor-nwse-resize opacity-0',
          hoverClassName
        )}
      >
        <svg
          height="16"
          viewBox="0 0 16 16"
          width="16"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Resize handle</title>
          <g fill="none" fillRule="evenodd">
            <path
              d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"
              fill="#1B2536"
              fillOpacity="0.5"
            />
            <path
              d="M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z"
              fill="#FFF"
              fillOpacity="0.7"
            />
          </g>
        </svg>
      </div>
    </NodeResizeControl>
  );
};
