import { Dialog } from '@base-ui/react/dialog';
import type { ReactFlowInstance } from '@xyflow/react';
import {
  ArrowRight,
  Clock,
  FileText,
  Folder,
  Group,
  ImageIcon,
  Layers,
  Link2,
  Paperclip,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSearch } from '@/hooks/useSearch';
import { sanitizeForPersistence } from '@/lib/canvasNodeSerialization';
import { isRpcAvailable, rpcSaveManifest } from '@/lib/rpc';
import type { SearchResult, SearchResultKind } from '@/lib/searchTypes';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

const SEARCH_HISTORY_STORAGE_KEY = 'ghostboard:search-history';
const SEARCH_HISTORY_MAX = 8;

type SearchFilter = 'all' | 'notes' | 'folders' | 'links' | 'images';

const FILTER_KIND_MAP: Record<
  Exclude<SearchFilter, 'all'>,
  SearchResultKind[]
> = {
  notes: ['note', 'card'],
  folders: ['folder'],
  links: ['link'],
  images: ['image'],
};

function readHistory(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: string[]) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, SEARCH_HISTORY_MAX))
    );
  } catch {
    // Storage may be unavailable (private mode, quota). History is best-effort.
  }
}

interface SearchDialogProps {
  /**
   * ReactFlow instance used to pan / zoom to a result. When absent (e.g. tests
   * or alternate hosts), node hits still update selection but skip the camera move.
   */
  rfInstance?: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

export function SearchDialog({ rfInstance }: SearchDialogProps) {
  const open = useCanvasStore((s) => s.searchOpen);
  const setOpen = useCanvasStore((s) => s.setSearchOpen);
  const pendingSearchQuery = useCanvasStore((s) => s.pendingSearchQuery);
  const setPendingSearchQuery = useCanvasStore((s) => s.setPendingSearchQuery);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const setActiveView = useCanvasStore((s) => s.setActiveView);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastResultSignatureRef = useRef('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [history, setHistory] = useState<string[]>(() => readHistory());

  const { query, setQuery, results, isLoading, error, fallback } = useSearch();
  const trimmedQuery = query.trim();

  // Filter results client-side by node kind. Backend continues to return the
  // full set; chips toggle visibility only.
  const filteredResults = useMemo(() => {
    if (filter === 'all') {
      return results;
    }
    const kinds = new Set<SearchResultKind>(FILTER_KIND_MAP[filter]);
    return results.filter((r) => kinds.has(r.kind));
  }, [filter, results]);

  const recordHistory = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setHistory((prev) => {
      const next = [
        trimmed,
        ...prev.filter((entry) => entry !== trimmed),
      ].slice(0, SEARCH_HISTORY_MAX);
      writeHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    writeHistory([]);
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      setFilter('all');
    }
  }, [open, setQuery]);

  // Seed query from pending-search payload when the dialog opens. This lets
  // callers (e.g. the titlebar search trigger) pre-fill the input by typing.
  useEffect(() => {
    if (!(open && pendingSearchQuery)) {
      return;
    }
    setQuery(pendingSearchQuery);
    setPendingSearchQuery(null);
  }, [open, pendingSearchQuery, setQuery, setPendingSearchQuery]);

  // Reset active index when results change
  useEffect(() => {
    const signature = `${trimmedQuery}\n${results
      .map((result) => result.id)
      .join('\n')}`;
    if (lastResultSignatureRef.current === signature) {
      return;
    }
    lastResultSignatureRef.current = signature;
    setActiveIndex(0);
  }, [results, trimmedQuery]);

  // Focus input on open
  useEffect(() => {
    if (!open) {
      return;
    }
    const handle = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(handle);
    };
  }, [open]);

