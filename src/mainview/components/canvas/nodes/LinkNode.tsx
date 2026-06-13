import {
  AlertTriangle,
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
import { useIsZoomedOut } from '@/contexts/ZoomLevelContext';
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

import { NodeHandles } from './_shared/NodeHandles';
import { ResizeHandle } from './_shared/ResizeHandle';

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

function LinkFaviconBadge({
  className,
  faviconUrl,
}: {
  className?: string;
  faviconUrl?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = !!faviconUrl && !errored;
  return (
    <div
      className={cn(
        'grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/10 bg-white/75 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200',
        className
      )}
    >
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
  const [heroImageError, setHeroImageError] = useState(false);

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
        className="size-full overflow-y-auto bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
        style={colorToStyle(link.color)}
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-8 pt-10 pb-12">
          {link.imageUrl && !heroImageError ? (
            <img
              alt=""
              className="mb-8 aspect-[21/9] w-full rounded-2xl border border-black/5 object-cover shadow-sm dark:border-white/10"
              draggable={false}
              onError={() => setHeroImageError(true)}
              src={link.imageUrl}
            />
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <LinkFaviconBadge faviconUrl={link.faviconUrl} />
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">
                  {link.siteName || host || 'Link'}
                </p>
                {link.siteName && host ? (
                  <p className="truncate text-neutral-400 text-xs dark:text-neutral-500">
                    {host}
                  </p>
                ) : null}
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

          <h1 className="mt-7 text-balance font-bold text-4xl leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 text-lg/relaxed text-neutral-600 dark:text-neutral-300">
              {description}
            </p>
          ) : null}
          {link.unfurlStatus === 'failed' ? (
            <div className="mt-6 inline-flex items-center gap-2 self-start rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-800 text-xs dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
              <AlertTriangle size={13} />
              Preview unavailable
            </div>
          ) : null}

          <div className="mt-auto border-black/8 border-t pt-6 dark:border-white/10">
            <p className="mb-2 flex items-center gap-1.5 font-medium text-neutral-400 text-xs uppercase tracking-wider dark:text-neutral-500">
              <LinkIcon size={12} />
              URL
            </p>
            {onUrlChange ? (
              <form onSubmit={handleUrlSubmit}>
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
              <p
                className="break-all font-mono text-neutral-500 text-sm dark:text-neutral-300"
                title={link.url || undefined}
              >
                {link.url || 'No URL'}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const showHeroImage = Boolean(link.imageUrl) && !heroImageError;

  return (
    <div
      className="flex size-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-50"
      style={colorToStyle(link.color)}
    >
      <div className="relative h-32 w-full shrink-0 overflow-hidden">
        {showHeroImage ? (
          <>
            <img
              alt=""
              className="size-full object-cover"
              draggable={false}
              loading="lazy"
              onError={() => setHeroImageError(true)}
              src={link.imageUrl}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/12 to-transparent dark:from-black/30" />
          </>
        ) : (
          <div className="relative size-full overflow-hidden bg-gradient-to-br from-neutral-100 via-neutral-50/70 to-neutral-200 dark:from-neutral-800/90 dark:via-neutral-850 dark:to-neutral-900">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.5),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.06),transparent_50%)]" />
            <Globe2
              className="absolute right-4 bottom-2 text-neutral-200/40 dark:text-neutral-700/40"
              size={56}
              strokeWidth={1.2}
            />
          </div>
        )}
        <span className="absolute top-3 right-3 rounded-full border border-black/5 bg-white/80 px-2 py-1 font-semibold text-[11px] text-neutral-600 uppercase tracking-normal backdrop-blur-sm dark:border-white/10 dark:bg-black/55 dark:text-neutral-200">
          Link
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-5 pb-4">
        <div className="mb-3 flex shrink-0 items-start gap-3">
          <LinkFaviconBadge faviconUrl={link.faviconUrl} />
          {link.unfurlStatus === 'loading' ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-neutral-400 text-sm">
              <Loader2 className="shrink-0 animate-spin" size={16} />
              <span>Loading preview...</span>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  'line-clamp-2 font-bold text-xl leading-tight',
                  !title && 'text-neutral-400'
                )}
              >
                {title || 'Untitled link'}
              </h3>
              {link.siteName && host ? (
                <p className="mt-1 truncate text-neutral-400 text-xs dark:text-neutral-500">
                  {link.siteName}
                </p>
              ) : null}
            </div>
          )}
        </div>
        {description && link.unfurlStatus !== 'loading' ? (
          <p className='line-clamp-2 min-h-0 text-neutral-600 text-sm/relaxed dark:text-neutral-400'>
            {description}
          </p>
        ) : null}
        {link.unfurlStatus === 'failed' ? (
          <button
            className="nodrag nopan mt-3 inline-flex items-center gap-1.5 self-start rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 text-xs transition-colors hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
            type="button"
          >
            <RefreshCw size={12} />
            <span>Retry preview</span>
          </button>
        ) : null}
        <div className="mt-auto min-w-0 shrink-0 pt-3">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-black/8 bg-neutral-50/80 px-3 py-2.5 text-neutral-500 dark:border-white/8 dark:bg-white/5 dark:text-neutral-400">
            <LinkIcon className="shrink-0 opacity-50" size={13} />
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
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const { tag, tagColor, tags, dimmedByFilter, tagEditor } = useNodeTagEditing(
    id,
    data as unknown as Record<string, unknown>
  );
  const isDark = isColorDark(data.color);
  const isZoomedOut = useIsZoomedOut();
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [unfurlVisible, setUnfurlVisible] = useState(false);

  // Each (nodeId,url) pair is fetched at most once per session. Store the
  // attempted url so re-renders with stale `data` references do not re-issue
  // the request, but allow re-fetching when the user edits the URL later.
  const unfurlAttemptRef = useRef<string | null>(null);

  const handleRetry = useCallback(() => {
    unfurlAttemptRef.current = null;
    updateNodeData(id, { unfurlStatus: 'idle', unfurlError: undefined });
  }, [id, updateNodeData]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setUnfurlVisible(true);
      return;
    }

    const element = nodeRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          setUnfurlVisible(true);
          observer.disconnect();
        }
      },
      { threshold: [0.5] }
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!unfurlVisible) {
      return;
    }
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

    // Apply the result only while this url is still the active attempt. The
    // effect re-runs when we set the status to 'loading' above (and again when
    // the user edits the url); using the attempt ref instead of a per-run
    // `cancelled` flag prevents those re-runs from discarding an in-flight
    // request, which otherwise leaves the node stuck on "Loading preview...".
    rpcUnfurlLink(normalized)
      .then((result) => {
        if (unfurlAttemptRef.current !== normalized) {
          console.log(
            '[LinkNode] Unfurl result ignored (URL changed):',
            normalized
          );
          return;
        }
        if (!result) {
          console.warn(
            '[LinkNode] Unfurl returned null (RPC failure):',
            normalized
          );
          updateNodeData(id, {
            unfurlStatus: 'failed',
            unfurlError: 'Could not load link preview.',
          });
          return;
        }
        console.log('[LinkNode] Unfurl result for', normalized, ':', result);
        if (result.status === 'failed') {
          console.warn('[LinkNode] Unfurl failed for', normalized);
          updateNodeData(id, {
            unfurlStatus: 'failed',
            unfurlError: 'Could not load link preview.',
          });
          return;
        }
        const { status: _status, url: _url, ...meta } = result;
        console.log('[LinkNode] Extracted metadata:', meta);
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
      .catch((error) => {
        if (unfurlAttemptRef.current !== normalized) {
          return;
        }
        console.error('[LinkNode] Unfurl RPC error for', normalized, ':', error);
        updateNodeData(id, {
          unfurlStatus: 'failed',
          unfurlError: 'Could not load link preview.',
        });
      });
  }, [data.url, data.unfurlStatus, id, unfurlVisible, updateNodeData]);

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
      ref={nodeRef}
    >
      {tagEditor}
      <ResizeHandle
        hoverClassName="group-hover/link:opacity-100"
        maxHeight={600}
        maxWidth={800}
        minHeight={240}
        minWidth={320}
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
