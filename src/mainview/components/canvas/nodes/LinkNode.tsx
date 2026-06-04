import { useViewport } from '@xyflow/react';
import {
  ExternalLink,
  Globe2,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  type FormEvent,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { NodeTagChips } from '@/components/card/NodeTagChips';
import { useNodeTagEditing } from '@/components/card/useNodeTagEditing';
import { colorToStyle, isColorDark } from '@/lib/colorUtils';
import type { LinkNodeData } from '@/lib/contentTypes';
import {
  getLinkDisplayTitle,
  getLinkHost,
  normalizeLinkUrl,
} from '@/lib/contentTypes';
import { rpcUnfurlLink } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import { ResizeHandle } from './_shared/ResizeHandle';

const handleClassName = 'conn-handle nodrag';
const DEFAULT_LINK_COLOR = '#FFFFFF';

export type LinkNodeRuntimeData = Partial<LinkNodeData> & {
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

function LinkFaviconBadge({ faviconUrl }: { faviconUrl?: string }) {
  const [errored, setErrored] = useState(false);
  const showImage = !!faviconUrl && !errored;
  return (
    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200">
      {showImage ? (
        <img
          alt=""
          className="size-5 object-contain"
          draggable={false}
          loading="lazy"
          onError={() => setErrored(true)}
          src={faviconUrl}
        />
      ) : (
        <Globe2 size={18} />
      )}
    </div>
  );
}

export const LinkContent = ({
  data,
  isFocused = false,
  onUrlChange,
  onRetry,
}: {
  data: LinkNodeRuntimeData;
  isFocused?: boolean;
  onRetry?: () => void;
  onUrlChange?: (url: string) => void;
}) => {
  const link = resolveLinkData(data);
  const host = getLinkHost(link.url);
  const title = getLinkDisplayTitle(link);
  const openableUrl = getOpenableUrl(link.url);
  const description = link.description?.trim();
  const [draftUrl, setDraftUrl] = useState(link.url);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    setDraftUrl(link.url);
    setUrlError(null);
  }, [link.url]);

  const handleUrlSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const normalized = normalizeLinkUrl(draftUrl);
      if (!normalized) {
        setUrlError('Enter a valid http(s) URL.');
        return;
      }
      setUrlError(null);
      if (normalized !== link.url) {
        onUrlChange?.(normalized);
      }
    },
    [draftUrl, link.url, onUrlChange]
  );

  if (isFocused) {
    return (
      <div
        className="flex size-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
        style={colorToStyle(link.color)}
      >
        <div className="flex min-h-0 flex-1 flex-col px-10 pt-10 pb-8">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <LinkFaviconBadge faviconUrl={link.faviconUrl} />
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-500 text-sm dark:text-neutral-400">
                  {host || 'Link'}
                </p>
                <p
                  className="truncate text-neutral-400 text-xs dark:text-neutral-500"
                  title={link.url || undefined}
                >
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
              {onUrlChange ? (
                <form
                  className="mt-8 rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20"
                  onSubmit={handleUrlSubmit}
                >
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Link URL"
                      className="nodrag nopan min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-2 font-mono text-neutral-700 text-sm outline-none transition-colors focus:border-blue-400 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                      onChange={(event) => {
                        setDraftUrl(event.target.value);
                      }}
                      value={draftUrl}
                    />
                    <button
                      className="nodrag nopan shrink-0 rounded-lg bg-neutral-950 px-3 py-2 font-semibold text-neutral-50 text-sm transition-colors hover:bg-neutral-800 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
                      type="submit"
                    >
                      Save URL
                    </button>
                  </div>
                  {urlError ? (
                    <p className="mt-2 text-red-600 text-xs dark:text-red-300">
                      {urlError}
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="mt-8 rounded-xl border border-black/10 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
                  <p className="break-all font-mono text-neutral-700 text-sm dark:text-neutral-100">
                    {link.url || 'No URL'}
                  </p>
                </div>
              )}
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
      {link.imageUrl ? (
        <div className="relative h-28 w-full shrink-0 overflow-hidden border-black/5 border-b dark:border-white/10">
          <img
            alt=""
            className="size-full object-cover"
            draggable={false}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
            src={link.imageUrl}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <LinkFaviconBadge faviconUrl={link.faviconUrl} />
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
            className="nodrag nopan mt-2 flex items-center gap-1.5 text-neutral-400 text-xs transition-colors hover:text-neutral-600 dark:hover:text-neutral-200"
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
            <span className="truncate text-xs" title={link.url || undefined}>
              {host || link.url}
            </span>
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
  const { tag, tagColor, tags, dimmedByFilter, tagEditor } = useNodeTagEditing(
    id,
    data as unknown as Record<string, unknown>
  );
  const isDark = isColorDark(data.color);
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
        'group/link size-full transition-opacity',
        data.isHidden
          ? 'pointer-events-none opacity-0'
          : dimmedByFilter
            ? 'opacity-30'
            : 'opacity-100'
      )}
    >
      {tagEditor}
      <ResizeHandle
        hoverClassName="group-hover/link:opacity-100"
        maxHeight={420}
        maxWidth={640}
        minHeight={150}
        minWidth={240}
        nodeId={id}
        onResizeStart={saveSnapshot}
      />

      <NodeHandles />

      <div className="node-visual relative size-full cursor-pointer overflow-hidden rounded-3xl border border-black/5 shadow-card transition-shadow duration-200 ease-out hover:shadow-card-hover">
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

export default memo(LinkNode);
