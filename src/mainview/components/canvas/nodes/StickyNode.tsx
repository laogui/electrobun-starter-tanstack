import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { memo, useCallback, useRef, useState } from 'react';

import { colorToStyle } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';

const StickyNode = ({ id, data }: any) => {
  const { zoom } = useViewport();
  const onUpdate = useCanvasStore((s) => s.updateNodeData);
  const isZoomedOut = zoom < 0.4;
  const [editing, setEditing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => {
    const text = textRef.current?.textContent ?? '';
    if (text !== data.content) {
      onUpdate(id, { content: text });
    }
    setEditing(false);
  }, [id, data.content, onUpdate]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => textRef.current?.focus(), 10);
  }, []);

  return (
    <div
      className={cn(
        'group/sticky size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={500}
        maxWidth={500}
        minHeight={120}
        minWidth={120}
        onResizeEnd={() => {
          document.body.classList.remove('resizing-nwse');
        }}
        onResizeStart={() => {
          document.body.classList.add('resizing-nwse');
        }}
        position="bottom-right"
        style={{ padding: 0 }}
      >
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/sticky:opacity-100">
          <svg
            height="12"
            viewBox="0 0 16 16"
            width="12"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Resize</title>
            <g fill="none" fillRule="evenodd">
              <path
                d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"
                fill="#1B2536"
                fillOpacity="0.3"
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <Handle
        className={handleClassName}
        id="top"
        position={Position.Top}
        type="target"
      />
      <Handle
        className={handleClassName}
        id="right"
        position={Position.Right}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="bottom"
        position={Position.Bottom}
        type="source"
      />
      <Handle
        className={handleClassName}
        id="left"
        position={Position.Left}
        type="target"
      />

      <div
        className={cn(
          'size-full cursor-grab overflow-hidden rounded-xl border border-black/5 shadow-sm',
          'transition-shadow duration-200 ease-out hover:shadow-lg'
        )}
        onDoubleClick={handleDoubleClick}
      >
        {isZoomedOut ? (
          <div className="size-full p-3" style={colorToStyle(data.color)}>
            <div className="mt-1 space-y-2 opacity-30">
              <div className="h-2 w-full rounded-full bg-current" />
              <div className="h-2 w-4/6 rounded-full bg-current" />
            </div>
          </div>
        ) : (
          <div
            className="flex size-full flex-col p-4"
            style={colorToStyle(data.color)}
          >
            <div
              className={cn(
                'wrap-break-word flex-1 whitespace-pre-wrap text-sm/relaxed outline-none',
                editing ? 'nodrag nopan cursor-text' : 'pointer-events-none'
              )}
              contentEditable={editing}
              onBlur={handleBlur}
              ref={textRef}
              suppressContentEditableWarning
            >
              {data.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(StickyNode);
