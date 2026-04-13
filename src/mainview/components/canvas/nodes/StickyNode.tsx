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
        minWidth={120}
        minHeight={120}
        maxWidth={500}
        maxHeight={500}
        position='bottom-right'
        className='border-none! bg-transparent!'
        style={{ padding: 0 }}
        onResizeStart={() => {
          document.body.classList.add('resizing-nwse');
        }}
        onResizeEnd={() => {
          document.body.classList.remove('resizing-nwse');
        }}
      >
        <div className='absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/sticky:opacity-100'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='12'
            height='12'
            viewBox='0 0 16 16'
          >
            <g fill='none' fillRule='evenodd'>
              <path
                fill='#1B2536'
                fillOpacity='0.3'
                d='M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z'
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <Handle
        type='target'
        position={Position.Top}
        id='top'
        className={handleClassName}
      />
      <Handle
        type='source'
        position={Position.Right}
        id='right'
        className={handleClassName}
      />
      <Handle
        type='source'
        position={Position.Bottom}
        id='bottom'
        className={handleClassName}
      />
      <Handle
        type='target'
        position={Position.Left}
        id='left'
        className={handleClassName}
      />

      <div
        className={cn(
          'size-full cursor-grab overflow-hidden rounded-xl border border-black/5 shadow-sm',
          'transition-shadow duration-200 ease-out hover:shadow-lg'
        )}
        onDoubleClick={handleDoubleClick}
      >
        {isZoomedOut ? (
          <div className='size-full p-3' style={colorToStyle(data.color)}>
            <div className='mt-1 space-y-2 opacity-30'>
              <div className='h-2 w-full rounded-full bg-current' />
              <div className='h-2 w-4/6 rounded-full bg-current' />
            </div>
          </div>
        ) : (
          <div
            className='flex size-full flex-col p-4'
            style={colorToStyle(data.color)}
          >
            <div
              ref={textRef}
              suppressContentEditableWarning
              contentEditable={editing}
              className={cn(
                'flex-1 text-sm/relaxed wrap-break-word whitespace-pre-wrap outline-none',
                editing ? 'nodrag nopan cursor-text' : 'pointer-events-none'
              )}
              onBlur={handleBlur}
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