  // Scroll active row into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const locateInCurrentView = useCallback(
    (result: SearchResult) => {
      const inst = rfInstance?.current;
      if (result.nodeId) {
        const nodeId = result.nodeId;
        setNodes((prev) =>
          prev.map((n) => ({ ...n, selected: n.id === nodeId }))
        );
        if (inst && result.position) {
          const node = inst
            .getNodes?.()
            ?.find((n: { id: string }) => n.id === nodeId);
          const center = nodeCenter(node, result.position);
          if (center) {
            const zoom = inst.getViewport?.()?.zoom ?? 1;
            inst.setCenter?.(center.x, center.y, { zoom, duration: 240 });
          }
        }
        return;
      }
      if (result.edgeId) {
        const edgeId = result.edgeId;
        setEdges((prev) =>
          prev.map((e) => ({ ...e, selected: e.id === edgeId }))
        );
        if (!inst) {
          return;
        }
        const center = edgeMidpoint(inst, edgeId);
        if (center) {
          const zoom = inst.getViewport?.()?.zoom ?? 1;
          inst.setCenter?.(center.x, center.y, { zoom, duration: 240 });
        }
      }
    },
    [setNodes, setEdges, rfInstance]
  );

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      recordHistory(trimmedQuery);
      setOpen(false);

      if (result.kind === 'view' || result.viewId !== activeViewId) {
        if (await isRpcAvailable()) {
          const { nodes, edges } = useCanvasStore.getState();
          const sanitized = sanitizeForPersistence(nodes, edges);
          await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
        }
        if (result.kind !== 'view') {
          setPendingSearchTarget({
            viewId: result.viewId,
            nodeId: result.nodeId,
            edgeId: result.edgeId,
          });
        }
        setActiveView(result.viewId);
        return;
      }

      locateInCurrentView(result);
    },
    [
      setOpen,
      activeViewId,
      setActiveView,
      setPendingSearchTarget,
      locateInCurrentView,
      recordHistory,
      trimmedQuery,
    ]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (filteredResults.length === 0) {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filteredResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredResults[activeIndex];
        if (item) {
          handleSelect(item);
        }
      }
    },
    [filteredResults, activeIndex, handleSelect]
  );

  const showHistory = !trimmedQuery && history.length > 0;
  const filterChips: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: m.search_filter_all() },
    { id: 'notes', label: m.search_filter_notes() },
    { id: 'folders', label: m.search_filter_folders() },
    { id: 'links', label: m.search_filter_links() },
    { id: 'images', label: m.search_filter_images() },
  ];

  return (
    <Dialog.Root onOpenChange={setOpen} open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          aria-label="Search"
          className="fixed top-[15%] left-1/2 z-50 flex max-h-[70vh] w-[min(640px,92vw)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-hidden transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-2 border-gray-100 border-b px-4 py-3 dark:border-neutral-800">
            <Search
              aria-hidden
              className="text-gray-400 dark:text-gray-500"
              size={18}
            />
            <input
              aria-label="Search query"
              className="flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={onKeyDown}
              placeholder={m.search_dialog_placeholder()}
              ref={inputRef}
              type="text"
              value={query}
            />
            {isLoading ? (
              <span className="text-gray-400 text-xs">…</span>
            ) : null}
          </div>

          <div
            aria-label="Filter results by type"
            className="flex items-center gap-1.5 border-gray-100 border-b px-3 py-2 dark:border-neutral-800"
            role="tablist"
          >
            {filterChips.map((chip) => (
              <button
                aria-selected={filter === chip.id}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  filter === chip.id
                    ? 'bg-blue-500/10 font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                    : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                }`}
                key={chip.id}
                onClick={() => {
                  setFilter(chip.id);
                }}
                role="tab"
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div
            aria-label="Search results"
            className="max-h-[55vh] flex-1 overflow-y-auto"
            data-testid="search-results"
            ref={listRef}
            role="listbox"
          >
            {error ? (
              <div className="px-4 py-6 text-red-500 text-sm">
                Search failed: {error}
              </div>
            ) : null}

            {!error && showHistory ? (
              <>
                <div className="flex items-center justify-between border-gray-100 border-b px-4 py-2 text-gray-500 text-xs dark:border-neutral-800 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Clock aria-hidden size={12} />
                    {m.search_recent_title()}
                  </span>
                  <button
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    onClick={clearHistory}
                    type="button"
                  >
                    {m.search_recent_clear()}
                  </button>
                </div>
                {history.map((entry) => (
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-gray-700 text-sm hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
                    key={entry}
                    onClick={() => {
                      setQuery(entry);
                      inputRef.current?.focus();
                    }}
                    type="button"
                  >
                    <Clock
                      aria-hidden
                      className="shrink-0 text-gray-400 dark:text-gray-500"
                      size={14}
                    />
                    <span className="flex-1 truncate">{entry}</span>
                    <X
                      aria-label="Remove from history"
                      className="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHistory((prev) => {
                          const next = prev.filter((v) => v !== entry);
                          writeHistory(next);
                          return next;
                        });
                      }}
                      size={14}
                    />
                  </button>
                ))}
              </>
            ) : null}

            {!error &&
            trimmedQuery &&
            filteredResults.length === 0 &&
            !isLoading ? (
              <div className="px-4 py-10 text-center text-gray-400 text-sm dark:text-gray-500">
                {m.search_no_matches()}
              </div>
            ) : null}

            {!error && trimmedQuery && filteredResults.length > 0 ? (
              <div className="border-gray-100 border-b px-4 py-2 text-gray-500 text-xs dark:border-neutral-800 dark:text-gray-400">
                {filteredResults.length === 1
                  ? '1 result'
                  : `${filteredResults.length} results`}{' '}
                for "{trimmedQuery}"
              </div>
            ) : null}

            {filteredResults.map((r, idx) => (
              <ResultRow
                active={idx === activeIndex}
                key={r.id}
                onClick={() => {
                  handleSelect(r);
                }}
                onMouseEnter={() => {
                  setActiveIndex(idx);
                }}
                result={r}
              />
            ))}
          </div>

          {fallback ? (
            <div className="border-gray-100 border-t bg-gray-50 px-4 py-2 text-gray-500 text-xs dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-gray-400">
              Searching current canvas only (offline mode).
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ResultRow({
  result,
  active,
  onClick,
  onMouseEnter,
}: {
  result: SearchResult;
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const Icon = useMemo(() => iconFor(result.kind), [result.kind]);
  return (
    <button
      aria-selected={active}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-hidden transition-colors ${
        active
          ? 'bg-blue-50 text-blue-900 dark:bg-blue-500/10 dark:text-blue-100'
          : 'text-gray-800 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5'
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      type="button"
    >
      <Icon
        aria-hidden
        className="shrink-0 text-gray-400 dark:text-gray-500"
        size={18}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{result.title || 'Untitled'}</div>
        <div className="truncate text-gray-500 text-xs dark:text-gray-400">
          {result.excerpt}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-gray-400 text-xs dark:text-gray-500">
        <span>{result.viewName}</span>
        <ArrowRight aria-hidden size={12} />
        <span className="capitalize">{result.matchField}</span>
      </div>
    </button>
  );
}

interface NodeLike {
  height?: number;
  measured?: { width?: number; height?: number };
  position?: { x: number; y: number };
  width?: number;
}

function nodeCenter(
  node: NodeLike | undefined,
  fallbackPosition?: { x: number; y: number }
): { x: number; y: number } | null {
  const position = node?.position ?? fallbackPosition;
  if (!position) {
    return null;
  }
  const w = node?.measured?.width ?? node?.width ?? 240;
  const h = node?.measured?.height ?? node?.height ?? 160;
  return { x: position.x + w / 2, y: position.y + h / 2 };
}

function edgeMidpoint(
  inst: ReactFlowInstance<any, any>,
  edgeId: string
): { x: number; y: number } | null {
  const edge = inst
    .getEdges?.()
    ?.find((e: { id: string }) => e.id === edgeId) as
    | { source?: string; target?: string }
    | undefined;
  if (!(edge?.source && edge.target)) {
    return null;
  }
  const nodes = (inst.getNodes?.() ?? []) as Array<NodeLike & { id: string }>;
  const src = nodes.find((n) => n.id === edge.source);
  const tgt = nodes.find((n) => n.id === edge.target);
  const srcCenter = nodeCenter(src);
  const tgtCenter = nodeCenter(tgt);
  if (!(srcCenter && tgtCenter)) {
    return null;
  }
  return {
    x: (srcCenter.x + tgtCenter.x) / 2,
    y: (srcCenter.y + tgtCenter.y) / 2,
  };
}

function iconFor(kind: SearchResult['kind']) {
  switch (kind) {
    case 'sticky':
      return StickyNote;
    case 'folder':
      return Folder;
    case 'group':
      return Group;
    case 'image':
      return ImageIcon;
    case 'asset':
      return Paperclip;
    case 'link':
      return Link2;
    case 'view':
      return Layers;
    default:
      return FileText;
  }
}
