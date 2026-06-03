import { Handle, Position, useViewport } from '@xyflow/react';
import {
  AlertTriangle,
  ExternalLink,
  FileArchive,
  FileAudio,
  FileQuestion,
  FileText,
  FileVideo,
  Loader2,
  Play,
} from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import type { AssetKind, AssetNodeData } from '@/lib/contentTypes';
import { getAssetDisplayTitle } from '@/lib/contentTypes';
import { rpcLoadAttachment, rpcOpenAttachment } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import { ResizeHandle } from './_shared/ResizeHandle';

const handleClassName = 'conn-handle nodrag';
const DEFAULT_ASSET_COLOR = '#FFFFFF';

export type AssetNodeRuntimeData = Partial<AssetNodeData> & {
  isDropTarget?: boolean;
  isHidden?: boolean;
};

function resolveAssetData(data: AssetNodeRuntimeData): AssetNodeData {
  const kind: AssetKind =
    data.kind === 'video' || data.kind === 'audio' || data.kind === 'file'
      ? data.kind
      : 'file';
  const mimeType =
    typeof data.mimeType === 'string' && data.mimeType
      ? data.mimeType
      : 'application/octet-stream';
  const fileName = typeof data.fileName === 'string' ? data.fileName : '';
  const title = typeof data.title === 'string' ? data.title : fileName;
  return {
    attachmentFile:
      typeof data.attachmentFile === 'string' ? data.attachmentFile : undefined,
    color: typeof data.color === 'string' ? data.color : DEFAULT_ASSET_COLOR,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    fileName,
    kind,
    mimeType,
    missing: data.missing === true,
    previewUrl:
      typeof data.previewUrl === 'string' ? data.previewUrl : undefined,
    size: typeof data.size === 'number' ? data.size : undefined,
    thumbnailFile:
      typeof data.thumbnailFile === 'string' ? data.thumbnailFile : undefined,
    thumbnailUrl:
      typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : undefined,
    title,
    waveform: Array.isArray(data.waveform) ? data.waveform : undefined,
  };
}

export function formatFileSize(size: number | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return 'Unknown size';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDuration(duration: number | undefined): string | null {
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  const totalSeconds = Math.round(duration);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getAssetLabel(asset: AssetNodeData): string {
  if (asset.mimeType === 'application/pdf') {
    return 'PDF';
  }
  if (
    asset.mimeType === 'application/zip' ||
    asset.mimeType === 'application/x-zip-compressed'
  ) {
    return 'Archive';
  }
  if (asset.mimeType.startsWith('text/')) {
    return 'Text';
  }
  if (asset.kind === 'video') {
    return 'Video';
  }
  if (asset.kind === 'audio') {
    return 'Audio';
  }
  return 'File';
}

function AssetIcon({
  asset,
  className,
  size,
}: {
  asset: AssetNodeData;
  className?: string;
  size: number;
}) {
  const props = { className, size };
  if (asset.missing) {
    return <AlertTriangle {...props} />;
  }
  if (asset.kind === 'video') {
    return <FileVideo {...props} />;
  }
  if (asset.kind === 'audio') {
    return <FileAudio {...props} />;
  }
  if (
    asset.mimeType === 'application/zip' ||
    asset.mimeType === 'application/x-zip-compressed'
  ) {
    return <FileArchive {...props} />;
  }
  if (
    asset.mimeType.startsWith('text/') ||
    asset.mimeType === 'application/pdf'
  ) {
    return <FileText {...props} />;
  }
  return <FileQuestion {...props} />;
}

function isPlayableMedia(asset: AssetNodeData): boolean {
  return asset.kind === 'video' || asset.kind === 'audio';
}

function isPdfPreview(asset: AssetNodeData): boolean {
  return asset.kind === 'file' && asset.mimeType === 'application/pdf';
}

function isTextPreview(asset: AssetNodeData): boolean {
  return asset.kind === 'file' && asset.mimeType.startsWith('text/');
}

function decodeTextDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return '';
  }
  const metadata = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  if (metadata.includes(';base64')) {
    if (typeof globalThis.atob !== 'function') {
      return '';
    }
    const binary = globalThis.atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

function VideoThumbnail({
  asset,
  title,
}: {
  asset: AssetNodeData;
  title: string;
}) {
  const duration = formatDuration(asset.duration);
  return (
    <div className="relative mb-4 aspect-video overflow-hidden rounded-2xl border border-black/10 bg-neutral-950/90 text-white shadow-inner dark:border-white/10">
      {asset.thumbnailUrl ? (
        <img
          alt={`${title} thumbnail`}
          className="size-full object-cover"
          src={asset.thumbnailUrl}
        />
      ) : (
        <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_50%_35%,oklch(0.7_0.08_250/.28),transparent_48%),oklch(0.22_0.02_255)]">
          <FileVideo className="opacity-75" size={38} />
        </div>
      )}
      <div className="absolute inset-0 grid place-items-center bg-black/10">
        <div className="grid size-11 place-items-center rounded-full bg-white/90 text-neutral-950 shadow-lg">
          <Play fill="currentColor" size={20} />
        </div>
      </div>
      {duration ? (
        <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-2 py-1 font-medium text-[11px] text-white">
          {duration}
        </span>
      ) : null}
    </div>
  );
}

