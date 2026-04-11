import {
  useViewport,
  NodeResizeControl,
  Handle,
  Position,
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
    const text = textRef.current?.innerText ?? '';
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
        'w-full h-full group/sticky',
        data.isHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        minWidth={120}
        minHeight={120}
        maxWidth={500}
        maxHeight={500}
        position='bottom-right'
        className='!bg-transparent !border-none'
        style={{ padding: 0 }}
        onResizeStart={() => document.body.classList.add('resizing-nwse')}
        onResizeEnd={() => document.body.classList.remove('resizing-nwse')}
      >
        <div className='absolute bottom-2 right-2 opacity-0 group-hover/sticky:opacity-100 transition-opacity cursor-nwse-resize'>
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
          'w-full h-full rounded-xl shadow-sm border border-black/5 overflow-hidden cursor-grab',
          'transition-shadow duration-200 ease-out hover:shadow-lg'
        )}
        onDoubleClick={handleDoubleClick}
      >
        {isZoomedOut ? (
          <div className='w-full h-full p-3' style={colorToStyle(data.color)}>
            <div className='mt-1 space-y-2 opacity-30'>
              <div className='h-2 bg-current rounded-full w-full' />
              <div className='h-2 bg-current rounded-full w-4/6' />
            </div>
          </div>
        ) : (
          <div
            className='w-full h-full p-4 flex flex-col'
            style={colorToStyle(data.color)}
          >
            <div
              ref={textRef}
              contentEditable={editing}
              suppressContentEditableWarning
              className={cn(
                'flex-1 outline-none whitespace-pre-wrap break-words leading-relaxed text-sm',
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
