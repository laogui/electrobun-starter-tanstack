import { memo, useCallback, useRef } from 'react';
import { useReactFlow, useViewport, NodeResizeControl, Handle, Position } from '@xyflow/react';
import { ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { colorToStyle } from '@/lib/colorUtils';

const handleClassName = 'conn-handle nodrag';

export interface ImageData {
  imageUrl: string;
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
        className="w-full h-full flex flex-col items-center justify-center gap-3"
        style={colorToStyle(data.color)}
      >
        <ImagePlus size={isFocused ? 64 : 40} className="text-gray-300" />
        <span className="text-sm text-gray-400">No image</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" style={colorToStyle(data.color)}>
      <div className="flex-1 min-h-0 overflow-hidden">
        <img
          src={data.imageUrl}
          alt={data.title ?? ''}
          className={cn(
            'w-full h-full pointer-events-none',
            isFocused ? 'object-contain' : 'object-cover',
          )}
          draggable={false}
        />
      </div>
      {data.title && (
        <div className="px-4 py-3 border-t border-black/5">
          <h3
            className={cn(
              'font-semibold leading-tight truncate',
              isFocused ? 'text-xl' : 'text-sm',
            )}
          >
            {data.title}
          </h3>
        </div>
      )}
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
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        updateNodeData(id, {
          imageUrl,
          title: data.title || file.name.replace(/\.[^.]+$/, ''),
        });
      };
      reader.readAsDataURL(file);
    },
    [id, data.title, updateNodeData],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
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
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile],
  );

  const openFilePicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className={cn(
        'w-full h-full rounded-3xl shadow-sm border border-black/5 overflow-hidden cursor-pointer group/image',
        'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg',
        data.isHidden ? 'opacity-0 pointer-events-none' : 'opacity-100',
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
        position="bottom-right"
        className="!bg-transparent !border-none"
        style={{ padding: 0 }}
        onResizeStart={() => document.body.classList.add('resizing-nwse')}
        onResizeEnd={() => document.body.classList.remove('resizing-nwse')}
      >
        <div className="absolute bottom-2 right-2 opacity-0 group-hover/image:opacity-100 transition-opacity cursor-nwse-resize">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
          >
            <g fill="none" fillRule="evenodd">
              <path
                fill="#1B2536"
                fillOpacity="0.5"
                d="M13.146 12.146a.5.5 0 0 1 .708.708l-1 1a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-5 5a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-9 9a.5.5 0 0 1-.708-.708z"
              />
              <path
                fill="#FFF"
                fillOpacity="0.7"
                d="M13.146 6.146a.5.5 0 0 1 .708.708l-7 7a.5.5 0 0 1-.708-.708zm0-4a.5.5 0 0 1 .708.708l-11 11a.5.5 0 0 1-.708-.708zm0 8a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708-.708z"
              />
            </g>
          </svg>
        </div>
      </NodeResizeControl>

      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className={handleClassName}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={handleClassName}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={handleClassName}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className={handleClassName}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
      />

      {isZoomedOut ? (
        <div
          className="w-full h-full flex items-center justify-center"
          style={colorToStyle(data.color)}
        >
          {data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt=""
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <ImagePlus size={32} className="text-gray-300" />
          )}
        </div>
      ) : data.imageUrl ? (
        <ImageContent data={data} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={colorToStyle(data.color)}>
          <button
            className="nodrag nopan flex flex-col items-center gap-3 p-6 rounded-2xl hover:bg-black/5 transition-colors cursor-pointer"
            onClick={openFilePicker}
          >
            <ImagePlus size={40} className="text-gray-300" />
            <span className="text-sm text-gray-400">Click to add image</span>
          </button>
          <span className="text-xs text-gray-300">or drag & drop / paste</span>
        </div>
      )}
    </div>
  );
};

export default memo(ImageNode);