function AudioThumbnail({ asset }: { asset: AssetNodeData }) {
  const duration = formatDuration(asset.duration);
  const bars = asset.waveform?.length ? asset.waveform.slice(0, 32) : null;
  return (
    <div className="mb-4 rounded-2xl border border-black/10 bg-white/60 p-4 shadow-inner dark:border-white/10 dark:bg-white/8">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-neutral-950 text-neutral-50 dark:bg-neutral-50 dark:text-neutral-950">
          <FileAudio size={23} />
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-1">
          {bars
            ? bars.map((value, index) => (
                <span
                  className="block w-1 flex-1 rounded-full bg-neutral-950/22 dark:bg-neutral-50/24"
                  key={`bar-${index}`}
                  style={{
                    height: Math.max(
                      18,
                      Math.round((0.25 + value * 0.75) * 44)
                    ),
                  }}
                />
              ))
            : Array.from({ length: 24 }, (_, index) => (
                // No real waveform yet — render uniform placeholder bars
                // instead of pseudo-random heights to avoid faking data.
                <span
                  className="block h-5 w-1 flex-1 rounded-full bg-neutral-950/15 dark:bg-neutral-50/18"
                  key={`bar-placeholder-${index}`}
                />
              ))}
        </div>
      </div>
      {duration ? (
        <p className="mt-3 text-right font-medium text-neutral-500 text-xs dark:text-neutral-400">
          {duration}
        </p>
      ) : null}
    </div>
  );
}

function AssetThumbnail({
  asset,
  title,
}: {
  asset: AssetNodeData;
  title: string;
}) {
  if (asset.kind === 'video') {
    return <VideoThumbnail asset={asset} title={title} />;
  }
  if (asset.kind === 'audio') {
    return <AudioThumbnail asset={asset} />;
  }
  return null;
}

function MetadataGrid({ asset }: { asset: AssetNodeData }) {
  const duration = formatDuration(asset.duration);
  return (
    <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
      <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
        <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
          Type
        </p>
        <p className="mt-1 break-words text-neutral-800 dark:text-neutral-100">
          {asset.mimeType}
        </p>
      </div>
      <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
        <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
          Size
        </p>
        <p className="mt-1 text-neutral-800 dark:text-neutral-100">
          {formatFileSize(asset.size)}
        </p>
      </div>
      {duration ? (
        <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
            Duration
          </p>
          <p className="mt-1 text-neutral-800 dark:text-neutral-100">
            {duration}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          'rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20',
          duration ? '' : 'col-span-2'
        )}
      >
        <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
          File
        </p>
        <p className="mt-1 break-all font-mono text-neutral-700 text-sm dark:text-neutral-200">
          {asset.fileName || 'Untitled file'}
        </p>
      </div>
    </div>
  );
}

