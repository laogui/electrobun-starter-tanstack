import { Dialog } from '@base-ui/react/dialog';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { ArrowRight, ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { toast } from 'sonner';
import { useSearch } from '@/hooks/useSearch';
import { isCanvasContentNode } from '@/lib/canvasNodePredicates';
import type { SearchResult, SearchResultKind } from '@/lib/searchTypes';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';
import { iconFor } from './resultIcon';
import {
  type CanvasEntry,
  type RecentCard,
  SearchEmptyState,
} from './SearchEmptyState';
import { highlightMatches } from './searchResultRender';

const SEARCH_HISTORY_STORAGE_KEY = 'ghostboard:v1:search-history';
const LEGACY_SEARCH_HISTORY_STORAGE_KEY = ['ghostboard', 'search-history'].join(
  ':'
);
const SEARCH_HISTORY_MAX = 8;
const RECENT_CARDS_MAX = 5;

type SearchFilter = 'all' | 'notes' | 'folders' | 'links' | 'images';

const FILTER_KIND_MAP: Record<
  Exclude<SearchFilter, 'all'>,
  SearchResultKind[]
> = {
  notes: ['note', 'card', 'widget'],
  folders: ['folder'],
  links: ['link'],
  images: ['image'],
};

interface ResultGroup {
  results: SearchResult[];
  viewId: string;
  viewName: string;
}

/**
 * A navigable row in the zero-query empty state. The flat order (history →
 * recent cards → canvases) mirrors the render order in SearchEmptyState so the
 * keyboard active index lines up with the highlighted row.
 */
type EmptyItem =
  | { type: 'history'; entry: string }
  | { type: 'card'; card: RecentCard }
  | { type: 'canvas'; canvas: CanvasEntry };

interface SearchUiState {
  activeIndex: number;
  collapsedGroups: Set<string>;
  filter: SearchFilter;
  navigationSignature: string;
}

type SearchUiAction =
  | { type: 'navigationChanged'; signature: string }
  | { type: 'resetDialog'; signature: string }
  | { type: 'setActiveIndex'; index: number }
  | { type: 'setFilter'; filter: SearchFilter }
  | { type: 'toggleGroup'; viewId: string };

const initialSearchUiState: SearchUiState = {
  activeIndex: 0,
  collapsedGroups: new Set(),
  filter: 'all',
  navigationSignature: '',
};

function searchUiReducer(
  state: SearchUiState,
  action: SearchUiAction
): SearchUiState {
  switch (action.type) {
    case 'navigationChanged':
      return {
        ...state,
        activeIndex: 0,
        navigationSignature: action.signature,
      };
    case 'resetDialog':
      return {
        activeIndex: 0,
        collapsedGroups: new Set(),
        filter: 'all',
        navigationSignature: action.signature,
      };
    case 'setActiveIndex':
      return { ...state, activeIndex: action.index };
    case 'setFilter':
      return { ...state, activeIndex: 0, filter: action.filter };
    case 'toggleGroup': {
      const collapsedGroups = new Set(state.collapsedGroups);
      if (collapsedGroups.has(action.viewId)) {
        collapsedGroups.delete(action.viewId);
      } else {
        collapsedGroups.add(action.viewId);
      }
      return { ...state, collapsedGroups };
    }
  }
}

function readHistory(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw =
      window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SEARCH_HISTORY_STORAGE_KEY);
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

function contentNodeKind(type: string | undefined): SearchResultKind {
  switch (type) {
    case 'sticky':
      return 'sticky';
    case 'image':
      return 'image';
    case 'asset':
      return 'asset';
    case 'link':
      return 'link';
    case 'widget':
      return 'widget';
    default:
      return 'card';
  }
}

function contentNodeTitle(node: Node): string {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (title) {
    return title;
  }
  if (node.type === 'asset' && typeof data.fileName === 'string') {
    return data.fileName;
  }
  if (node.type === 'link' && typeof data.url === 'string') {
    return data.url;
  }
  if (node.type === 'sticky' && typeof data.content === 'string') {
    return data.content.slice(0, 80);
  }
  return '';
}

interface SearchDialogProps {
  /**
   * ReactFlow instance used to pan / zoom to a result. When absent (e.g. tests
   * or alternate hosts), node hits still update selection but skip the camera move.
   */
  rfInstance?: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

// Component split is a broad UI refactor; keep search navigation behavior intact.
// react-doctor-disable-next-line react-doctor/no-giant-component
export function SearchDialog({ rfInstance }: SearchDialogProps) {
  const open = useCanvasStore((s) => s.searchOpen);
  const setOpen = useCanvasStore((s) => s.setSearchOpen);
  const pendingSearchQuery = useCanvasStore((s) => s.pendingSearchQuery);
  const setPendingSearchQuery = useCanvasStore((s) => s.setPendingSearchQuery);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const switchView = useCanvasStore((s) => s.switchView);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setCreateMenuOpen = useCanvasStore((s) => s.setCreateMenuOpen);
  const nodes = useCanvasStore((s) => s.nodes);
  const views = useCanvasStore((s) => s.views);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [searchUi, dispatchSearchUi] = useReducer(
    searchUiReducer,
    initialSearchUiState
  );
  const [history, setHistory] = useState<string[]>(() => readHistory());
  const { collapsedGroups, filter } = searchUi;

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

  // Group results by source canvas, preserving score order of first appearance
  // (roadmap E2). Groups can be collapsed via their header.
  const groups = useMemo<ResultGroup[]>(() => {
    const order: string[] = [];
    const byView = new Map<string, ResultGroup>();
    for (const r of filteredResults) {
      let group = byView.get(r.viewId);
      if (!group) {
        group = { viewId: r.viewId, viewName: r.viewName, results: [] };
        byView.set(r.viewId, group);
        order.push(r.viewId);
      }
      group.results.push(r);
    }
    return order.map((id) => byView.get(id) as ResultGroup);
  }, [filteredResults]);

  // Flat list of currently navigable rows (skips collapsed groups). activeIndex
  // and keyboard navigation operate over this list.
  const visibleResults = useMemo<SearchResult[]>(() => {
    const out: SearchResult[] = [];
    for (const group of groups) {
      if (collapsedGroups.has(group.viewId)) {
        continue;
      }
      out.push(...group.results);
    }
    return out;
  }, [groups, collapsedGroups]);

  const recentCards = useMemo<RecentCard[]>(() => {
    const candidates: Array<{ node: Node; updatedAt: number }> = [];
    for (const node of nodes) {
      if (!isCanvasContentNode(node.type)) {
        continue;
      }
      candidates.push({
        node,
        updatedAt:
          typeof (node.data as Record<string, unknown> | undefined)
            ?.updatedAt === 'number'
            ? ((node.data as Record<string, unknown>).updatedAt as number)
            : 0,
      });
    }
    return candidates
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, RECENT_CARDS_MAX)
      .map(({ node }) => ({
        id: node.id,
        kind: contentNodeKind(node.type),
        title: contentNodeTitle(node),
      }));
  }, [nodes]);

  // Canvases offered as quick jump targets in the empty state (everything but
  // the one already in view). Mirrors the filter inside SearchEmptyState.
  const otherCanvases = useMemo<CanvasEntry[]>(
    () => views.filter((v) => v.id !== activeViewId),
    [views, activeViewId]
  );

  // Flat list of navigable empty-state rows, only relevant before the user
  // types. Drives ArrowUp/Down/Enter when there is no query.
  const emptyItems = useMemo<EmptyItem[]>(() => {
    if (trimmedQuery) {
      return [];
    }
    return [
      ...history.map((entry): EmptyItem => ({ type: 'history', entry })),
      ...recentCards.map((card): EmptyItem => ({ type: 'card', card })),
      ...otherCanvases.map((canvas): EmptyItem => ({ type: 'canvas', canvas })),
    ];
  }, [trimmedQuery, history, recentCards, otherCanvases]);

  const navigationSignature = useMemo(() => {
    if (trimmedQuery) {
      return `query:${trimmedQuery}\n${visibleResults
        .map((result) => result.id)
        .join('\n')}`;
    }
    return `empty:\n${emptyItems
      .map((item) => {
        if (item.type === 'history') {
          return `history:${item.entry}`;
        }
        if (item.type === 'card') {
          return `card:${item.card.id}`;
        }
        return `canvas:${item.canvas.id}`;
      })
      .join('\n')}`;
  }, [emptyItems, trimmedQuery, visibleResults]);

  if (searchUi.navigationSignature !== navigationSignature) {
    dispatchSearchUi({
      type: 'navigationChanged',
      signature: navigationSignature,
    });
  }

  const navLength = trimmedQuery ? visibleResults.length : emptyItems.length;
  const maxActiveIndex = Math.max(0, navLength - 1);
  const activeIndex =
    searchUi.navigationSignature === navigationSignature
      ? Math.min(searchUi.activeIndex, maxActiveIndex)
      : 0;

  const setActiveIndex = useCallback(
    (index: number) => {
      dispatchSearchUi({
        type: 'setActiveIndex',
        index: Math.max(0, Math.min(index, maxActiveIndex)),
      });
    },
    [maxActiveIndex]
  );

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

  const removeHistory = useCallback((entry: string) => {
    setHistory((prev) => {
      const next = prev.filter((v) => v !== entry);
      writeHistory(next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((viewId: string) => {
    dispatchSearchUi({ type: 'toggleGroup', viewId });
  }, []);

  // Seed query from pending-search payload when the dialog opens. This lets
  // callers (e.g. the titlebar search trigger) pre-fill the input by typing.
  useEffect(() => {
    if (!(open && pendingSearchQuery)) {
      return;
    }
    setQuery(pendingSearchQuery);
    setPendingSearchQuery(null);
  }, [open, pendingSearchQuery, setQuery, setPendingSearchQuery]);

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
    const el = listRef.current?.querySelector(
      `[data-result-index="${activeIndex}"]`
    ) as HTMLElement | null;
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
            suppressViewportPersist(300);
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
          suppressViewportPersist(300);
          inst.setCenter?.(center.x, center.y, { zoom, duration: 240 });
        }
      }
    },
    [setNodes, setEdges, rfInstance]
  );

  const closeSearch = useCallback(() => {
    dispatchSearchUi({
      type: 'resetDialog',
      signature: navigationSignature,
    });
    setQuery('');
    setOpen(false);
  }, [navigationSignature, setOpen, setQuery]);

  const handleSelect = useCallback(
    async (result: SearchResult) => {
      recordHistory(trimmedQuery);
      closeSearch();

      if (result.kind === 'view' || result.viewId !== activeViewId) {
        // switchView flushes the current canvas first and aborts on failure,
        // so jumping to a search result can never drop unsaved edits.
        const switched = await switchView(result.viewId);
        if (!switched) {
          toast.error(m.toast_view_switch_save_failed());
          return;
        }
        if (result.kind !== 'view') {
          setPendingSearchTarget({
            viewId: result.viewId,
            nodeId: result.nodeId,
            edgeId: result.edgeId,
          });
        }
        return;
      }

      locateInCurrentView(result);
    },
    [
      activeViewId,
      switchView,
      setPendingSearchTarget,
      locateInCurrentView,
      recordHistory,
      trimmedQuery,
      closeSearch,
    ]
  );

  const currentViewName =
    views.find((v) => v.id === activeViewId)?.name ?? activeViewId;

  const handlePickCard = useCallback(
    (card: RecentCard) => {
      const node = nodes.find((n) => n.id === card.id);
      handleSelect({
        id: `recent:${activeViewId}:${card.id}`,
        kind: card.kind,
        viewId: activeViewId,
        viewName: currentViewName,
        nodeId: card.id,
        title: card.title,
        excerpt: '',
        matchField: 'title',
        score: 0,
        position: node?.position,
      });
    },
    [nodes, activeViewId, currentViewName, handleSelect]
  );

  const handlePickCanvas = useCallback(
    (viewId: string) => {
      const view = views.find((v) => v.id === viewId);
      handleSelect({
        id: `view:${viewId}`,
        kind: 'view',
        viewId,
        viewName: view?.name ?? viewId,
        title: view?.name ?? viewId,
        excerpt: '',
        matchField: 'viewName',
        score: 0,
      });
    },
    [views, handleSelect]
  );

  // Cmd/Ctrl+N: close search and open the canvas create menu. Mirrors the
  // global shortcut, which is otherwise swallowed while the search input holds
  // focus.
  const handleCreate = useCallback(() => {
    closeSearch();
    setCreateMenuOpen(true);
  }, [closeSearch, setCreateMenuOpen]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        setOpen(true);
        return;
      }
      closeSearch();
    },
    [closeSearch, setOpen]
  );

  const activateEmptyItem = useCallback(
    (item: EmptyItem) => {
      if (item.type === 'history') {
        setQuery(item.entry);
        inputRef.current?.focus();
        return;
      }
      if (item.type === 'card') {
        handlePickCard(item.card);
        return;
      }
      handlePickCanvas(item.canvas.id);
    },
    [setQuery, handlePickCard, handlePickCanvas]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreate();
        return;
      }

      // Navigate either the search results or the empty-state rows depending on
      // whether a query is active.
      if (navLength === 0) {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(Math.min(activeIndex + 1, navLength - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(Math.max(activeIndex - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (trimmedQuery) {
          const item = visibleResults[activeIndex];
          if (item) {
            handleSelect(item);
          }
        } else {
          const item = emptyItems[activeIndex];
          if (item) {
            activateEmptyItem(item);
          }
        }
      }
    },
    [
      trimmedQuery,
      visibleResults,
      emptyItems,
      activeIndex,
      handleSelect,
      activateEmptyItem,
      handleCreate,
      navLength,
      setActiveIndex,
    ]
  );

  // Labels come from locale-aware functions and must refresh with renders.
  // react-doctor-disable-next-line react-doctor/prefer-module-scope-static-value
  const filterChips: { id: SearchFilter; label: string }[] = [
    { id: 'all', label: m.search_filter_all() },
    { id: 'notes', label: m.search_filter_notes() },
    { id: 'folders', label: m.search_filter_folders() },
    { id: 'links', label: m.search_filter_links() },
    { id: 'images', label: m.search_filter_images() },
  ];

  // Running counter assigning each visible row its flat navigation index while
  // rendering grouped output.
  let visibleCursor = 0;

  return (
    <Dialog.Root onOpenChange={handleOpenChange} open={open}>
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
              className="flex-1 bg-transparent text-base text-gray-900 outline-hidden placeholder:text-gray-400 dark:text-gray-100"
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
                    ? 'bg-accent-softer font-medium text-accent-strong'
                    : 'text-gray-500 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                }`}
                key={chip.id}
                onClick={() => {
                  dispatchSearchUi({ type: 'setFilter', filter: chip.id });
                }}
                role="tab"
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div
            className="max-h-[55vh] flex-1 overflow-y-auto"
            data-testid="search-results"
            ref={listRef}
          >
            {error ? (
              <div className="px-4 py-6 text-red-500 text-sm">
                Search failed: {error}
              </div>
            ) : null}

            {error || trimmedQuery ? null : (
              <SearchEmptyState
                activeIndex={activeIndex}
                activeViewId={activeViewId}
                canvases={views}
                history={history}
                onClearHistory={clearHistory}
                onHover={setActiveIndex}
                onPickCanvas={handlePickCanvas}
                onPickCard={handlePickCard}
                onPickHistory={(entry) => {
                  setQuery(entry);
                  inputRef.current?.focus();
                }}
                onRemoveHistory={removeHistory}
                recentCards={recentCards}
              />
            )}

            {!error &&
            trimmedQuery &&
            filteredResults.length === 0 &&
            !isLoading ? (
              <div className="px-4 py-10 text-center text-gray-500 text-sm dark:text-gray-400">
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

            {!error && trimmedQuery
              ? groups.map((group) => {
                  const collapsed = collapsedGroups.has(group.viewId);
                  return (
                    <div key={group.viewId}>
                      <button
                        aria-expanded={!collapsed}
                        aria-label={
                          collapsed
                            ? m.search_group_expand()
                            : m.search_group_collapse()
                        }
                        className="flex w-full items-center gap-1.5 bg-gray-50/60 px-4 py-1.5 text-gray-500 text-xs hover:bg-black/5 dark:bg-neutral-900/40 dark:text-gray-400 dark:hover:bg-white/5"
                        onClick={() => {
                          toggleGroup(group.viewId);
                        }}
                        type="button"
                      >
                        {collapsed ? (
                          <ChevronRight aria-hidden size={12} />
                        ) : (
                          <ChevronDown aria-hidden size={12} />
                        )}
                        <span className="truncate font-medium">
                          {group.viewName}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {group.results.length}
                        </span>
                      </button>
                      {collapsed
                        ? null
                        : group.results.map((r) => {
                            const index = visibleCursor++;
                            return (
                              <ResultRow
                                active={index === activeIndex}
                                index={index}
                                key={r.id}
                                onClick={() => {
                                  handleSelect(r);
                                }}
                                onMouseEnter={() => {
                                  setActiveIndex(index);
                                }}
                                query={trimmedQuery}
                                result={r}
                              />
                            );
                          })}
                    </div>
                  );
                })
              : null}
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
  index,
  query,
  onClick,
  onMouseEnter,
}: {
  result: SearchResult;
  active: boolean;
  index: number;
  query: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const Icon = iconFor(result.kind, result.widgetKind);
  const title = result.title || 'Untitled';
  return (
    <button
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-hidden transition-colors ${
        active
          ? 'bg-accent-softer text-accent-strong'
          : 'text-gray-800 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5'
      }`}
      data-result-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      type="button"
    >
      <Icon
        aria-hidden
        className="shrink-0 text-gray-400 dark:text-gray-500"
        size={18}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {highlightMatches(title, query)}
        </div>
        <div className="truncate text-gray-500 text-xs dark:text-gray-400">
          {highlightMatches(result.excerpt, query)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-gray-500 text-xs dark:text-gray-400">
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
