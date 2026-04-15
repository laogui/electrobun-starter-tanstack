import {
  Handle,
  NodeResizeControl,
  Position,
  useReactFlow,
  useViewport,
} from '@xyflow/react';
import { ImagePlus } from 'lucide-react';
import { memo, useCallback, useRef } from 'react';

import { colorToStyle } from '@/lib/colorUtils';
import { rpcSaveAttachment } from '@/lib/rpc';
import { cn } from '@/lib/utils';

const handleClassName = 'conn-handle nodrag';

export interface ImageData {
  imageUrl: string;
  imageFile?: string;
  title?: string;
  color: string;
  isHidden?: boolean;
  isDropTarget?: boolean;
}

export const ImageContent = ({
  data,
  isFocused,
}: {
  data: ImageData;
  isFocused?: boolean;
}) => {
  if (!data.imageUrl) {
    return (
      <div
        className='flex size-full flex-col items-center justify-center gap-3'
        style={colorToStyle(data.color)}
      >
        <ImagePlus size={isFocused ? 64 : 40} className='text-gray-300' />
        <span className='text-sm text-gray-400'>No image</span>
      </div>
    );
  }

  return (
    <div className='flex size-full flex-col' style={colorToStyle(data.color)}>
      <div className='min-h-0 flex-1 overflow-hidden'>
        <img
          src={data.imageUrl}
          alt={data.title ?? ''}
          className={cn(
            'pointer-events-none size-full',
            isFocused ? 'object-contain' : 'object-cover'
          )}
          draggable={false}
        />
      </div>
      {data.title ? (
        <div className='border-t border-black/5 px-4 py-3'>
          <h3
            className={cn(
              'truncate leading-tight font-semibold',
              isFocused ? 'text-xl' : 'text-sm'
            )}
          >
            {data.title}
          </h3>
        </div>
      ) : null}
    </div>
  );
};

const ImageNode = ({ id, data }: { id: string; data: ImageData }) => {
  const { zoom } = useViewport();
  const { updateNodeData } = useReactFlow();
  const isZoomedOut = zoom < 0.4;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.addEventListener('load', (e) => {
        const imageUrl = e.target?.result as string;
        const title = data.title || file.name.replace(/\.[^.]+$/, '');

        // Show image immediately with data URL
        updateNodeData(id, { imageUrl, title });

        // Save to local file in background
        rpcSaveAttachment(imageUrl, data.imageFile)
          .then((result) => {
            if (result?.filePath) {
              updateNodeData(id, { imageFile: result.filePath });
            }
          })
          .catch((error) => {
            console.error('[ImageNode] Failed to save attachment:', error);
          });
      });
      reader.readAsDataURL(file);
    },
    [id, data, updateNodeData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const { items } = e.clipboardData;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  const openFilePicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className={cn(
        'group/image size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onPaste={handlePaste}
    >
      <NodeResizeControl
        minWidth={150}
        minHeight={150}
        maxWidth={800}
        maxHeight={900}
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
        <div className='absolute right-2 bottom-2 cursor-nwse-resize opacity-0 transition-opacity group-hover/image:opacity-100'>
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

      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleFileInput}
      />

      <div
        className={cn(
          'size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-sm',
          'transition-shadow duration-200 ease-out hover:shadow-lg'
        )}
      >
        {isZoomedOut ? (
          <div
            className='flex size-full items-center justify-center'
            style={colorToStyle(data.color)}
          >
            {data.imageUrl ? (
              <img
                src={data.imageUrl}
                alt=''
                className='pointer-events-none size-full object-cover'
                draggable={false}
              />
            ) : (
              <ImagePlus size={32} className='text-gray-300' />
            )}
          </div>
        ) : data.imageUrl ? (
          <ImageContent data={data} />
        ) : (
          <div
            className='flex size-full flex-col items-center justify-center gap-3'
            style={colorToStyle(data.color)}
          >
            <button
              className='nodrag nopan flex cursor-pointer flex-col items-center gap-3 rounded-2xl p-6 transition-colors hover:bg-black/5'
              onClick={openFilePicker}
            >
              <ImagePlus size={40} className='text-gray-300' />
              <span className='text-sm text-gray-400'>Click to add image</span>
            </button>
            <span className='text-xs text-gray-300'>
              or drag &amp; drop / paste
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ImageNode);
