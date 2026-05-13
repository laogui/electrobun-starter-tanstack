import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import {
  AlertTriangle,
  ExternalLink,
  FileArchive,
  FileAudio,
  FileQuestion,
  FileText,
  FileVideo,
} from 'lucide-react';
import { memo, useCallback } from 'react';
import { toast } from 'sonner';

import { colorToStyle } from '@/lib/colorUtils';
import type { AssetKind, AssetNodeData } from '@/lib/contentTypes';
import { getAssetDisplayTitle } from '@/lib/contentTypes';
import { rpcOpenAttachment } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';
const DEFAULT_ASSET_COLOR = '#FFFFFF';

type AssetNodeRuntimeData = Partial<AssetNodeData> & {
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

  const handleOpen = useCallback(async () => {
    if (!asset.attachmentFile) {
      toast.error('File has not been saved yet.');
      return;
    }
    const result = await rpcOpenAttachment(asset.attachmentFile);
    if (!result.success) {
      toast.error('File could not be opened.');
    }
  }, [asset.attachmentFile]);

  if (isFocused) {
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
                <p className="truncate text-neutral-400 text-xs dark:text-neutral-500">
                  {asset.attachmentFile ?? 'Unsaved attachment'}
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
                <div className="col-span-2 rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                  <p className="font-medium text-neutral-500 text-xs uppercase tracking-normal dark:text-neutral-400">
                    File
                  </p>
                  <p className="mt-1 break-all font-mono text-neutral-700 text-sm dark:text-neutral-200">
                    {asset.fileName || 'Untitled file'}
                  </p>
                </div>
              </div>
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

const AssetNode = ({ data }: { id: string; data: AssetNodeRuntimeData }) => {
  const { zoom } = useViewport();
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const isZoomedOut = zoom < 0.4;
  const asset = resolveAssetData(data);

  return (
    <div
      className={cn(
        'group/asset size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={520}
        maxWidth={680}
        minHeight={170}
        minWidth={240}
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
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 group-hover/asset:opacity-100">
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

      <div className="node-visual size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
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
      </div>
    </div>
  );
};

export default memo(AssetNode);
