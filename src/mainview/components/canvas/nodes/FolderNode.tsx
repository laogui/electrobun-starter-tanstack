import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { Folder } from 'lucide-react';
import { memo } from 'react';

import { cn } from '@/lib/utils';

const handleClassName = 'conn-handle nodrag';

const FolderNode = ({ id, data }: any) => {
  const { zoom } = useViewport();
  const isZoomedOut = zoom < 0.4;

  return (
    <div
      className={cn(
        'group/folder relative size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        minWidth={250}
        minHeight={250}
        maxWidth={600}
        maxHeight={600}
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
        <div className='absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/folder:opacity-100'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            width='16'
            height='16'
            viewBox='0 0 16 16'
          >
            <g fill='none' fillRule='evenodd'>
              <path
                fill='#1B2536'
                fillOpacity='0.5'
                d='M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z'
              />
              <path
                fill='#FFF'
                fillOpacity='0.7'
                d='M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z'
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

      {/* Visual content wrapper — transforms here don't affect Handle positions */}
      <div
        className={cn(
          'absolute inset-0 cursor-pointer transition-all duration-200 ease-out',
          data.isDropTarget ? 'scale-105' : ''
        )}
      >
        {/* Stack backgrounds */}
        <div
          className={cn(
            'absolute inset-0 rounded-3xl bg-white/40 shadow-sm transition-transform duration-200 ease-out',
            data.isDropTarget
              ? 'translate-y-2.5 scale-[0.88]'
              : 'translate-y-1.5 scale-90 group-hover/folder:translate-y-2'
          )}
        />
        <div
          className={cn(
            'absolute inset-0 rounded-3xl bg-white/70 shadow-sm transition-transform duration-200 ease-out',
            data.isDropTarget
              ? 'translate-y-1.5 scale-[0.93]'
              : 'translate-y-0.5 scale-95 group-hover/folder:translate-y-1'
          )}
        />

        {/* Main folder cover */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center rounded-3xl border bg-white p-8 text-center shadow-md transition-all duration-200 ease-out',
            data.isDropTarget
              ? '-translate-y-1 border-2 border-blue-400 shadow-lg shadow-blue-100'
              : 'border-gray-100 group-hover/folder:-translate-y-0.5'
          )}
        >
          <div
            className={cn(
              'mb-6 rounded-2xl bg-gray-100 p-4 transition-transform duration-200 ease-out',
              data.isDropTarget && 'scale-110 rotate-[5deg]'
            )}
          >
            <Folder size={40} className='text-gray-400' />
          </div>
          <h3
            className={cn(
              'font-bold text-gray-800',
              isZoomedOut ? 'text-3xl' : 'text-xl'
            )}
          >
            {data.title}
          </h3>
          {isZoomedOut ? null : (
            <p className='mt-3 text-sm text-gray-500'>{data.subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(FolderNode);
