import { Dialog } from '@base-ui/react/dialog';
import type { ReactFlowInstance } from '@xyflow/react';
import {
  ArrowRight,
  FileText,
  Folder,
  Group,
  ImageIcon,
  Layers,
  Link2,
  Paperclip,
  Search,
  StickyNote,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSearch } from '@/hooks/useSearch';
import { isRpcAvailable, rpcSaveManifest } from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import type { SearchResult } from '@/lib/searchTypes';
import { useCanvasStore } from '@/store/canvasStore';

interface SearchDialogProps {
  /**
   * Optional in document mode — search results that match nodes will route to
   * the document editor via `selectedDocumentId` instead of `setCenter`.
   */
  rfInstance?: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

export function SearchDialog({ rfInstance }: SearchDialogProps) {
  const open = useCanvasStore((s) => s.searchOpen);
  const setOpen = useCanvasStore((s) => s.setSearchOpen);
  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const setActiveView = useCanvasStore((s) => s.setActiveView);
  const setPendingSearchTarget = useCanvasStore(
    (s) => s.setPendingSearchTarget
  );
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setSelectedDocumentId = useCanvasStore((s) => s.setSelectedDocumentId);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const { query, setQuery, results, isLoading, error, fallback } = useSearch();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open, setQuery]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, []);

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
      setOpen(false);

      const layoutMode = useCanvasStore.getState().layoutMode;

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
          // Decision 20: document mode opens the right-side editor directly.
          // Pre-set the document selection now; nodes from the target view will
          // become available after hydrate.
          if (layoutMode === 'document' && result.nodeId) {
            setSelectedDocumentId(`node:${result.nodeId}`);
          }
        }
        setActiveView(result.viewId);
        return;
      }

      // Same-view selection — document mode routes to the editor, canvas mode
      // pans / zooms to the node.
      if (layoutMode === 'document' && result.nodeId) {
        setSelectedDocumentId(`node:${result.nodeId}`);
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
      setSelectedDocumentId,
    ]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (results.length === 0) {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[activeIndex];
        if (item) {
          handleSelect(item);
        }
      }
    },
    [results, activeIndex, handleSelect]
  );

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
              placeholder="Search notes, stickies, folders, views…"
              ref={inputRef}
              type="text"
              value={query}
            />
            {isLoading ? (
              <span className="text-gray-400 text-xs">…</span>
            ) : null}
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

            {!error && query.trim() && results.length === 0 && !isLoading ? (
              <div className="px-4 py-10 text-center text-gray-400 text-sm dark:text-gray-500">
                No matches
              </div>
            ) : null}

            {results.map((r, idx) => (
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
