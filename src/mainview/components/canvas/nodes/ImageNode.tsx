import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import { ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { rpcLoadAttachment, rpcSaveAttachment } from '@/lib/rpc';
import { createImageThumbnail } from '@/lib/thumbnail';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { ReplaceImageConfirmDialog } from '../ReplaceImageConfirmDialog';

const handleClassName = 'conn-handle nodrag';
const FILE_EXT_RE = /\.[^.]+$/;

export interface ImageData {
  color: string;
  imageFile?: string;
  imageUrl: string;
  isDropTarget?: boolean;
  isHidden?: boolean;
  thumbnailFile?: string;
  thumbnailUrl?: string;
  title?: string;
}

export const ImageContent = ({
  data,
  isFocused,
  onTitleChange,
}: {
  data: ImageData;
  isFocused?: boolean;
  onTitleChange?: (title: string) => void;
}) => {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);

  const handleTitleBlur = useCallback(() => {
    setEditingTitle(false);
    if (!onTitleChange) {
      return;
    }
    const next = titleRef.current?.textContent?.trim() ?? '';
    if (next !== (data.title ?? '')) {
      onTitleChange(next);
    }
  }, [data.title, onTitleChange]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLHeadingElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        titleRef.current?.blur();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (titleRef.current) {
          titleRef.current.textContent = data.title ?? '';
        }
        titleRef.current?.blur();
      }
    },
    [data.title]
  );

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      if (!onTitleChange || isFocused) {
        return;
      }
      e.stopPropagation();
      setEditingTitle(true);
      globalThis.requestAnimationFrame(() => {
        titleRef.current?.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        if (titleRef.current) {
          range.selectNodeContents(titleRef.current);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      });
    },
    [isFocused, onTitleChange]
  );
  // The canvas always prefers the lightweight thumbnail when present so we
  // avoid keeping the original full-resolution bitmap in memory just to draw
  // a card preview. The focused / lightbox view falls back to the original
  // and lazy-loads it from the workspace attachment when needed.
  const [lazyImageUrl, setLazyImageUrl] = useState<string | null>(null);
  const [lazyLoadFailed, setLazyLoadFailed] = useState(false);

  useEffect(() => {
    setLazyImageUrl(null);
    setLazyLoadFailed(false);
    if (!isFocused) {
      return;
    }
    if (data.imageUrl) {
      return;
    }
    if (!data.imageFile) {
      return;
    }
    let cancelled = false;
    rpcLoadAttachment(data.imageFile)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (result?.dataUrl) {
          setLazyImageUrl(result.dataUrl);
          return;
        }
        setLazyLoadFailed(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLazyLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data.imageFile, data.imageUrl, isFocused]);

  const focusedSrc = data.imageUrl || lazyImageUrl || data.thumbnailUrl;
  const previewSrc = data.thumbnailUrl || data.imageUrl;
  const displaySrc = isFocused ? focusedSrc : previewSrc;
  const isLazyLoading =
    isFocused &&
    !data.imageUrl &&
    !!data.imageFile &&
    !lazyImageUrl &&
    !lazyLoadFailed;

  if (!(displaySrc || isLazyLoading)) {
    return (
      <div
        className="flex size-full flex-col items-center justify-center gap-3"
        style={colorToStyle(data.color)}
      >
        <ImagePlus className="text-gray-300" size={isFocused ? 64 : 40} />
        <span className="text-gray-400 text-sm">
          {lazyLoadFailed ? 'Failed to load image' : 'No image'}
        </span>
        {lazyLoadFailed ? (
          <button
            className="nodrag nopan inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-neutral-600 text-xs shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setLazyLoadFailed(false);
            }}
            type="button"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col" style={colorToStyle(data.color)}>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {displaySrc ? (
          <img
            alt={data.title ?? ''}
            className={cn(
              'pointer-events-none size-full',
              isFocused ? 'object-contain' : 'object-cover'
            )}
            draggable={false}
            src={displaySrc}
          />
        ) : null}
        {isLazyLoading ? (
          <div className="absolute inset-0 grid place-items-center bg-black/5">
            <Loader2 className="animate-spin text-white/80" size={28} />
          </div>
        ) : null}
      </div>
      {data.title || (onTitleChange && !isFocused) ? (
        <div className="border-black/5 border-t px-4 py-3">
          <h3
            className={cn(
              'truncate font-semibold leading-tight outline-none',
              onTitleChange && !isFocused && 'nodrag nopan',
              isFocused ? 'text-xl' : 'text-sm',
              !(data.title || editingTitle) && 'opacity-40',
              editingTitle &&
                'nodrag nopan rounded-md bg-black/5 px-1 ring-1 ring-blue-400/40 dark:bg-white/10'
            )}
            contentEditable={editingTitle}
            onBlur={handleTitleBlur}
            onClick={onTitleChange && !isFocused ? startEditing : undefined}
            onKeyDown={handleTitleKeyDown}
            ref={titleRef}
            suppressContentEditableWarning
          >
            {data.title || (onTitleChange && !isFocused ? 'Add title…' : '')}
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
  const { tag, tagColor, tags, dimmedByFilter, tagEditor } = useNodeTagEditing(
    id,
    data as unknown as Record<string, unknown>
  );
  const isDark = isColorDark(data.color);
  const isZoomedOut = zoom < 0.4;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', async (e) => {
        const imageUrl = e.target?.result as string;
        const title = data.title || file.name.replace(FILE_EXT_RE, '');

        // Show image immediately with data URL — snapshot for undo
        commitNodeData(id, { imageUrl, title });

        // Save the original to a workspace attachment (side-effect; no extra snapshot)
        try {
          const original = await rpcSaveAttachment(imageUrl, data.imageFile);
          if (original?.filePath) {
            updateNodeData(id, { imageFile: original.filePath });
          }
        } catch (error) {
          console.error('[ImageNode] Failed to save attachment:', error);
          return;
        }

        // Generate and persist a lightweight thumbnail. Best-effort: large
        // images get a small preview the canvas can display without holding
        // the original bitmap in memory; small images skip this entirely.
        try {
          const thumbnailDataUrl = await createImageThumbnail(imageUrl);
          if (!thumbnailDataUrl) {
            return;
          }
          const thumb = await rpcSaveAttachment(
            thumbnailDataUrl,
            data.thumbnailFile,
            {
              kind: 'image',
              mimeType: 'image/jpeg',
              suggestedName: `${file.name.replace(FILE_EXT_RE, '')}-thumbnail.jpg`,
            }
          );
          if (thumb?.filePath) {
            updateNodeData(id, {
              thumbnailFile: thumb.filePath,
              thumbnailUrl: thumbnailDataUrl,
            });
          }
        } catch (error) {
          console.error('[ImageNode] Failed to save thumbnail:', error);
        }
      });
      reader.readAsDataURL(file);
    },
    [id, data, commitNodeData, updateNodeData]
  );

  // Pending replacement file — when set, the confirm dialog is shown.
  // null = no pending replacement. We store the File so the dialog can defer
  // processing until the user confirms.
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(
    null
  );

  const acceptOrConfirm = useCallback(
    (file: File) => {
      if (data.imageUrl) {
        setPendingReplaceFile(file);
        return;
      }
      handleFile(file);
    },
    [data.imageUrl, handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        acceptOrConfirm(file);
      }
    },
    [acceptOrConfirm]
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
            e.preventDefault();
            acceptOrConfirm(file);
            return;
          }
        }
      }
    },
    [acceptOrConfirm]
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
        'group/image size-full transition-opacity',
        data.isHidden
          ? 'pointer-events-none opacity-0'
          : dimmedByFilter
            ? 'opacity-30'
            : 'opacity-100'
      )}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {tagEditor}
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

      <ReplaceImageConfirmDialog
        onCancel={() => setPendingReplaceFile(null)}
        onConfirm={() => {
          if (pendingReplaceFile) {
            handleFile(pendingReplaceFile);
          }
          setPendingReplaceFile(null);
        }}
        open={pendingReplaceFile !== null}
      />

      <div
        className={cn(
          'node-visual relative size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover'
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
          <ImageContent
            data={data}
            onTitleChange={(title) => commitNodeData(id, { title })}
          />
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
        {!isZoomedOut && (tag || (tags && tags.length > 0)) ? (
          <div className="pointer-events-none absolute right-3 bottom-3 left-3">
            <NodeTagChips
              isDark={isDark}
              tag={tag}
              tagColor={tagColor}
              tags={tags}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(ImageNode);
