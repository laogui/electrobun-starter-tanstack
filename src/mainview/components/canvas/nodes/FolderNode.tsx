import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { Folder } from 'lucide-react';
import { memo } from 'react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';

const FolderNode = ({ data }: any) => {
  const { zoom } = useViewport();
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isZoomedOut = zoom < 0.4;

  return (
    <div
      className={cn(
        'group/folder relative size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={600}
        maxWidth={600}
        minHeight={250}
        minWidth={250}
        onResizeEnd={() => {
          document.body.classList.remove('resizing-nwse');
        }}
        onResizeStart={() => {
          document.body.classList.add('resizing-nwse');
          saveSnapshot();
        }}
        position="bottom-right"
        style={{ padding: 0 }}
      >
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/folder:opacity-100">
          <svg
            height="16"
            viewBox="0 0 16 16"
            width="16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Resize</title>
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

      <Handle
        className={handleClassName}
        id="top"
        position={Position.Top}
        type="source"
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
        type="source"
      />

      {/* Visual content wrapper — transforms here don't affect Handle positions */}
      <div
        className={cn(
          'absolute inset-0 cursor-pointer transition-all duration-200 ease-out',
          data.isDropTarget && 'scale-105'
        )}
      >
        {/* Stack backgrounds */}
        <div
          className={cn(
            'absolute inset-0 rounded-3xl bg-white/40 shadow-sm transition-transform duration-200 ease-out',
            data.isDropTarget
              ? 'translate-y-2.5 scale-[0.88]'
              : 'translate-y-1.5 scale-90'
          )}
        />
        <div
          className={cn(
            'absolute inset-0 rounded-3xl bg-white/70 shadow-sm transition-transform duration-200 ease-out',
            data.isDropTarget
              ? 'translate-y-1.5 scale-[0.93]'
              : 'translate-y-0.5 scale-95'
          )}
        />

        {/* Main folder cover */}
        <div
          className={cn(
            'node-visual absolute inset-0 flex flex-col items-center justify-center rounded-3xl border bg-white p-8 text-center shadow-md transition-all duration-200 ease-out',
            data.isDropTarget
              ? '-translate-y-1 border-2 border-blue-400 shadow-blue-100 shadow-lg'
              : 'border-gray-100'
          )}
        >
          <div
            className={cn(
              'mb-6 rounded-2xl bg-gray-100 p-4 transition-transform duration-200 ease-out',
              data.isDropTarget && 'rotate-[5deg] scale-110'
            )}
          >
            <Folder className="text-gray-400" size={40} />
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
            <p className="mt-3 text-gray-500 text-sm">{data.subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(FolderNode);
