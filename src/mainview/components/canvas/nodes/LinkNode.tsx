import {
  Handle,
  NodeResizeControl,
  Position,
  useViewport,
} from '@xyflow/react';
import {
  ExternalLink,
  Globe2,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef } from 'react';

import { colorToStyle } from '@/lib/colorUtils';
import type { LinkNodeData } from '@/lib/contentTypes';
import {
  getLinkDisplayTitle,
  getLinkHost,
  normalizeLinkUrl,
} from '@/lib/contentTypes';
import { rpcUnfurlLink } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

const handleClassName = 'conn-handle nodrag';
const DEFAULT_LINK_COLOR = '#FFFFFF';

type LinkNodeRuntimeData = Partial<LinkNodeData> & {
  isDropTarget?: boolean;
  isHidden?: boolean;
};

function resolveLinkData(data: LinkNodeRuntimeData): LinkNodeData {
  const url = typeof data.url === 'string' ? data.url : '';
  return {
    url,
    title: typeof data.title === 'string' ? data.title : '',
    color: typeof data.color === 'string' ? data.color : DEFAULT_LINK_COLOR,
    description:
      typeof data.description === 'string' ? data.description : undefined,
    faviconUrl:
      typeof data.faviconUrl === 'string' ? data.faviconUrl : undefined,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : undefined,
    siteName: typeof data.siteName === 'string' ? data.siteName : undefined,
    unfurlError:
      typeof data.unfurlError === 'string' ? data.unfurlError : undefined,
    unfurlStatus:
      data.unfurlStatus === 'idle' ||
      data.unfurlStatus === 'loading' ||
      data.unfurlStatus === 'ready' ||
      data.unfurlStatus === 'failed'
        ? data.unfurlStatus
        : undefined,
  };
}

function getOpenableUrl(url: string): string | null {
  return normalizeLinkUrl(url);
}

