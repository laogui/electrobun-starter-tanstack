import type { ReactFlowInstance } from '@xyflow/react';
import { Folder, Library, Search, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { openFocusedById } from '@/lib/canvasFocus';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';
import { LibraryCard } from './LibraryCard';
import {
  type LibraryGroup,
  type LibraryItem,
  type LibrarySortKey,
  useLibraryData,
} from './useLibraryData';

interface LibraryPopupProps {
  rfInstance: React.RefObject<ReactFlowInstance<any, any> | null>;
}

const SORT_OPTIONS: Array<{ value: LibrarySortKey; label: () => string }> = [
  { value: 'recent', label: () => m.library_sort_recent() },
  { value: 'name', label: () => m.library_sort_name() },
  { value: 'created', label: () => m.library_sort_created() },
];

const RECENT_RECOMMENDATION_LIMIT = 6;

function flattenItems(groups: LibraryGroup[]): LibraryItem[] {
  return groups.flatMap((group) => group.items);
}

export function LibraryPopup({ rfInstance }: LibraryPopupProps) {
  const open = useCanvasStore((s) => s.libraryOpen);
  const setLibraryOpen = useCanvasStore((s) => s.setLibraryOpen);
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySortKey>('recent');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { groups, totalItems } = useLibraryData({ query, sort });
  // Always-on recent list (ignores the active query) so the empty-search state
  // can recommend something to fall back to.
  const { groups: recentGroups } = useLibraryData({ sort: 'recent' });

  const flatItems = useMemo(() => flattenItems(groups), [groups]);
  const recentItems = useMemo(
    () =>
      flattenItems(recentGroups)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, RECENT_RECOMMENDATION_LIMIT),
    [recentGroups]
  );
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    flatItems.forEach((item, idx) => {
      map.set(item.id, idx);
    });
    return map;
  }, [flatItems]);
  const focusedId =
    focusedIndex >= 0 && focusedIndex < flatItems.length
      ? flatItems[focusedIndex]?.id
      : undefined;

  const close = useCallback(() => {
    setLibraryOpen(false);
  }, [setLibraryOpen]);

  useEffect(() => {
    if (!open) {
      // Reset search/selection when closing so the next open starts clean.
      setQuery('');
      setFocusedIndex(-1);
    }
  }, [open]);

  // Changing the query invalidates the previous keyboard selection.
  const handleQueryChange = useCallback((next: string) => {
    setQuery(next);
    setFocusedIndex(-1);
  }, []);

  const handleEscapeKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      handleEscapeKey(e);
    };
    globalThis.addEventListener('keydown', handleKey, true);
    return () => {
      globalThis.removeEventListener('keydown', handleKey, true);
    };
  }, [open]);

  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      if (item.data.detached) {
        // Detached notes don't have a canvas position. Offer a quick "place"
        // action via toast; keep the popup itself closed for consistency with
        // the canvas-focus path below.
        close();
        toast(m.library_detached_toast(), {
          action: {
            label: m.library_detached_pin_action(),
            onClick: () => {
              const center = {
                x: window.innerWidth / 2 - 175,
                y: window.innerHeight / 2 - 225,
              };
              pinNoteToCanvas(item.nodeId, center);
              openFocusedById({
                nodeId: item.nodeId,
                rfInstance: rfInstance.current,
              }).catch(() => {
                /* swallow — the toast is the user-facing entry point */
              });
            },
          },
        });
        return;
      }

      // Folder children: first-version behavior (plan §5.7 option A) — open
      // the parent folder drill-down; the user picks the specific child from
      // inside the folder view.
      const targetNodeId = item.folderId ?? item.nodeId;
      close();
      openFocusedById({
        nodeId: targetNodeId,
        rfInstance: rfInstance.current,
      }).catch(() => {
        /* swallow — opening focus is best-effort */
      });
    },
    [close, pinNoteToCanvas, rfInstance]
  );

  const handleCardFocus = useCallback(
    (item: LibraryItem) => {
      setFocusedIndex(indexById.get(item.id) ?? -1);
    },
    [indexById]
  );

  // Keyboard navigation (D2): ↑/↓ move through the flattened result list,
  // Enter activates the focused card, ⌘F / Ctrl+F jumps back to the search box.
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === 'ArrowDown') {
        if (flatItems.length === 0) {
          return;
        }
        e.preventDefault();
        setFocusedIndex((i) => Math.min(flatItems.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        if (flatItems.length === 0) {
          return;
        }
        e.preventDefault();
        setFocusedIndex((i) => (i <= 0 ? 0 : i - 1));
        return;
      }
      if (e.key === 'Enter') {
        const item = flatItems[focusedIndex];
        if (item) {
          e.preventDefault();
          handleItemClick(item);
        }
      }
    },
    [flatItems, focusedIndex, handleItemClick]
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onKeyDown={handleContainerKeyDown}
          role="dialog"
          transition={{ duration: 0.18 }}
        >
          <motion.button
            aria-label={m.library_close()}
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={close}
            type="button"
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex max-h-[72vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.25)] ring-1 ring-black/[0.04] dark:bg-neutral-900 dark:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)] dark:ring-white/[0.06]"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <LibraryHeader
              onClose={close}
              onQueryChange={handleQueryChange}
              onSortChange={setSort}
              query={query}
              searchInputRef={searchInputRef}
              sort={sort}
              totalItems={totalItems}
            />
            <LibraryBody
              focusedId={focusedId}
              groups={groups}
              onClearSearch={() => {
                handleQueryChange('');
                searchInputRef.current?.focus();
              }}
              onItemClick={handleItemClick}
              onItemFocus={handleCardFocus}
              query={query}
              recentItems={recentItems}
              totalItems={totalItems}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

