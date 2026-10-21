import {
  AlertTriangle,
  ExternalLink,
  FileArchive,
  FileAudio,
  FileQuestion,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Play,
} from 'lucide-react';
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import type {
  ArchiveSummary,
  AssetKind,
  AssetNodeData,
} from '@/lib/contentTypes';
import { getAssetDisplayTitle } from '@/lib/contentTypes';
import { EMPTY_CAPTIONS_TRACK_SRC } from '@/lib/mediaCaptions';
import {
  resolveAttachmentStreamUrl,
  rpcLoadAttachment,
  rpcOpenAttachment,
} from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../../paraglide/messages.js';
import { AssetHoverCard } from './_shared/AssetHoverCard';
import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';
import { TypeBadge } from './_shared/TypeBadge';
import { formatDuration, formatFileSize } from './assetNodeFormat';

const DEFAULT_ASSET_COLOR = '#FFFFFF';

interface MediaState {
  error: string | null;
  loading: boolean;
  src: string | null;
}

type MediaAction =
  | { message: string; type: 'failed' }
  | { src: string | null; type: 'loaded' }
  | { type: 'loading' }
  | { src: string | null; type: 'ready' }
  | { type: 'settled' };

function mediaReducer(state: MediaState, action: MediaAction): MediaState {
  switch (action.type) {
    case 'failed':
      return { error: action.message, loading: false, src: null };
    case 'loaded':
      return { ...state, loading: false, src: action.src };
    case 'loading':
      return { ...state, error: null, loading: true };
    case 'ready':
      return { error: null, loading: false, src: action.src };
    case 'settled':
      return { ...state, loading: false };
  }
}

export type AssetNodeRuntimeData = Partial<AssetNodeData> & {
  isDropTarget?: boolean;
  isHidden?: boolean;
};

function resolveArchiveSummary(value: unknown): ArchiveSummary | undefined {
  if (!value || typeof value !== 'object') {
    return;
  }
  const candidate = value as Partial<ArchiveSummary>;
  if (typeof candidate.entryCount !== 'number') {
    return;
  }
  if (!Array.isArray(candidate.topFiles)) {
    return;
  }
  const topFiles = candidate.topFiles.filter(
    (entry): entry is string => typeof entry === 'string'
  );
  return { entryCount: candidate.entryCount, topFiles };
}

export function resolveAssetData(data: AssetNodeRuntimeData): AssetNodeData {
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
    archiveSummary: resolveArchiveSummary(data.archiveSummary),
    attachmentFile:
      typeof data.attachmentFile === 'string' ? data.attachmentFile : undefined,
    color: typeof data.color === 'string' ? data.color : DEFAULT_ASSET_COLOR,
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    fileName,
    kind,
    mimeType,
    missing: data.missing === true,
    previewExcerpt:
      typeof data.previewExcerpt === 'string' ? data.previewExcerpt : undefined,
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

// Builds the metadata rows shown in the canvas hover panel. Surfacing this
// info on hover lets the card face stay minimal (badge + thumbnail + title).
export function buildAssetHoverRows(asset: AssetNodeData): {
  label: string;
  value: string;
}[] {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: 'Type', value: getAssetLabel(asset) });
  if (asset.fileName) {
    rows.push({ label: 'File', value: asset.fileName });
  }
  if (typeof asset.size === 'number') {
    rows.push({ label: 'Size', value: formatFileSize(asset.size) });
  }
  const duration = formatDuration(asset.duration);
  if (duration) {
    rows.push({ label: 'Duration', value: duration });
  }
  if (asset.archiveSummary) {
    rows.push({
      label: 'Entries',
      value: `${asset.archiveSummary.entryCount} items`,
    });
  }
  if (asset.attachmentFile) {
    rows.push({ label: 'Path', value: asset.attachmentFile });
  }
  return rows;
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
  if (asset.missing) {
    return <AlertTriangle className={className} size={size} />;
  }
  if (asset.kind === 'video') {
    return <FileVideo className={className} size={size} />;
  }
  if (asset.kind === 'audio') {
    return <FileAudio className={className} size={size} />;
  }
  if (
    asset.mimeType === 'application/zip' ||
    asset.mimeType === 'application/x-zip-compressed'
  ) {
    return <FileArchive className={className} size={size} />;
  }
  if (
    asset.mimeType.startsWith('text/') ||
    asset.mimeType === 'application/pdf'
  ) {
    return <FileText className={className} size={size} />;
  }
  return <FileQuestion className={className} size={size} />;
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

