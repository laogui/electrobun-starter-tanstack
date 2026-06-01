import type { ReactFlowInstance } from '@xyflow/react';
import { ChevronDown, Folder, Library, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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

const SORT_OPTIONS: Array<{ key: LibrarySortKey; label: () => string }> = [
  { key: 'recent', label: () => m.library_sort_recent() },
  { key: 'name', label: () => m.library_sort_name() },
  { key: 'created', label: () => m.library_sort_created() },
];

export function LibraryPopup({ rfInstance }: LibraryPopupProps) {
  const open = useCanvasStore((s) => s.libraryOpen);
  const setLibraryOpen = useCanvasStore((s) => s.setLibraryOpen);
  const pinNoteToCanvas = useCanvasStore((s) => s.pinNoteToCanvas);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySortKey>('recent');
  const { groups, totalItems } = useLibraryData({ query, sort });

  const close = useCallback(() => {
    setLibraryOpen(false);
  }, [setLibraryOpen]);

  useEffect(() => {
    if (!open) {
      // Reset search when closing so the next open starts clean.
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    globalThis.addEventListener('keydown', handleKey, true);
    return () => {
      globalThis.removeEventListener('keydown', handleKey, true);
    };
  }, [open, close]);

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

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          animate={{ opacity: 1 }}
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
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
              onQueryChange={setQuery}
              onSortChange={setSort}
              query={query}
              sort={sort}
            />
            <LibraryBody
              groups={groups}
              onItemClick={handleItemClick}
              query={query}
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
  sort: LibrarySortKey;
}

function LibraryHeader({
  onClose,
  onQueryChange,
  onSortChange,
  query,
  sort,
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
        <h2 className="font-semibold text-[15px] text-gray-900 tracking-tight dark:text-gray-100">
          {m.library_title()}
        </h2>
      </div>
      <div className="ml-2 flex h-9 flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 transition-colors focus-within:border-gray-300 focus-within:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus-within:border-neutral-600 dark:focus-within:bg-neutral-800">
        <Search
          aria-hidden
          className="text-gray-400 dark:text-neutral-500"
          size={15}
        />
        <input
          aria-label={m.library_search_placeholder()}
          className="h-full flex-1 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-neutral-500"
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={m.library_search_placeholder()}
          type="text"
          value={query}
        />
      </div>
      <div className="relative">
        <select
          aria-label={m.library_sort_label()}
          className="h-9 appearance-none rounded-lg border border-gray-200 bg-white py-0 pr-8 pl-3 text-[12px] text-gray-700 outline-none transition-colors hover:border-gray-300 focus:border-gray-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-neutral-600 dark:hover:border-neutral-600"
          onChange={(e) => onSortChange(e.target.value as LibrarySortKey)}
          value={sort}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label()}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 dark:text-neutral-500"
          size={13}
        />
      </div>
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
  groups: LibraryGroup[];
  onItemClick: (item: LibraryItem) => void;
  query: string;
  totalItems: number;
}

function LibraryBody({
  groups,
  onItemClick,
  query,
  totalItems,
}: LibraryBodyProps) {
  if (totalItems === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center text-gray-400 text-sm dark:text-neutral-500">
        {query.trim().length > 0
          ? m.library_empty_search({ query: query.trim() })
          : m.library_empty()}
      </div>
    );
  }
  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5">
      {groups.map((group) => (
        <LibraryGroupSection
          group={group}
          key={group.id}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  );
}

interface LibraryGroupSectionProps {
  group: LibraryGroup;
  onItemClick: (item: LibraryItem) => void;
}

function LibraryGroupSection({ group, onItemClick }: LibraryGroupSectionProps) {
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
        <h3 className="font-semibold text-[12px] text-gray-700 uppercase tracking-wider dark:text-neutral-300">
          {heading}
        </h3>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 font-medium text-[10px] text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">
          {group.items.length}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
        {group.items.map((item) => (
          <LibraryCard item={item} key={item.id} onClick={onItemClick} />
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
