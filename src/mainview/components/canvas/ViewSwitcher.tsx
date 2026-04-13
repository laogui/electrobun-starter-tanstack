import {
  Check,
  ChevronUp,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isRpcAvailable,
  loadCanvas,
  rpcCreateView,
  rpcDeleteView,
  rpcListViews,
  rpcRenameView,
  rpcSaveManifest,
} from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

export function ViewSwitcher() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);
  const setViews = useCanvasStore((s) => s.setViews);
  const setActiveView = useCanvasStore((s) => s.setActiveView);
  const hydrate = useCanvasStore((s) => s.hydrate);

  // Load views list on mount
  useEffect(() => {
    void (async () => {
      const data = await rpcListViews();
      if (data === null) return;
      setViews(
        (data.views as Array<{ id: string; name: string }>).map((v) => ({
          id: v.id,
          name: v.name,
        }))
      );
    })();
  }, [setViews]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as HTMLElement)
      ) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  // Focus input when editing
  useEffect(() => {
    if (editingId !== null && inputRef.current !== null) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleSwitchView = useCallback(
    async (viewId: string) => {
      if (viewId === activeViewId) {
        setOpen(false);
        return;
      }

      // Flush current canvas before switching
      const rpcAvailable = await isRpcAvailable();
      if (rpcAvailable) {
        const { nodes, edges } = useCanvasStore.getState();
        const sanitized = sanitizeForPersistence(nodes, edges);
        await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
      }

      await setActiveView(viewId);

      // Load the new canvas
      const data = (await loadCanvas(viewId)) as {
        nodes: import('@xyflow/react').Node[];
        edges: import('@xyflow/react').Edge[];
      } | null;
      if (data !== null && data.nodes.length > 0) {
        hydrate(data.nodes, data.edges);
      } else {
        hydrate([], []);
      }

      setOpen(false);
    },
    [activeViewId, setActiveView, hydrate]
  );

  const handleCreate = useCallback(async () => {
    const name = `Canvas ${String(views.length + 1)}`;
    const result = (await rpcCreateView(name)) as {
      id: string;
      name: string;
    } | null;
    if (result === null) return;

    const newViews = [...views, { id: result.id, name: result.name }];
    setViews(newViews);
    await handleSwitchView(result.id);
  }, [views, setViews, handleSwitchView]);

  const handleDelete = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) return;
      const result = (await rpcDeleteView(viewId)) as {
        success: boolean;
        activeViewId?: string;
      } | null;
      if (result === null || !result.success) return;

      const newViews = views.filter((v) => v.id !== viewId);
      setViews(newViews);

      if (viewId === activeViewId && result.activeViewId !== undefined) {
        await handleSwitchView(result.activeViewId);
      }
    },
    [views, activeViewId, setViews, handleSwitchView]
  );

  const handleRenameStart = useCallback(
    (viewId: string) => {
      const view = views.find((v) => v.id === viewId);
      if (!view) return;
      setEditingId(viewId);
      setEditingName(view.name);
    },
    [views]
  );

  const handleRenameConfirm = useCallback(async () => {
    if (editingId === null || editingName.trim() === '') {
      setEditingId(null);
      return;
    }
    await rpcRenameView(editingId, editingName.trim());
    setViews(
      views.map((v) =>
        v.id === editingId ? { ...v, name: editingName.trim() } : v
      )
    );
    setEditingId(null);
  }, [editingId, editingName, views, setViews]);

  const handleRenameCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  const activeView = views.find((v) => v.id === activeViewId);
  const nodeCount = useCanvasStore((s) => s.nodes.length);

  return (
    <div
      ref={menuRef}
      className='fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-3'
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            className='mb-1 min-w-[260px] overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md dark:bg-neutral-800/90'
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          >
            {views.map((view, index) => (
              <div
                key={view.id}
                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  view.id === activeViewId
                    ? 'font-semibold text-gray-900 dark:text-white'
                    : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5'
                }${
                  index < views.length - 1
                    ? 'border-b border-gray-100 dark:border-neutral-700'
                    : ''
                }`}
              >
                {editingId === view.id ? (
                  <div className='flex flex-1 items-center gap-2'>
                    <input
                      ref={inputRef}
                      type='text'
                      className='flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-blue-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white'
                      value={editingName}
                      onChange={(e) => {
                        setEditingName(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameConfirm();
                        if (e.key === 'Escape') handleRenameCancel();
                      }}
                    />
                    <button
                      type='button'
                      className='rounded-sm p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                      aria-label='Confirm rename'
                      onClick={handleRenameConfirm}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type='button'
                      className='rounded-sm p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-600'
                      aria-label='Cancel rename'
                      onClick={handleRenameCancel}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type='button'
                      className='flex flex-1 items-center gap-3 text-left'
                      onClick={async () => {
                        await handleSwitchView(view.id);
                      }}
                    >
                      <Layers size={16} className='shrink-0 opacity-50' />
                      <span className='truncate'>{view.name}</span>
                    </button>
                    <div className='flex items-center gap-1'>
                      <button
                        type='button'
                        className='rounded-sm p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200 [div:hover>&]:opacity-100'
                        aria-label={`Rename ${view.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameStart(view.id);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      {views.length > 1 ? (
                        <button
                          type='button'
                          className='rounded-sm p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 [div:hover>&]:opacity-100'
                          aria-label={`Delete ${view.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(view.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* New canvas button */}
            <div className='border-t border-gray-100 dark:border-neutral-700'>
              <button
                type='button'
                className='flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-500 transition-colors hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
                onClick={handleCreate}
              >
                <Plus size={16} className='opacity-50' />
                {m.view_new_canvas()}
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Bottom bar trigger */}
      <div className='flex items-center gap-2'>
        <div className='rounded-xl bg-white/80 px-3 py-1.5 text-xs text-gray-400 shadow-sm backdrop-blur-md dark:bg-neutral-800/80 dark:text-gray-500'>
          {String(nodeCount).padStart(2, '0')}/
          {views.length > 1 ? `${String(views.length)} views` : '1 view'}
        </div>
        <motion.button
          className='flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-neutral-800/80 dark:hover:bg-neutral-700/80'
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <Layers size={16} className='text-gray-500 dark:text-gray-400' />
          <span className='max-w-[120px] truncate text-gray-700 dark:text-gray-200'>
            {activeView?.name ?? 'Canvas'}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <ChevronUp size={14} className='text-gray-400' />
          </motion.span>
        </motion.button>
        <motion.button
          className='flex size-8 items-center justify-center rounded-xl bg-white/80 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-neutral-800/80 dark:hover:bg-neutral-700/80'
          whileTap={{ scale: 0.9 }}
          aria-label={m.view_new_canvas()}
          onClick={handleCreate}
        >
          <Plus size={16} className='text-gray-500 dark:text-gray-400' />
        </motion.button>
      </div>
    </div>
  );
}
