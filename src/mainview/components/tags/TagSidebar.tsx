import { Tag as TagIcon, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback } from 'react';

import { useTags } from '@/hooks/useTags';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

/**
 * Right-side panel listing every tag in the workspace with note counts.
 * Clicking a tag sets `activeTagFilter` on the canvas store, which dims any
 * card that does not carry the tag. Clicking the active tag again clears
 * the filter; the dedicated "Clear filter" button does the same.
 */
export function TagSidebar() {
  const open = useCanvasStore((s) => s.tagSidebarOpen);
  return <AnimatePresence>{open ? <TagSidebarBody /> : null}</AnimatePresence>;
}

function TagSidebarBody() {
  const setOpen = useCanvasStore((s) => s.setTagSidebarOpen);
  const activeFilter = useCanvasStore((s) => s.activeTagFilter);
  const setActiveFilter = useCanvasStore((s) => s.setActiveTagFilter);

  const { data: tags = [], isLoading } = useTags();

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleTagClick = useCallback(
    (tag: string) => {
      if (activeFilter && activeFilter.toLowerCase() === tag.toLowerCase()) {
        setActiveFilter(null);
        return;
      }
      setActiveFilter(tag);
    },
    [activeFilter, setActiveFilter]
  );

  const clearFilter = useCallback(() => {
    setActiveFilter(null);
  }, [setActiveFilter]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-modal
      className="fixed inset-0 z-50"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      transition={{ duration: 0.18 }}
    >
      <motion.button
        aria-label={m.tags_sidebar_close()}
        className="absolute inset-0 cursor-default bg-black/20"
        onClick={close}
        type="button"
      />
      <motion.aside
        animate={{ x: 0 }}
        className="absolute top-0 right-0 flex h-full w-[280px] flex-col border-border/60 border-l bg-white shadow-2xl dark:bg-neutral-900"
        exit={{ x: 320 }}
        initial={{ x: 320 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <header className="flex items-center gap-2 border-border/60 border-b px-4 py-3">
          <TagIcon aria-hidden className="text-muted-foreground" size={14} />
          <h2 className="flex-1 font-semibold text-[13px] text-foreground">
            {m.tags_sidebar_title()}
          </h2>
          <button
            aria-label={m.tags_sidebar_close()}
            className="rounded p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={close}
            type="button"
          >
            <X size={14} />
          </button>
        </header>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
          {(() => {
            if (isLoading) {
              return null;
            }
            if (tags.length === 0) {
              return (
                <div className="px-3 py-8 text-center text-muted-foreground text-sm">
                  {m.tags_sidebar_empty()}
                </div>
              );
            }
            return tags.map((t) => {
              const isActive =
                activeFilter?.toLowerCase() === t.name.toLowerCase();
              return (
                <button
                  aria-label={
                    isActive
                      ? m.tags_sidebar_active_aria({ tag: t.name })
                      : t.name
                  }
                  aria-pressed={isActive}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-[13px] transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-black/5 dark:hover:bg-white/10'
                  )}
                  key={t.name}
                  onClick={() => handleTagClick(t.name)}
                  type="button"
                >
                  <span className="truncate">{t.name}</span>
                  <span
                    className={cn(
                      'shrink-0 text-xs tabular-nums',
                      isActive
                        ? 'text-primary-foreground/80'
                        : 'text-muted-foreground'
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              );
            });
          })()}
        </div>

        {activeFilter ? (
          <footer className="border-border/60 border-t p-2">
            <button
              className="w-full rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              onClick={clearFilter}
              type="button"
            >
              {m.tags_sidebar_clear_filter()}
            </button>
          </footer>
        ) : null}
      </motion.aside>
    </motion.div>
  );
}