/**
 * WebKit's PDF viewer can render a corrupt data URL as a blank iframe without
 * firing an error event. Check the small file signature before mounting that
 * iframe so damaged local PDFs get the same actionable error surface as
 * missing files. Non-data URLs are left to the browser's native viewer.
 */
function isLikelyPdfDataUrl(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:')) {
    return true;
  }
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) {
    return false;
  }
  const metadata = dataUrl.slice(0, commaIndex).toLowerCase();
  const payload = dataUrl.slice(commaIndex + 1);
  try {
    if (metadata.includes(';base64')) {
      if (typeof globalThis.atob !== 'function') {
        return true;
      }
      // The PDF magic bytes are in the first four base64 quartets. Decode a
      // bounded prefix rather than duplicating a potentially large document.
      const prefix = payload.slice(0, 64);
      const padded = prefix.padEnd(
        prefix.length + ((4 - (prefix.length % 4)) % 4),
        '='
      );
      return globalThis.atob(padded).includes('%PDF-');
    }
    return decodeURIComponent(payload.slice(0, 1024)).includes('%PDF-');
  } catch {
    return false;
  }
}

function useResolvedAttachmentPreview(
  previewUrl: string | undefined,
  attachmentFile: string | undefined
): string | undefined {
  const [previewState, setPreviewState] = useState(() => ({
    attachmentFile,
    previewUrl,
    resolvedUrl: previewUrl,
  }));

  if (
    previewState.previewUrl !== previewUrl ||
    previewState.attachmentFile !== attachmentFile
  ) {
    setPreviewState({
      attachmentFile,
      previewUrl,
      resolvedUrl: previewUrl,
    });
  }

  const resolvedUrl =
    previewState.previewUrl === previewUrl &&
    previewState.attachmentFile === attachmentFile
      ? previewState.resolvedUrl
      : previewUrl;

  useEffect(() => {
    if (previewUrl || !attachmentFile) {
      return;
    }
    let cancelled = false;
    resolveAttachmentStreamUrl(attachmentFile)
      .then((url) => {
        if (!cancelled && url) {
          setPreviewState((current) =>
            current.previewUrl === previewUrl &&
            current.attachmentFile === attachmentFile
              ? { ...current, resolvedUrl: url }
              : current
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attachmentFile, previewUrl]);

  return resolvedUrl;
}

function VideoThumbnail({
  asset,
  title,
}: {
  asset: AssetNodeData;
  title: string;
}) {
  const duration = formatDuration(asset.duration);
  const thumbSrc = useResolvedAttachmentPreview(
    asset.thumbnailUrl,
    asset.thumbnailFile
  );
  return (
    <div className="relative size-full overflow-hidden bg-neutral-950/90 text-white">
      {thumbSrc ? (
        <img
          alt={`${title} thumbnail`}
          className="size-full object-cover"
          src={thumbSrc}
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
        <span className="absolute right-2 bottom-2 rounded-md bg-black/70 px-2 py-1 font-medium text-2xs text-white">
          {duration}
        </span>
      ) : null}
    </div>
  );
}

function AudioThumbnail({ asset }: { asset: AssetNodeData }) {
  const duration = formatDuration(asset.duration);
  const bars = asset.waveform?.length
    ? asset.waveform.slice(0, 32).map((value, index) => ({
        id: `audio-waveform-${index}`,
        value,
      }))
    : null;
  const placeholderBars = Array.from({ length: 24 }, (_, index) => ({
    id: `audio-placeholder-${index}`,
  }));
  return (
    <div className="mb-4 min-h-0 overflow-hidden rounded-2xl border border-black/10 bg-white/60 p-4 shadow-inner dark:border-white/10 dark:bg-white/8">
      <div className="flex items-center gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-neutral-950 text-neutral-50 dark:bg-neutral-50 dark:text-neutral-950">
          <FileAudio size={23} />
        </div>
        <div className="flex min-w-0 flex-1 items-end gap-1">
          {bars
            ? bars.map(({ id, value }) => (
                <span
                  className="block w-1 flex-1 rounded-full bg-neutral-950/22 dark:bg-neutral-50/24"
                  key={id}
                  style={{
                    height: Math.max(
                      18,
                      Math.round((0.25 + value * 0.75) * 44)
                    ),
                  }}
                />
              ))
            : placeholderBars.map(({ id }) => (
                // No real waveform yet — render uniform placeholder bars
                // instead of pseudo-random heights to avoid faking data.
                <span
                  className="block h-5 w-1 flex-1 rounded-full bg-neutral-950/15 dark:bg-neutral-50/18"
                  key={id}
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

function isImageAsFile(asset: AssetNodeData): boolean {
  // The renderer's createImageThumbnail flow tags `kind: 'file'` for any
  // non-video/audio MIME. When that file is actually an image, hydrate it as
  // an inline preview rather than the generic file card.
  return asset.kind === 'file' && asset.mimeType.startsWith('image/');
}

function isPdfAsFile(asset: AssetNodeData): boolean {
  return asset.kind === 'file' && asset.mimeType === 'application/pdf';
}

function isArchiveAsFile(asset: AssetNodeData): boolean {
  return (
    asset.kind === 'file' &&
    (asset.mimeType === 'application/zip' ||
      asset.mimeType === 'application/x-zip-compressed' ||
      asset.mimeType.endsWith('+zip'))
  );
}

function isTextAsFile(asset: AssetNodeData): boolean {
  if (asset.kind !== 'file') {
    return false;
  }
  if (asset.mimeType.startsWith('text/')) {
    return true;
  }
  return (
    asset.mimeType === 'application/json' ||
    asset.mimeType === 'application/ld+json' ||
    asset.mimeType === 'application/xml'
  );
}

function ImageAsFileThumbnail({
  asset,
  title,
}: {
  asset: AssetNodeData;
  title: string;
}) {
  const thumbSrc = useResolvedAttachmentPreview(
    asset.thumbnailUrl,
    asset.thumbnailFile
  );
  return (
    <div className="relative size-full overflow-hidden bg-neutral-100 dark:bg-black/30">
      {thumbSrc ? (
        <img
          alt={`${title} thumbnail`}
          className="size-full object-cover"
          src={thumbSrc}
        />
      ) : (
        <div className="grid size-full place-items-center bg-[radial-gradient(circle_at_50%_35%,oklch(0.85_0.04_220/.4),transparent_55%),oklch(0.96_0.01_220)] text-neutral-500 dark:bg-[radial-gradient(circle_at_50%_35%,oklch(0.55_0.07_220/.45),transparent_55%),oklch(0.22_0.02_240)] dark:text-neutral-300">
          <ImageIcon className="opacity-70" size={36} strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

const FILE_EXTENSION_RE = /\.([a-z0-9]{1,8})$/i;

function getFileExtension(fileName: string): string | null {
  const match = FILE_EXTENSION_RE.exec(fileName);
  return match?.[1] ? match[1].toUpperCase() : null;
}

const PAGE_CORNER = 14;
const PAGE_CLIP = `polygon(0 0, calc(100% - ${PAGE_CORNER}px) 0, 100% ${PAGE_CORNER}px, 100% 100%, 0 100%)`;
const PAGE_FOLD_CLIP = 'polygon(0 0, 100% 100%, 0 100%)';

/**
 * Miniature paper-page glyph with a folded corner, skeleton text lines, and
 * an optional file-type badge. Shared by the PDF and generic file thumbnails
 * so file cards read as documents at a glance.
 */
function FilePageGlyph({
  badge,
  badgeClassName,
}: {
  badge: string | null;
  badgeClassName?: string;
}) {
  return (
    <div className="relative">
      <div style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.16))' }}>
        <div
          className="relative h-20 w-16 rounded-md bg-white"
          style={{ clipPath: PAGE_CLIP }}
        >
          <div
            className="absolute top-0 right-0"
            style={{
              width: PAGE_CORNER,
              height: PAGE_CORNER,
              clipPath: PAGE_FOLD_CLIP,
              background:
                'linear-gradient(to bottom left, #f4f4f5, #d4d4d8 55%, #bdbdc2)',
            }}
          />
          <div className="absolute inset-x-3 top-6 space-y-[5px]">
            <div className="h-[3px] rounded-full bg-neutral-200" />
            <div className="h-[3px] rounded-full bg-neutral-200" />
            <div className="h-[3px] w-3/4 rounded-full bg-neutral-200" />
            <div className="h-[3px] w-1/2 rounded-full bg-neutral-200" />
          </div>
        </div>
      </div>
      {badge ? (
        <span
          className={cn(
            'absolute bottom-3 -left-2.5 rounded px-1.5 py-0.5 font-bold text-[9px] text-white uppercase tracking-wide shadow-sm',
            badgeClassName ?? 'bg-neutral-600 dark:bg-neutral-500'
          )}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function PdfThumbnail({ asset }: { asset: AssetNodeData }) {
  // No bun-side raster preview yet (see Phase 2 roadmap). Show a paper-page
  // glyph that still differentiates a PDF from generic file cards on the
  // canvas while keeping the dependency footprint zero.
  return (
    <div className="relative size-full overflow-hidden bg-gradient-to-b from-rose-50/80 to-rose-100/70 dark:from-rose-950/30 dark:to-rose-950/50">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <FilePageGlyph badge="PDF" badgeClassName="bg-rose-600" />
        <span className="font-semibold text-3xs text-rose-700/90 uppercase tracking-wide dark:text-rose-300">
          {asset.mimeType === 'application/pdf' ? 'PDF document' : 'Document'}
        </span>
      </div>
    </div>
  );
}

function GenericFileThumbnail({ asset }: { asset: AssetNodeData }) {
  return (
    <div className="relative size-full overflow-hidden bg-gradient-to-b from-neutral-100 to-neutral-200/80 dark:from-neutral-800/80 dark:to-neutral-900">
      <div className="absolute inset-0 grid place-items-center">
        <FilePageGlyph badge={getFileExtension(asset.fileName)} />
      </div>
    </div>
  );
}

function TextThumbnail({ asset }: { asset: AssetNodeData }) {
  // The bun-side excerpt is already trimmed and whitespace-normalized; the
  // gradient mask hides the truncation seam without needing a CSS truncate
  // that would lose newlines.
  const excerpt = asset.previewExcerpt?.trim() ?? '';
  const hasExcerpt = excerpt.length > 0;
  return (
    <div className="relative size-full overflow-hidden bg-neutral-50 p-4 dark:bg-black/20">
      {hasExcerpt ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-2xs text-neutral-700 leading-relaxed dark:text-neutral-200">
          {excerpt}
        </pre>
      ) : (
        <div className="flex items-center gap-2 text-neutral-500 text-xs dark:text-neutral-400">
          <FileText size={14} />
          <span>{asset.mimeType || 'Text document'}</span>
        </div>
      )}
      {hasExcerpt ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-neutral-50 to-transparent dark:from-black/40"
        />
      ) : null}
    </div>
  );
}

function ArchiveThumbnail({ asset }: { asset: AssetNodeData }) {
  const summary = asset.archiveSummary;
  const entryCount = summary?.entryCount ?? 0;
  const topFiles = summary?.topFiles ?? [];
  const hiddenCount = Math.max(0, entryCount - topFiles.length);
  const countLabel = entryCount > 0 ? `${entryCount} items` : 'Archive';

  return (
    <div className="size-full overflow-auto bg-amber-50/60 p-4 dark:bg-amber-400/10">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <FileArchive size={15} />
          <span className="font-semibold text-2xs uppercase tracking-wide">
            {countLabel}
          </span>
        </div>
      </div>
      {topFiles.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {topFiles.map((name) => (
            <li
              className="truncate rounded-md bg-white/70 px-2 py-1 font-mono text-2xs text-neutral-700 dark:bg-black/30 dark:text-neutral-200"
              key={name}
              title={name}
            >
              {name}
            </li>
          ))}
          {hiddenCount > 0 ? (
            <li className="px-2 text-2xs text-neutral-500 dark:text-neutral-400">
              +{hiddenCount} more
            </li>
          ) : null}
        </ul>
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
  if (asset.missing) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-200">
        <AlertTriangle size={28} />
        <span className="font-medium text-sm">{m.asset_missing_file()}</span>
      </div>
    );
  }
  if (asset.kind === 'video') {
    return <VideoThumbnail asset={asset} title={title} />;
  }
  if (asset.kind === 'audio') {
    return (
      <div className="flex size-full items-center justify-center p-5">
        <div className="w-full">
          <AudioThumbnail asset={asset} />
        </div>
      </div>
    );
  }
  if (isImageAsFile(asset)) {
    return <ImageAsFileThumbnail asset={asset} title={title} />;
  }
  if (isPdfAsFile(asset)) {
    return <PdfThumbnail asset={asset} />;
  }
  if (isArchiveAsFile(asset)) {
    return <ArchiveThumbnail asset={asset} />;
  }
  if (isTextAsFile(asset)) {
    return <TextThumbnail asset={asset} />;
  }
  return <GenericFileThumbnail asset={asset} />;
}

function MetadataGrid({ asset }: { asset: AssetNodeData }) {
  const duration = formatDuration(asset.duration);
  return (
    <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
      <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
        <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
          {m.asset_meta_type()}
        </p>
        <p className="mt-1 break-words text-neutral-800 dark:text-neutral-100">
          {asset.mimeType}
        </p>
      </div>
      <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
        <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
          {m.asset_meta_size()}
        </p>
        <p className="mt-1 text-neutral-800 dark:text-neutral-100">
          {formatFileSize(asset.size)}
        </p>
      </div>
      {duration ? (
        <div className="rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
            {m.asset_meta_duration()}
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
          {m.asset_meta_file()}
        </p>
        <p className="mt-1 break-all font-mono text-neutral-700 text-sm dark:text-neutral-200">
          {asset.fileName || m.asset_untitled_file()}
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
          {m.asset_missing_attachment()}
        </div>
      </div>
    );
  }
  if (mediaLoading) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-black/10 bg-neutral-50 text-neutral-500 dark:border-white/10 dark:bg-black/20 dark:text-neutral-300">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Loader2 className="animate-spin" size={16} />
          {m.asset_loading_media()}
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

// Component split is a broad UI refactor; keep asset rendering behavior intact.
// react-doctor-disable-next-line react-doctor/no-giant-component
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
  const imagePreview = isImageAsFile(asset);
  const previewableFile = pdfPreview || textPreview;
  const attachmentLabel = asset.attachmentFile ?? 'Unsaved attachment';
  const [mediaState, dispatchMedia] = useReducer(mediaReducer, {
    error: null,
    loading: false,
    src: asset.previewUrl ?? null,
  });

  const handleOpen = useCallback(async () => {
    if (!asset.attachmentFile) {
      toast.error(m.toast_asset_file_unsaved());
      return;
    }
    try {
      const result = await rpcOpenAttachment(asset.attachmentFile);
      if (!result.success) {
        toast.error(m.toast_asset_file_open_failed());
      }
    } catch (error) {
      console.error('[AssetNode] Failed to open attachment:', error);
      toast.error(m.toast_asset_file_open_failed());
    }
  }, [asset.attachmentFile]);

  useEffect(() => {
    if (
      !(
        isFocused &&
        (playableMedia || previewableFile || imagePreview) &&
        asset.attachmentFile &&
        !asset.missing
      )
    ) {
      return;
    }
    if (asset.previewUrl) {
      if (pdfPreview && !isLikelyPdfDataUrl(asset.previewUrl)) {
        dispatchMedia({
          message: m.asset_media_load_failed(),
          type: 'failed',
        });
        return;
      }
      dispatchMedia({ src: asset.previewUrl, type: 'ready' });
      return;
    }

    // If a thumbnail is already available, show it immediately and load
    // the full file in the background — no loading spinner needed.
    if (imagePreview && asset.thumbnailUrl) {
      dispatchMedia({ src: asset.thumbnailUrl, type: 'ready' });

      let cancelled = false;
      rpcLoadAttachment(asset.attachmentFile)
        .then((result) => {
          if (cancelled || !result?.dataUrl) {
            return;
          }
          dispatchMedia({ src: result.dataUrl, type: 'loaded' });
        })
        .catch(() => {
          // Keep the thumbnail visible when the full attachment cannot load.
        });

      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    dispatchMedia({ type: 'loading' });

    const loadPlayableMedia = async () => {
      if (playableMedia) {
        const streamUrl = await resolveAttachmentStreamUrl(
          asset.attachmentFile!
        );
        if (streamUrl) {
          return streamUrl;
        }
      }
      const result = await rpcLoadAttachment(asset.attachmentFile!);
      return result?.dataUrl ?? null;
    };

    loadPlayableMedia()
      .then((src) => {
        if (cancelled) {
          return;
        }
        if (!src) {
          if (!asset.thumbnailUrl) {
            dispatchMedia({
              message: m.asset_media_load_failed(),
              type: 'failed',
            });
          }
          return;
        }
        if (pdfPreview && !isLikelyPdfDataUrl(src)) {
          dispatchMedia({
            message: m.asset_media_load_failed(),
            type: 'failed',
          });
          return;
        }
        dispatchMedia({ src, type: 'loaded' });
      })
      .catch(() => {
        if (!(cancelled || asset.thumbnailUrl)) {
          dispatchMedia({
            message: m.asset_media_load_failed(),
            type: 'failed',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          dispatchMedia({ type: 'settled' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    asset.attachmentFile,
    asset.missing,
    asset.previewUrl,
    asset.thumbnailUrl,
    imagePreview,
    isFocused,
    playableMedia,
    previewableFile,
    pdfPreview,
  ]);

  if (isFocused) {
    const mediaLoadState = getMediaLoadState({
      asset,
      mediaError: mediaState.error,
      mediaLoading: mediaState.loading,
    });
    const duration = formatDuration(asset.duration);
    const mediaSrc = mediaState.src;
    const imageSrc = mediaSrc ?? asset.thumbnailUrl ?? null;

    // Every preview branch is absolutely positioned against the relative
    // flex-1 wrapper below: percentage heights inside flex items are
    // unreliable in WebKit, so `size-full` here would let tall content
    // (e.g. image previews) overflow the window.
    let preview: ReactNode = null;
    if (mediaLoadState) {
      preview = (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="w-full max-w-md">{mediaLoadState}</div>
        </div>
      );
    } else if (pdfPreview && mediaSrc) {
      preview = (
        <iframe
          className="absolute inset-0 size-full"
          sandbox="allow-same-origin"
          src={mediaSrc}
          title={`${title} PDF preview`}
        />
      );
    } else if (textPreview && mediaSrc) {
      preview = (
        <div className="absolute inset-0 overflow-y-auto px-8 py-10">
          <pre className="mx-auto w-full max-w-3xl whitespace-pre-wrap font-mono text-neutral-700 text-sm leading-relaxed dark:text-neutral-200">
            {decodeTextDataUrl(mediaSrc)}
          </pre>
        </div>
      );
    } else if (asset.kind === 'video' && mediaSrc) {
      preview = (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 p-6">
          <video
            aria-label={`${title} video player`}
            className="max-h-full max-w-full rounded-xl"
            controls
            poster={asset.thumbnailUrl}
            preload="metadata"
            src={mediaSrc}
          >
            <track
              kind="captions"
              label="Captions unavailable"
              src={EMPTY_CAPTIONS_TRACK_SRC}
              srcLang="en"
            />
          </video>
        </div>
      );
    } else if (asset.kind === 'audio' && mediaSrc) {
      preview = (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="w-full max-w-xl">
            <AudioThumbnail asset={asset} />
            <audio
              aria-label={`${title} audio player`}
              className="w-full"
              controls
              preload="metadata"
              src={mediaSrc}
            >
              <track
                kind="captions"
                label="Captions unavailable"
                src={EMPTY_CAPTIONS_TRACK_SRC}
                srcLang="en"
              />
            </audio>
          </div>
        </div>
      );
    } else if (imagePreview && imageSrc) {
      preview = (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <img
            alt={`${title} preview`}
            className="max-h-full max-w-full rounded-xl object-contain shadow-sm"
            draggable={false}
            src={imageSrc}
          />
        </div>
      );
    } else {
      preview = (
        <div className="absolute inset-0 overflow-y-auto p-8">
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center py-8">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
              <AssetIcon asset={asset} size={30} />
            </div>
            <h2 className="text-balance text-center font-bold text-2xl leading-tight">
              {title}
            </h2>
            <MetadataGrid asset={asset} />
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex size-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
        style={colorToStyle(asset.color)}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-black/8 border-b px-6 py-4 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
              <AssetIcon asset={asset} size={21} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-semibold text-lg leading-tight">
                {title}
              </h1>
              <p className="flex min-w-0 items-center gap-1.5 text-neutral-500 text-xs dark:text-neutral-400">
                <span className="shrink-0">{label}</span>
                {asset.size ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">
                      {formatFileSize(asset.size)}
                    </span>
                  </>
                ) : null}
                {duration ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0">{duration}</span>
                  </>
                ) : null}
                <span aria-hidden="true">·</span>
                <span className="truncate" title={attachmentLabel}>
                  {attachmentLabel}
                </span>
              </p>
            </div>
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 font-semibold text-neutral-50 text-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
            disabled={!canOpen}
            onClick={handleOpen}
            type="button"
          >
            {m.asset_open_file()}
            <ExternalLink size={16} />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">{preview}</div>
      </div>
    );
  }

  return (
    <div
      className="relative size-full bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
      style={colorToStyle(asset.color)}
    >
      <TypeBadge
        className="absolute top-5 right-5 z-10"
        missing={asset.missing}
      >
        {asset.missing ? 'Missing' : label}
      </TypeBadge>
      <AssetThumbnail asset={asset} title={title} />
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
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const isRenaming = useCanvasStore((s) => s.renamingNodeId === id);
  const setRenamingNodeId = useCanvasStore((s) => s.setRenamingNodeId);
  const { tag, tagColor, tagColors, tags, dimmedByFilter, tagEditor } =
    useNodeTagEditing(id, data as unknown as Record<string, unknown>);
  const asset = resolveAssetData(data);
  const isDark = isColorDark(asset.color);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameSource = asset.title || asset.fileName;
  const [renameState, setRenameState] = useState(() => ({
    draft: renameSource,
    isRenaming,
    source: renameSource,
  }));
  if (
    isRenaming &&
    (renameState.source !== renameSource || !renameState.isRenaming)
  ) {
    setRenameState({ draft: renameSource, isRenaming, source: renameSource });
  } else if (!(isRenaming || renameState.isRenaming === isRenaming)) {
    setRenameState((current) => ({ ...current, isRenaming }));
  }
  const renameDraft = isRenaming ? renameState.draft : renameSource;

  useEffect(() => {
    if (!isRenaming) {
      return;
    }
    // Autofocus + select after mount.
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isRenaming]);

  const commitRename = useCallback(() => {
    const next = renameDraft.trim();
    if (next && next !== asset.title) {
      saveSnapshot();
      updateNodeData(id, { title: next });
    }
    setRenamingNodeId(null);
  }, [
    renameDraft,
    asset.title,
    saveSnapshot,
    updateNodeData,
    id,
    setRenamingNodeId,
  ]);

  const cancelRename = useCallback(() => {
    setRenamingNodeId(null);
  }, [setRenamingNodeId]);

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
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles />

      <AssetHoverCard
        enabled={!asset.missing}
        rows={buildAssetHoverRows(asset)}
      >
        <div className="node-visual relative size-full cursor-pointer overflow-hidden rounded-3xl shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
          <AssetContent data={data} />
          {isRenaming ? (
            <div
              className="absolute inset-x-5 bottom-16 z-10"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <input
                aria-label={m.a11y_rename_asset()}
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 font-bold text-neutral-900 text-xl shadow-md outline-hidden focus:border-accent dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-50"
                onBlur={commitRename}
                onChange={(e) => {
                  setRenameState((current) => ({
                    ...current,
                    draft: e.target.value,
                  }));
                }}
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

export default memo(AssetNode);