export const LinkContent = ({
  data,
  isFocused = false,
  onRetry,
}: {
  data: LinkNodeRuntimeData;
  isFocused?: boolean;
  onRetry?: () => void;
}) => {
  const link = resolveLinkData(data);
  const host = getLinkHost(link.url);
  const title = getLinkDisplayTitle(link);
  const openableUrl = getOpenableUrl(link.url);
  const description = link.description?.trim();

  if (isFocused) {
    return (
      <div
        className="flex size-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
        style={colorToStyle(link.color)}
      >
        <div className="flex min-h-0 flex-1 flex-col px-10 pt-10 pb-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white/70 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
                <Globe2 size={21} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-500 text-sm dark:text-neutral-400">
                  {host || 'Link'}
                </p>
                <p className="truncate text-neutral-400 text-xs dark:text-neutral-500">
                  {link.url}
                </p>
              </div>
            </div>
            {openableUrl ? (
              <a
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-neutral-950 px-4 py-2.5 font-semibold text-neutral-50 text-sm transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
                href={openableUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open link
                <ExternalLink size={16} />
              </a>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 rounded-2xl border border-black/10 bg-white/65 p-8 shadow-sm dark:border-white/10 dark:bg-white/8">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 bg-neutral-100 px-3 py-1 font-medium text-neutral-500 text-xs dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
                <LinkIcon size={13} />
                URL
              </div>
              <h1 className="text-balance font-bold text-4xl leading-tight tracking-normal">
                {title}
              </h1>
              {description ? (
                <p className="mt-5 max-w-2xl text-lg/relaxed text-neutral-600 dark:text-neutral-300">
                  {description}
                </p>
              ) : null}
              <div className="mt-8 rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                <p className="break-all font-mono text-neutral-600 text-sm dark:text-neutral-300">
                  {link.url || 'No URL'}
                </p>
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
      style={colorToStyle(link.color)}
    >
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
            <Globe2 size={18} />
          </div>
          <span className="rounded-full border border-black/10 bg-white/60 px-2 py-1 font-semibold text-[11px] text-neutral-500 uppercase tracking-normal dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
            Link
          </span>
        </div>
        {link.unfurlStatus === 'loading' ? (
          <div className="space-y-3">
            <div className="h-6 w-3/4 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-700" />
            <div className="flex items-center gap-2 text-neutral-400 text-xs">
              <Loader2 className="animate-spin" size={14} />
              Loading preview...
            </div>
          </div>
        ) : (
          <>
            <h3
              className={cn(
                'line-clamp-3 font-bold text-xl leading-tight',
                !title && 'text-neutral-400'
              )}
            >
              {title || 'Untitled link'}
            </h3>
            {description ? (
              <p className="mt-3 line-clamp-2 text-neutral-500 text-sm leading-snug dark:text-neutral-400">
                {description}
              </p>
            ) : null}
          </>
        )}
        {link.unfurlStatus === 'failed' ? (
          <button
            className="mt-2 flex items-center gap-1.5 text-neutral-400 text-xs transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
            type="button"
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        ) : null}
        <div className="mt-auto min-w-0 pt-4">
          <div className="flex min-w-0 items-center gap-2 rounded-xl border border-black/8 bg-white/55 px-3 py-2 text-neutral-500 dark:border-white/10 dark:bg-white/8 dark:text-neutral-300">
            <LinkIcon className="shrink-0" size={14} />
            <span className="truncate text-xs">{host || link.url}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const LinkNode = ({ id, data }: { id: string; data: LinkNodeRuntimeData }) => {
  const { zoom } = useViewport();
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const isZoomedOut = zoom < 0.4;

  // Each (nodeId,url) pair is fetched at most once per session. Store the
  // attempted url so re-renders with stale `data` references do not re-issue
  // the request, but allow re-fetching when the user edits the URL later.
  const unfurlAttemptRef = useRef<string | null>(null);

  const handleRetry = useCallback(() => {
    unfurlAttemptRef.current = null;
    updateNodeData(id, { unfurlStatus: 'idle', unfurlError: undefined });
  }, [id, updateNodeData]);

  useEffect(() => {
    const url = typeof data.url === 'string' ? data.url : '';
    if (!url) {
      return;
    }
    const normalized = normalizeLinkUrl(url);
    if (!normalized) {
      return;
    }
    if (data.unfurlStatus === 'ready' || data.unfurlStatus === 'loading') {
      return;
    }
    if (unfurlAttemptRef.current === normalized) {
      return;
    }
    unfurlAttemptRef.current = normalized;
    updateNodeData(id, { unfurlStatus: 'loading' });

    let cancelled = false;
    rpcUnfurlLink(normalized)
      .then((result) => {
        if (cancelled || !result) {
          return;
        }
        if (result.status === 'failed') {
          updateNodeData(id, {
            unfurlStatus: 'failed',
            unfurlError: 'Could not load link preview.',
          });
          return;
        }
        const { status: _status, url: _url, ...meta } = result;
        updateNodeData(id, {
          unfurlStatus: 'ready',
          unfurlError: undefined,
          ...(meta.title ? { title: meta.title } : {}),
          ...(meta.description ? { description: meta.description } : {}),
          ...(meta.siteName ? { siteName: meta.siteName } : {}),
          ...(meta.imageUrl ? { imageUrl: meta.imageUrl } : {}),
          ...(meta.faviconUrl ? { faviconUrl: meta.faviconUrl } : {}),
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        updateNodeData(id, {
          unfurlStatus: 'failed',
          unfurlError: 'Could not load link preview.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [data.url, data.unfurlStatus, id, updateNodeData]);

  return (
    <div
      className={cn(
        'group/link size-full',
        data.isHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <NodeResizeControl
        className="border-none! bg-transparent!"
        maxHeight={420}
        maxWidth={640}
        minHeight={150}
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
        <div className="absolute right-2 bottom-2 cursor-nwse-resize opacity-0 group-hover/link:opacity-100">
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
            style={colorToStyle(data.color)}
          >
            <div className="mb-4 h-8 w-8 rounded-xl bg-current opacity-10" />
            <h3 className="line-clamp-2 font-bold text-2xl/tight">
              {getLinkDisplayTitle(resolveLinkData(data))}
            </h3>
            <div className="mt-5 h-3 w-3/4 rounded-full bg-current opacity-20" />
          </div>
        ) : (
          <LinkContent data={data} onRetry={handleRetry} />
        )}
      </div>
    </div>
  );
};

export default memo(LinkNode);