function getMediaLoadState({
  asset,
  mediaError,
  mediaLoading,
}: {
  asset: AssetNodeData;
  mediaError: string | null;
  mediaLoading: boolean;
}) {
  if (asset.missing) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
        <div className="flex items-center gap-2 font-medium text-sm">
          <AlertTriangle size={16} />
          Missing attachment
        </div>
      </div>
    );
  }
  if (mediaLoading) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-black/10 bg-neutral-50 text-neutral-500 dark:border-white/10 dark:bg-black/20 dark:text-neutral-300">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Loader2 className="animate-spin" size={16} />
          Loading media
        </div>
      </div>
    );
  }
  if (mediaError) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
        <div className="flex items-center gap-2 font-medium text-sm">
          <AlertTriangle size={16} />
          {mediaError}
        </div>
      </div>
    );
  }
  return null;
}

export const AssetContent = ({
  data,
  isFocused = false,
}: {
  data: AssetNodeRuntimeData;
  isFocused?: boolean;
}) => {
  const asset = resolveAssetData(data);
  const title = getAssetDisplayTitle(asset);
  const label = getAssetLabel(asset);
  const canOpen = Boolean(asset.attachmentFile && !asset.missing);
  const playableMedia = isPlayableMedia(asset);
  const pdfPreview = isPdfPreview(asset);
  const textPreview = isTextPreview(asset);
  const previewableFile = pdfPreview || textPreview;
  const attachmentLabel = asset.attachmentFile ?? 'Unsaved attachment';
  const [mediaSrc, setMediaSrc] = useState<string | null>(
    asset.previewUrl ?? null
  );
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    if (!asset.attachmentFile) {
      toast.error(m.toast_asset_file_unsaved());
      return;
    }
    const result = await rpcOpenAttachment(asset.attachmentFile);
    if (!result.success) {
      toast.error(m.toast_asset_file_open_failed());
    }
  }, [asset.attachmentFile]);

  useEffect(() => {
    if (
      !(
        isFocused &&
        (playableMedia || previewableFile) &&
        asset.attachmentFile &&
        !asset.missing
      )
    ) {
      return;
    }
    if (asset.previewUrl) {
      setMediaSrc(asset.previewUrl);
      setMediaError(null);
      return;
    }

    let cancelled = false;
    setMediaLoading(true);
    setMediaError(null);
    rpcLoadAttachment(asset.attachmentFile)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result?.dataUrl) {
          setMediaSrc(null);
          setMediaError('Media file could not be loaded.');
          return;
        }
        setMediaSrc(result.dataUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setMediaSrc(null);
          setMediaError('Media file could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMediaLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    asset.attachmentFile,
    asset.missing,
    asset.previewUrl,
    isFocused,
    playableMedia,
    previewableFile,
  ]);

  if (isFocused) {
    const mediaState = getMediaLoadState({
      asset,
      mediaError,
      mediaLoading,
    });

    return (
      <div
        className="flex size-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
        style={colorToStyle(asset.color)}
      >
        <div className="flex min-h-0 flex-1 flex-col px-10 pt-10 pb-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
                <AssetIcon asset={asset} size={23} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-500 text-sm dark:text-neutral-400">
                  {label}
                </p>
                <p
                  className="truncate text-neutral-400 text-xs dark:text-neutral-500"
                  title={attachmentLabel}
                >
                  {attachmentLabel}
                </p>
              </div>
            </div>
            <button
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 font-semibold text-neutral-50 text-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
              disabled={!canOpen}
              onClick={handleOpen}
              type="button"
            >
              Open file
              <ExternalLink size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 rounded-2xl border border-black/10 bg-white/65 p-8 shadow-sm dark:border-white/10 dark:bg-white/8">
            <div className="max-w-3xl">
              {asset.missing ? (
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 font-medium text-red-700 text-xs dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
                  <AlertTriangle size={13} />
                  Missing attachment
                </div>
              ) : null}
              <h1 className="text-balance font-bold text-4xl leading-tight tracking-normal">
                {title}
              </h1>
              {pdfPreview && !asset.missing ? (
                <div className="mt-8">
                  {mediaState ??
                    (mediaSrc ? (
                      <iframe
                        className="h-[52vh] min-h-96 w-full rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/10"
                        src={mediaSrc}
                        title={`${title} PDF preview`}
                      />
                    ) : null)}
                </div>
              ) : null}
              {textPreview && !asset.missing ? (
                <div className="mt-8">
                  {mediaState ??
                    (mediaSrc ? (
                      <pre className="max-h-[52vh] min-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-black/10 bg-neutral-50 p-5 font-mono text-neutral-700 text-sm leading-relaxed shadow-inner dark:border-white/10 dark:bg-black/20 dark:text-neutral-200">
                        {decodeTextDataUrl(mediaSrc)}
                      </pre>
                    ) : null)}
                </div>
              ) : null}
              {asset.kind === 'video' ? (
                <div className="mt-8">
                  {mediaState ??
                    (mediaSrc ? (
                      // biome-ignore lint/a11y/useMediaCaption: User attachments do not include caption-track metadata yet.
                      <video
                        aria-label={`${title} video player`}
                        className="aspect-video w-full rounded-2xl bg-neutral-950 shadow-sm"
                        controls
                        poster={asset.thumbnailUrl}
                        preload="metadata"
                        src={mediaSrc}
                      />
                    ) : null)}
                </div>
              ) : null}
              {asset.kind === 'audio' ? (
                <div className="mt-8 rounded-2xl border border-black/10 bg-neutral-50 p-5 dark:border-white/10 dark:bg-black/20">
                  {mediaState ??
                    (mediaSrc ? (
                      // biome-ignore lint/a11y/useMediaCaption: User attachments do not include caption-track metadata yet.
                      <audio
                        aria-label={`${title} audio player`}
                        className="w-full"
                        controls
                        preload="metadata"
                        src={mediaSrc}
                      />
                    ) : null)}
                </div>
              ) : null}
              <MetadataGrid asset={asset} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex size-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
      style={colorToStyle(asset.color)}
    >
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
            <AssetIcon asset={asset} size={19} />
          </div>
          <span
            className={cn(
              'rounded-full border px-2 py-1 font-semibold text-[11px] uppercase tracking-normal',
              asset.missing
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'
                : 'border-black/10 bg-white/60 text-neutral-500 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300'
            )}
          >
            {asset.missing ? 'Missing' : label}
          </span>
        </div>
        <AssetThumbnail asset={asset} title={title} />
        <h3 className="line-clamp-3 font-bold text-xl leading-tight">
          {title}
        </h3>
        <div className="mt-auto min-w-0 pt-4">
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-black/8 bg-white/55 px-3 py-2 text-neutral-500 dark:border-white/10 dark:bg-white/8 dark:text-neutral-300">
            <span className="truncate text-xs">{asset.mimeType}</span>
            <span className="shrink-0 text-xs">
              {formatFileSize(asset.size)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const AssetNode = ({
  id,
  data,
}: {
  id: string;
  data: AssetNodeRuntimeData;
}) => {
  const { zoom } = useViewport();
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const { tag, tagColor, tags, dimmedByFilter, tagEditor } = useNodeTagEditing(
    id,
    data as unknown as Record<string, unknown>
  );
  const isZoomedOut = zoom < 0.4;
  const asset = resolveAssetData(data);
  const isDark = isColorDark(asset.color);

  return (
    <div
      className={cn(
        'group/asset size-full transition-opacity',
        data.isHidden
          ? 'pointer-events-none opacity-0'
          : dimmedByFilter
            ? 'opacity-30'
            : 'opacity-100'
      )}
    >
      {tagEditor}
      <ResizeHandle
        hoverClassName="group-hover/asset:opacity-100"
        maxHeight={520}
        maxWidth={680}
        minHeight={170}
        minWidth={240}
        onResizeStart={saveSnapshot}
      />

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

      <div className="node-visual relative size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
        {isZoomedOut ? (
          <div
            className="flex size-full flex-col justify-center p-5"
            style={colorToStyle(asset.color)}
          >
            <AssetIcon asset={asset} className="mb-4 opacity-70" size={30} />
            <h3 className="line-clamp-2 font-bold text-2xl/tight">
              {getAssetDisplayTitle(asset)}
            </h3>
            <div className="mt-5 h-3 w-3/4 rounded-full bg-current opacity-20" />
          </div>
        ) : (
          <AssetContent data={data} />
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

export default memo(AssetNode);
