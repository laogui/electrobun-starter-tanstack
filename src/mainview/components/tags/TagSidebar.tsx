import { useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { toast } from 'sonner';

import { useTags } from '@/hooks/useTags';
import { rpcDeleteTag, rpcRenameTag } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

import { DeleteTagConfirmDialog } from './DeleteTagConfirmDialog';

/**
 * Right-side, non-modal tool palette listing every tag in the workspace with
 * note counts. Clicking a tag toggles it in the canvas store's
 * `activeTagFilters` list (OR semantics), which dims any card that does not
 * carry at least one of the selected tags. The panel does not block canvas
 * interaction — users can pan/zoom while it is open and watch the filter
 * update live. Closing the panel (X, Esc, or re-clicking the FAB) clears
 * every active filter, so a dimmed canvas always has a visible source.
 */
export function TagSidebar() {
  const open = useCanvasStore((s) => s.tagSidebarOpen);
  return <AnimatePresence>{open ? <TagSidebarBody /> : null}</AnimatePresence>;
}

// The sidebar body keeps filter state, rename flow, and delete confirmation together.
// react-doctor-disable-next-line react-doctor/no-giant-component
function TagSidebarBody() {
  const setOpen = useCanvasStore((s) => s.setTagSidebarOpen);
  const activeFilters = useCanvasStore((s) => s.activeTagFilters);
  const setActiveFilters = useCanvasStore((s) => s.setActiveTagFilters);
  const toggleFilter = useCanvasStore((s) => s.toggleTagFilter);
  const clearFilters = useCanvasStore((s) => s.clearTagFilters);
  const queryClient = useQueryClient();

  // Lower-case set for cheap O(1) "is this tag selected?" lookups inside the
  // render loop without rebuilding it for every row.
  const activeSet = new Set(activeFilters.map((t) => t.toLowerCase()));

  const { data: tags = [], isLoading } = useTags();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteTag, setPendingDeleteTag] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  // Escape closes the palette when no inline rename is in progress and no
  // confirm dialog is open, mirroring the dismissal model of other side
  // tools without trapping focus or blocking the canvas.
  const handleEscapeKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'Escape') {
      return;
    }
    if (editingTag !== null || pendingDeleteTag !== null) {
      return;
    }
    close();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleEscapeKey(e);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleTagClick = useCallback(
    (tag: string) => {
      toggleFilter(tag);
    },
    [toggleFilter]
  );

  const clearFilter = useCallback(() => {
    clearFilters();
  }, [clearFilters]);

  const startRename = useCallback((tag: string) => {
    setEditingTag(tag);
    setEditingName(tag);
  }, []);

  const cancelRename = useCallback(() => {
    setEditingTag(null);
    setEditingName('');
  }, []);

  const confirmRename = useCallback(async () => {
    if (editingTag === null) {
      return;
    }
    const next = editingName.trim();
    if (!next || next.toLowerCase() === editingTag.toLowerCase()) {
      cancelRename();
      return;
    }
    const oldName = editingTag;
    cancelRename();
    const result = await rpcRenameTag(oldName, next);
    if (result && result.updated > 0) {
      // If the old tag was an active filter, swap it for the new name in
      // place so the filter survives the rename.
      const needle = oldName.toLowerCase();
      if (activeFilters.some((t) => t.toLowerCase() === needle)) {
        setActiveFilters(
          activeFilters.map((t) => (t.toLowerCase() === needle ? next : t))
        );
      }
      toast(m.toast_tag_renamed({ name: next }));
    }
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['node-metadata'] });
  }, [
    editingTag,
    editingName,
    cancelRename,
    activeFilters,
    setActiveFilters,
    queryClient,
  ]);

  const confirmDelete = useCallback(async () => {
    const target = pendingDeleteTag;
    setPendingDeleteTag(null);
    if (target === null) {
      return;
    }
    const result = await rpcDeleteTag(target);
    if (result && result.updated > 0) {
      const needle = target.toLowerCase();
      if (activeFilters.some((t) => t.toLowerCase() === needle)) {
        setActiveFilters(
          activeFilters.filter((t) => t.toLowerCase() !== needle)
        );
      }
      toast(m.toast_tag_deleted({ name: target }));
    }
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['node-metadata'] });
  }, [pendingDeleteTag, activeFilters, setActiveFilters, queryClient]);

  return (
    <>
      <motion.aside
        animate={{ x: 0, opacity: 1 }}
        aria-label={m.tags_sidebar_title()}
        className="fixed inset-y-0 right-0 z-50 flex w-[280px] flex-col border-black/5 border-l bg-white/95 shadow-xl backdrop-blur-sm dark:border-white/5 dark:bg-neutral-900/95"
        exit={{ x: 300, opacity: 0 }}
        initial={{ x: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
      >
        {/* h-10 matches the app titlebar so the title sits in the window chrome row */}
        <header className="electrobun-webkit-app-region-drag flex h-10 shrink-0 items-center gap-2 border-black/5 border-b px-4 dark:border-white/5">
          <TagIcon
            aria-hidden
            className="text-muted-foreground"
            size={14}
            strokeWidth={1.8}
          />
          <h2 className="flex-1 font-semibold text-[13px] text-gray-800 dark:text-gray-100">
            {m.tags_sidebar_title()}
          </h2>
          <button
            aria-label={m.tags_sidebar_close()}
            className="electrobun-webkit-app-region-no-drag flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            onClick={close}
            type="button"
          >
            <X size={14} />
          </button>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
          {(() => {
            if (isLoading) {
              return null;
            }
            if (tags.length === 0) {
              return (
                <div className="flex flex-col items-center gap-2 px-3 py-12 text-center text-muted-foreground">
                  <TagIcon
                    aria-hidden
                    className="opacity-40"
                    size={28}
                    strokeWidth={1.2}
                  />
                  <p className="text-xs">{m.tags_sidebar_empty()}</p>
                </div>
              );
            }
            return tags.map((t) => {
              const isActive = activeSet.has(t.name.toLowerCase());
              const isEditing = editingTag === t.name;

              if (isEditing) {
                return (
                  <div
                    className="flex items-center gap-1 rounded-md px-1.5 py-1"
                    key={t.name}
                  >
                    <input
                      aria-label={m.a11y_tag_name()}
                      className="min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 py-1 text-[13px] outline-hidden focus:border-primary dark:border-white/10 dark:bg-neutral-800"
                      onChange={(e) => {
                        setEditingName(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          confirmRename();
                        } else if (e.key === 'Escape') {
                          cancelRename();
                        }
                      }}
                      ref={(node) => {
                        node?.focus();
                        node?.select();
                      }}
                      type="text"
                      value={editingName}
                    />
                    <button
                      aria-label={m.tags_sidebar_rename_confirm()}
                      className="flex size-6 items-center justify-center rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                      onClick={confirmRename}
                      type="button"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      aria-label={m.tags_sidebar_rename_cancel()}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
                      onClick={cancelRename}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  className={cn(
                    'group relative flex items-center gap-1 rounded-md text-[13px] transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary dark:bg-primary/15'
                      : 'text-foreground hover:bg-black/5 dark:hover:bg-white/10'
                  )}
                  key={t.name}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-sm bg-primary"
                    />
                  ) : null}
                  <button
                    aria-label={
                      isActive
                        ? m.tags_sidebar_active_aria({ tag: t.name })
                        : t.name
                    }
                    aria-pressed={isActive}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-1.5 text-left"
                    onClick={() => handleTagClick(t.name)}
                    type="button"
                  >
                    {isActive ? (
                      <Check
                        aria-hidden
                        className="shrink-0 text-primary"
                        size={12}
                        strokeWidth={2.5}
                      />
                    ) : null}
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate',
                        isActive && 'font-medium'
                      )}
                    >
                      {t.name}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 text-xs tabular-nums',
                        isActive ? 'text-primary/70' : 'text-muted-foreground'
                      )}
                    >
                      {t.count}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      aria-label={m.tags_sidebar_rename_aria({ tag: t.name })}
                      className={cn(
                        'flex size-6 items-center justify-center rounded transition-colors',
                        isActive
                          ? 'text-primary/70 hover:bg-primary/15 hover:text-primary'
                          : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(t.name);
                      }}
                      type="button"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      aria-label={m.tags_sidebar_delete_aria({ tag: t.name })}
                      className={cn(
                        'flex size-6 items-center justify-center rounded transition-colors',
                        isActive
                          ? 'text-primary/70 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20'
                          : 'text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteTag(t.name);
                      }}
                      type="button"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>

        {activeFilters.length > 0 ? (
          <footer className="flex items-center gap-2 border-black/5 border-t bg-primary/5 px-3 py-2 dark:border-white/5 dark:bg-primary/10">
            <span className="flex-1 truncate text-[12px] text-muted-foreground">
              {m.tags_sidebar_selected_count({
                count: String(activeFilters.length),
              })}
            </span>
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
              onClick={clearFilter}
              type="button"
            >
              <X size={12} />
              {m.tags_sidebar_clear_filter()}
            </button>
          </footer>
        ) : null}
      </motion.aside>

      <DeleteTagConfirmDialog
        onCancel={() => {
          setPendingDeleteTag(null);
        }}
        onConfirm={confirmDelete}
        open={pendingDeleteTag !== null}
        tagName={pendingDeleteTag ?? ''}
      />
    </>
  );
}
