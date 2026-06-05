import { NodeResizeControl } from '@xyflow/react';
import { type KeyboardEvent, useCallback } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

interface ResizeHandleProps {
  /**
   * Tailwind hover class scoped to the parent node's named group, e.g.
   * `group-hover/card:opacity-100`. Passed as a literal so Tailwind's JIT can
   * detect it; the matching `group/<name>` marker lives on the node wrapper.
   */
  hoverClassName: string;
  maxHeight: number;
  maxWidth: number;
  minHeight: number;
  minWidth: number;
  nodeId: string;
  /** Called on resize start, after the global `resizing-nwse` cursor is set. */
  onResizeStart?: () => void;
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
  nodeId,
  onResizeStart,
}: ResizeHandleProps) => {
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const setNodes = useCanvasStore((s) => s.setNodes);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const widthDelta =
        event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const heightDelta =
        event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (!(widthDelta || heightDelta)) {
        return;
      }

      event.preventDefault();
      const step = event.shiftKey ? 24 : 8;
      saveSnapshot();
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }
          const width = Number(node.style?.width ?? node.measured?.width);
          const height = Number(node.style?.height ?? node.measured?.height);
          const currentWidth = Number.isFinite(width) ? width : minWidth;
          const currentHeight = Number.isFinite(height) ? height : minHeight;
          const nextWidth = Math.min(
            maxWidth,
            Math.max(minWidth, currentWidth + widthDelta * step)
          );
          const nextHeight = Math.min(
            maxHeight,
            Math.max(minHeight, currentHeight + heightDelta * step)
          );

          return {
            ...node,
            style: {
              ...node.style,
              width: nextWidth,
              height: nextHeight,
            },
          };
        })
      );
    },
    [maxHeight, maxWidth, minHeight, minWidth, nodeId, saveSnapshot, setNodes]
  );

  return (
    <NodeResizeControl
      className="border-none! bg-transparent!"
      maxHeight={maxHeight}
      maxWidth={maxWidth}
      minHeight={minHeight}
      minWidth={minWidth}
      onResizeEnd={() => {
        document.body.classList.remove('resizing-nwse');
      }}
      onResizeStart={() => {
        document.body.classList.add('resizing-nwse');
        onResizeStart?.();
      }}
      position="bottom-right"
      style={{ padding: 0 }}
    >
      <button
        aria-keyshortcuts="ArrowUp ArrowRight ArrowDown ArrowLeft"
        aria-label="Resize node"
        className={cn(
          'absolute right-2 bottom-2 cursor-nwse-resize border-0 bg-transparent p-0 opacity-0 focus:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500',
          hoverClassName
        )}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <svg
          aria-hidden="true"
          height="16"
          viewBox="0 0 16 16"
          width="16"
          xmlns="http://www.w3.org/2000/svg"
        >
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
      </button>
    </NodeResizeControl>
  );
};
