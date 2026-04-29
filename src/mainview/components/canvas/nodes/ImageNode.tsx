import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { ImagePlus } from 'lucide-react';
import { memo, useCallback, useRef } from 'react';

import { colorToStyle } from '@/lib/colorUtils';
import { rpcSaveAttachment } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';
const FILE_EXT_RE = /\.[^.]+$/;

export interface ImageData {
  color: string;
  imageFile?: string;
  imageUrl: string;
  isDropTarget?: boolean;
  isHidden?: boolean;
  title?: string;
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
        className="flex size-full flex-col items-center justify-center gap-3"
        style={colorToStyle(data.color)}
      >
        <ImagePlus className="text-gray-300" size={isFocused ? 64 : 40} />
        <span className="text-gray-400 text-sm">No image</span>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col" style={colorToStyle(data.color)}>
      <div className="min-h-0 flex-1 overflow-hidden">
        <img
          alt={data.title ?? ''}
          className={cn(
            'pointer-events-none size-full',
            isFocused ? 'object-contain' : 'object-cover'
          )}
          draggable={false}
          src={data.imageUrl}
        />
      </div>
      {data.title ? (
        <div className="border-black/5 border-t px-4 py-3">
          <h3
            className={cn(
              'truncate font-semibold leading-tight',
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
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isZoomedOut = zoom < 0.4;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', (e) => {
        const imageUrl = e.target?.result as string;
        const title = data.title || file.name.replace(FILE_EXT_RE, '');

        // Show image immediately with data URL — snapshot for undo
        commitNodeData(id, { imageUrl, title });

        // Save to local file in background (side-effect, no extra snapshot)
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
    [id, data, commitNodeData, updateNodeData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
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
      if (file) {
        handleFile(file);
      }
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
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={900}
        maxWidth={800}
        minHeight={150}
        minWidth={150}
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
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 group-hover/image:opacity-100">
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

      <input
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
        ref={fileInputRef}
        type="file"
      />

      <div
        className={cn(
          'node-visual size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-sm',
          'transition-shadow duration-200 ease-out hover:shadow-xl'
        )}
      >
        {isZoomedOut ? (
          <div
            className="flex size-full items-center justify-center"
            style={colorToStyle(data.color)}
          >
            {data.imageUrl ? (
              <img
                alt=""
                className="pointer-events-none size-full object-cover"
                draggable={false}
                src={data.imageUrl}
              />
            ) : (
              <ImagePlus className="text-gray-300" size={32} />
            )}
          </div>
        ) : data.imageUrl ? (
          <ImageContent data={data} />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-3"
            style={colorToStyle(data.color)}
          >
            <button
              className="nodrag nopan flex cursor-pointer flex-col items-center gap-3 rounded-2xl p-6 transition-colors hover:bg-black/5"
              onClick={openFilePicker}
              type="button"
            >
              <ImagePlus className="text-gray-300" size={40} />
              <span className="text-gray-400 text-sm">Click to add image</span>
            </button>
            <span className="text-gray-300 text-xs">
              or drag &amp; drop / paste
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ImageNode);
