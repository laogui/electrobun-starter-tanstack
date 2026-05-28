import { useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useTags } from '@/hooks/useTags';
import { rpcDeleteTag, rpcRenameTag } from '@/lib/rpc';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

import { DeleteTagConfirmDialog } from './DeleteTagConfirmDialog';

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
  const queryClient = useQueryClient();

  const { data: tags = [], isLoading } = useTags();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDeleteTag, setPendingDeleteTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingTag !== null) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTag]);

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
      if (
        activeFilter &&
        activeFilter.toLowerCase() === oldName.toLowerCase()
      ) {
        setActiveFilter(next);
      }
      toast(m.toast_tag_renamed({ name: next }));
    }
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['node-metadata'] });
  }, [
    editingTag,
    editingName,
    cancelRename,
    activeFilter,
    setActiveFilter,
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
      if (activeFilter && activeFilter.toLowerCase() === target.toLowerCase()) {
        setActiveFilter(null);
      }
      toast(m.toast_tag_deleted({ name: target }));
    }
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['node-metadata'] });
  }, [pendingDeleteTag, activeFilter, setActiveFilter, queryClient]);

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
              const isEditing = editingTag === t.name;

              if (isEditing) {
                return (
                  <div
                    className="flex items-center gap-1 rounded-md px-2 py-1"
                    key={t.name}
                  >
                    <input
                      className="min-w-0 flex-1 rounded-md border border-border bg-white px-2 py-1 text-[13px] outline-none focus:border-primary dark:bg-neutral-800"
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
                      ref={inputRef}
                      type="text"
                      value={editingName}
                    />
                    <button
                      aria-label={m.tags_sidebar_rename_confirm()}
                      className="rounded p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                      onClick={confirmRename}
                      type="button"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      aria-label={m.tags_sidebar_rename_cancel()}
                      className="rounded p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
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
                    'group flex items-center gap-1 rounded-md text-[13px] transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-black/5 dark:hover:bg-white/10'
                  )}
                  key={t.name}
                >
                  <button
                    aria-label={
                      isActive
                        ? m.tags_sidebar_active_aria({ tag: t.name })
                        : t.name
                    }
                    aria-pressed={isActive}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left"
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
                  <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      aria-label={m.tags_sidebar_rename_aria({ tag: t.name })}
                      className={cn(
                        'rounded p-1 transition-colors',
                        isActive
                          ? 'text-primary-foreground/80 hover:bg-white/15'
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
                        'rounded p-1 transition-colors',
                        isActive
                          ? 'text-primary-foreground/80 hover:bg-white/15'
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

      <DeleteTagConfirmDialog
        onCancel={() => {
          setPendingDeleteTag(null);
        }}
        onConfirm={confirmDelete}
        open={pendingDeleteTag !== null}
        tagName={pendingDeleteTag ?? ''}
      />
    </motion.div>
  );
}