interface LibraryHeaderProps {
  onClose: () => void;
  onQueryChange: (next: string) => void;
  onSortChange: (next: LibrarySortKey) => void;
  query: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  sort: LibrarySortKey;
  totalItems: number;
}

function sortLabel(value: LibrarySortKey): string {
  return SORT_OPTIONS.find((opt) => opt.value === value)?.label() ?? value;
}

function LibraryHeader({
  onClose,
  onQueryChange,
  onSortChange,
  query,
  searchInputRef,
  sort,
  totalItems,
}: LibraryHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-gray-100 border-b px-5 py-4 dark:border-neutral-800">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <Library size={15} strokeWidth={1.75} />
        </span>
        <div className="flex flex-col">
          <h2 className="font-semibold text-[15px] text-gray-900 leading-tight tracking-tight dark:text-gray-100">
            {m.library_title()}
          </h2>
          <span className="text-2xs text-gray-400 dark:text-neutral-500">
            {m.library_item_count({ count: totalItems })}
          </span>
        </div>
      </div>
      <div className="ml-2 flex h-9 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 transition-colors focus-within:border-gray-300 focus-within:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus-within:border-neutral-600 dark:focus-within:bg-neutral-800">
        <Search
          aria-hidden
          className="text-gray-400 dark:text-neutral-500"
          size={15}
        />
        <input
          aria-label={m.library_search_placeholder()}
          className="h-full flex-1 bg-transparent text-[13px] text-gray-900 outline-hidden placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-neutral-500"
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={m.library_search_placeholder()}
          ref={searchInputRef}
          type="text"
          value={query}
        />
      </div>
      <Select
        items={SORT_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label(),
        }))}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onSortChange(next as LibrarySortKey);
          }
        }}
        value={sort}
      >
        <SelectTrigger
          aria-label={m.library_sort_label()}
          className="h-9 w-auto min-w-[136px] shrink-0 px-3 text-[12px]"
        >
          <SelectValue>{sortLabel(sort)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} label={opt.label()} value={opt.value}>
              {opt.label()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        aria-label={m.library_close()}
        className="flex size-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        onClick={onClose}
        type="button"
      >
        <X size={15} />
      </button>
    </div>
  );
}

interface LibraryBodyProps {
  focusedId?: string;
  groups: LibraryGroup[];
  onClearSearch: () => void;
  onItemClick: (item: LibraryItem) => void;
  onItemFocus: (item: LibraryItem) => void;
  query: string;
  recentItems: LibraryItem[];
  totalItems: number;
}

function LibraryBody({
  focusedId,
  groups,
  onClearSearch,
  onItemClick,
  onItemFocus,
  query,
  recentItems,
  totalItems,
}: LibraryBodyProps) {
  if (totalItems === 0) {
    const hasQuery = query.trim().length > 0;
    if (!hasQuery) {
      return (
        <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-gray-400 text-sm dark:text-neutral-500">
          {m.library_empty()}
        </div>
      );
    }
    return (
      <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-gray-500 text-sm dark:text-neutral-400">
            {m.library_empty_search({ query: query.trim() })}
          </p>
          <button
            className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-[12px] text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            onClick={onClearSearch}
            type="button"
          >
            {m.library_clear_search()}
          </button>
        </div>
        {recentItems.length > 0 ? (
          <section className="mt-8">
            <h3 className="mb-3 px-0.5 font-semibold text-[12px] text-gray-700 uppercase tracking-wide dark:text-neutral-300">
              {m.library_recent_heading()}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
              {recentItems.map((item) => (
                <LibraryCard item={item} key={item.id} onClick={onItemClick} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }
  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5">
      {groups.map((group) => (
        <LibraryGroupSection
          focusedId={focusedId}
          group={group}
          key={group.id}
          onItemClick={onItemClick}
          onItemFocus={onItemFocus}
        />
      ))}
    </div>
  );
}

interface LibraryGroupSectionProps {
  focusedId?: string;
  group: LibraryGroup;
  onItemClick: (item: LibraryItem) => void;
  onItemFocus: (item: LibraryItem) => void;
}

function LibraryGroupSection({
  focusedId,
  group,
  onItemClick,
  onItemFocus,
}: LibraryGroupSectionProps) {
  const heading = headingFor(group);
  return (
    <section className="mb-7 last:mb-0">
      <div className="mb-3 flex items-center gap-2 px-0.5">
        {group.kind === 'folder' ? (
          <Folder
            aria-hidden
            className="text-gray-400 dark:text-neutral-500"
            size={13}
            strokeWidth={1.75}
          />
        ) : null}
        <h3 className="font-semibold text-[12px] text-gray-700 uppercase tracking-wide dark:text-neutral-300">
          {heading}
        </h3>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 font-medium text-3xs text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
          {group.items.length}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
        {group.items.map((item) => (
          <LibraryCard
            isFocused={item.id === focusedId}
            item={item}
            key={item.id}
            onClick={onItemClick}
            onFocus={onItemFocus}
          />
        ))}
      </div>
    </section>
  );
}

function headingFor(group: LibraryGroup): string {
  if (group.kind === 'ungrouped') {
    return m.library_ungrouped();
  }
  if (group.kind === 'detached') {
    return m.library_detached();
  }
  return group.name.trim().length > 0 ? group.name : m.library_untitled();
}
