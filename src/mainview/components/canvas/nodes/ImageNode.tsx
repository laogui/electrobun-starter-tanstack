import { AlertTriangle, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import { rpcLoadAttachment, rpcSaveAttachment } from '@/lib/rpc';
import { createImageThumbnail } from '@/lib/thumbnail';
import { cn } from '@/lib/utils';
import { toWorkspaceAttachmentPath } from '@/lib/workspaceAttachmentPaths';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import { ReplaceImageConfirmDialog } from '../ReplaceImageConfirmDialog';
import { AssetHoverCard } from './_shared/AssetHoverCard';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';
import { TypeBadge } from './_shared/TypeBadge';

const FILE_EXT_RE = /\.[^.]+$/;

export interface ImageData {
  color: string;
  imageFile?: string;
  imageUrl?: string;
  isDropTarget?: boolean;
  isHidden?: boolean;
  thumbnailFile?: string;
  thumbnailUrl?: string;
  title?: string;
}

export const ImageContent = ({
  data,
  isFocused,
}: {
  data: ImageData;
  isFocused?: boolean;
}) => {
  // The canvas always prefers the lightweight thumbnail when present so we
  // avoid keeping the original full-resolution bitmap in memory just to draw
  // a card preview. The focused / lightbox view falls back to the original
  // and lazy-loads it from the workspace attachment when needed.
  const rawImageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : '';
  const workspaceImagePath = toWorkspaceAttachmentPath(rawImageUrl);
  const directImageUrl = workspaceImagePath ? '' : rawImageUrl;
  const attachmentToLoad =
    workspaceImagePath ||
    (directImageUrl || (data.thumbnailUrl && !isFocused)
      ? undefined
      : data.imageFile);
  const [lazyLoadState, setLazyLoadState] = useState<{
    attachmentToLoad: string | undefined;
    failed: boolean;
    resolvedImageUrl: string | null;
  }>(() => ({
    attachmentToLoad,
    failed: false,
    resolvedImageUrl: null,
  }));
  if (lazyLoadState.attachmentToLoad !== attachmentToLoad) {
    setLazyLoadState({
      attachmentToLoad,
      failed: false,
      resolvedImageUrl: null,
    });
  }
  const resolvedImageUrl =
    lazyLoadState.attachmentToLoad === attachmentToLoad
      ? lazyLoadState.resolvedImageUrl
      : null;
  const lazyLoadFailed =
    lazyLoadState.attachmentToLoad === attachmentToLoad
      ? lazyLoadState.failed
      : false;

  useEffect(() => {
    if (!attachmentToLoad) {
      return;
    }
    let cancelled = false;
    (async () => {
      let dataUrl: string | null = null;
      let failed = false;
      try {
        const result = await rpcLoadAttachment(attachmentToLoad);
        dataUrl = result?.dataUrl ?? null;
        failed = dataUrl === null;
      } catch {
        failed = true;
      }
      if (cancelled) {
        return;
      }
      setLazyLoadState((current) =>
        current.attachmentToLoad === attachmentToLoad
          ? { ...current, failed, resolvedImageUrl: dataUrl }
          : current
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentToLoad]);

  const focusedSrc = directImageUrl || resolvedImageUrl || data.thumbnailUrl;
  const previewSrc = data.thumbnailUrl || directImageUrl || resolvedImageUrl;
  const displaySrc = isFocused ? focusedSrc : previewSrc;
  const isLazyLoading =
    !!attachmentToLoad &&
    (isFocused || !displaySrc) &&
    !resolvedImageUrl &&
    !lazyLoadFailed;

  if (!(displaySrc || isLazyLoading)) {
    // The image was expected (it had a source) but failed to resolve — surface
    // a red "missing" treatment mirroring AssetNode rather than the neutral
    // empty state, so a broken/deleted attachment is obvious at a glance.
    if (lazyLoadFailed) {
      return (
        <div className="flex size-full flex-col items-center justify-center gap-3 border border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
          <div className="flex items-center gap-2 font-medium text-sm">
            <AlertTriangle size={isFocused ? 20 : 16} />
            Missing image
          </div>
          <button
            className="nodrag nopan inline-flex items-center gap-1.5 rounded-full border border-red-300/60 bg-white/70 px-3 py-1.5 text-red-700 text-xs shadow-sm transition-colors hover:bg-white dark:border-red-400/30 dark:bg-white/10 dark:text-red-200 dark:hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              setLazyLoadState((current) =>
                current.attachmentToLoad === attachmentToLoad
                  ? { ...current, failed: false }
                  : current
              );
            }}
            type="button"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      );
    }
    return (
      <div
        className={cn(
          'flex size-full flex-col items-center justify-center gap-3',
          isFocused && 'text-zinc-500'
        )}
        style={isFocused ? undefined : colorToStyle(data.color)}
      >
        <ImagePlus
          className={isFocused ? 'text-zinc-600' : 'text-gray-300'}
          size={isFocused ? 64 : 40}
        />
        <span
          className={cn(
            'text-sm',
            isFocused ? 'text-zinc-500' : 'text-gray-400'
          )}
        >
          No image
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex size-full flex-col"
      style={isFocused ? undefined : colorToStyle(data.color)}
    >
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
    </div>
  );
};

// Component split is a broad UI refactor; keep image-node editing behavior intact.
// react-doctor-disable-next-line react-doctor/no-giant-component
const ImageNode = ({ id, data }: { id: string; data: ImageData }) => {
  const commitNodeData = useCanvasStore((s) => s.commitNodeData);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isRenaming = useCanvasStore((s) => s.renamingNodeId === id);
  const setRenamingNodeId = useCanvasStore((s) => s.setRenamingNodeId);
  const { tag, tagColor, tagColors, tags, dimmedByFilter, tagEditor } =
    useNodeTagEditing(id, data as unknown as Record<string, unknown>);
  const isDark = isColorDark(data.color);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renameDraft, setRenameDraft] = useState(data.title ?? '');
  const hasImage = Boolean(
    data.imageUrl || data.imageFile || data.thumbnailFile || data.thumbnailUrl
  );

  useEffect(() => {
    if (!isRenaming) {
      return;
    }
    setRenameDraft(data.title ?? '');
    // Autofocus + select after mount.
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isRenaming, data.title]);

  const commitRename = useCallback(() => {
    const next = renameDraft.trim();
    if (next && next !== data.title) {
      saveSnapshot();
      updateNodeData(id, { title: next });
    }
    setRenamingNodeId(null);
  }, [
    renameDraft,
    data.title,
    saveSnapshot,
    updateNodeData,
    id,
    setRenamingNodeId,
  ]);

  const cancelRename = useCallback(() => {
    setRenamingNodeId(null);
  }, [setRenamingNodeId]);

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
          toast.error(m.toast_image_thumbnail_failed());
        }
      });
      reader.addEventListener('error', () => {
        console.error('[ImageNode] FileReader error:', reader.error);
        toast.error('Failed to read image file');
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
      if (hasImage) {
        setPendingReplaceFile(file);
        return;
      }
      handleFile(file);
    },
    [handleFile, hasImage]
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
      <ResizeHandle
        hoverClassName="group-hover/image:opacity-100"
        maxHeight={900}
        maxWidth={800}
        minHeight={150}
        minWidth={150}
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles />

      <input
        accept="image/*"
        aria-label="Replace image file"
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

      <AssetHoverCard
        enabled={hasImage && Boolean(data.title)}
        rows={
          data.title
            ? [
                { label: 'Name', value: data.title },
                ...(data.imageFile
                  ? [{ label: 'Path', value: data.imageFile }]
                  : []),
              ]
            : []
        }
      >
        <div
          className={cn(
            'node-visual relative size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover'
          )}
        >
          {hasImage ? (
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
                <span className="text-gray-400 text-sm">
                  Click to add image
                </span>
              </button>
              <span className="text-gray-300 text-xs">
                or drag &amp; drop / paste
              </span>
            </div>
          )}
          {hasImage ? (
            <TypeBadge className="absolute top-5 right-5 z-10">Image</TypeBadge>
          ) : null}
          {isRenaming && hasImage ? (
            <div
              className="absolute inset-x-5 bottom-16 z-10"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <input
                aria-label="Rename image"
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-bold text-neutral-900 text-xl shadow-md outline-hidden focus:border-accent dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-50"
                onBlur={commitRename}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                ref={renameInputRef}
                type="text"
                value={renameDraft}
              />
            </div>
          ) : null}
          {tag || (tags && tags.length > 0) ? (
            <div className="pointer-events-none absolute right-3 bottom-3 left-3">
              <NodeTagChips
                isDark={isDark}
                tag={tag}
                tagColor={tagColor}
                tagColors={tagColors}
                tags={tags}
              />
            </div>
          ) : null}
        </div>
      </AssetHoverCard>
    </div>
  );
};

export default memo(ImageNode);
