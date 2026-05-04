import { Menu } from '@base-ui/react/menu';
import {
  BookOpen,
  Check,
  ChevronUp,
  Download,
  File,
  Folder,
  Group,
  ImageIcon,
  Layers,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  isRpcAvailable,
  rpcCreateView,
  rpcDeleteView,
  rpcListViews,
  rpcRenameView,
  rpcSaveManifest,
} from '@/lib/rpc';
import { sanitizeForPersistence } from '@/lib/sanitize';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

const getCreateMenuItems = () => [
  { id: 'note', label: m.menu_note(), icon: StickyNote, enabled: true },
  {
    id: 'checklist',
    label: m.menu_checklist(),
    icon: ListChecks,
    enabled: true,
  },
  { id: 'sticky', label: m.menu_sticky(), icon: NotebookPen, enabled: true },
  { id: 'image', label: m.menu_image(), icon: ImageIcon, enabled: true },
  { id: 'folder', label: m.menu_folder(), icon: Folder, enabled: true },
  { id: 'group', label: m.menu_group(), icon: Group, enabled: true },
  { id: 'file', label: m.menu_file(), icon: File, enabled: false },
];

export function ViewSwitcher({
  onCreateNode,
  onExportCanvas,
  onOpenNoteLibrary,
  createMenuOpen,
  setCreateMenuOpen,
}: {
  createMenuOpen: boolean;
  onCreateNode: (
    type: 'card' | 'checklist' | 'image' | 'folder' | 'group' | 'sticky'
  ) => void;
  onExportCanvas?: () => void;
  onOpenNoteLibrary?: () => void;
  setCreateMenuOpen: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);
  const setViews = useCanvasStore((s) => s.setViews);
  const setActiveView = useCanvasStore((s) => s.setActiveView);

  // Load views list on mount
  useEffect(() => {
    (async () => {
      const data = await rpcListViews();
      if (data === null) {
        return;
      }
      setViews(
        (data.views as Array<{ id: string; name: string }>).map((v) => ({
          id: v.id,
          name: v.name,
        }))
      );
    })();
  }, [setViews]);

  // Reset rename state whenever the menu closes
  useEffect(() => {
    if (!open) {
      setEditingId(null);
    }
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
      if (await isRpcAvailable()) {
        const { nodes, edges } = useCanvasStore.getState();
        const sanitized = sanitizeForPersistence(nodes, edges);
        await rpcSaveManifest(activeViewId, sanitized.nodes, sanitized.edges);
      }

      // Clear store & set new view ID; index.tsx's effect will load + hydrate
      setActiveView(viewId);
      setOpen(false);
    },
    [activeViewId, setActiveView]
  );

  const handleCreate = useCallback(async () => {
    const name = `Canvas ${String(views.length + 1)}`;
    const result = (await rpcCreateView(name)) as {
      id: string;
      name: string;
    } | null;
    if (result === null) {
      return;
    }

    const newViews = [...views, { id: result.id, name: result.name }];
    setViews(newViews);
    await handleSwitchView(result.id);
  }, [views, setViews, handleSwitchView]);

  const handleDelete = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) {
        return;
      }
      const result = (await rpcDeleteView(viewId)) as {
        success: boolean;
        activeViewId?: string;
      } | null;
      if (!result?.success) {
        return;
      }

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
      if (!view) {
        return;
      }
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

  return (
    <Menu.Root
      onOpenChange={(nextOpen, details) => {
        // Escape during rename should cancel the edit, not close the menu
        if (
          !nextOpen &&
          editingId !== null &&
          details.reason === 'escape-key'
        ) {
          details.cancel();
          handleRenameCancel();
          return;
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2">
        <Menu.Trigger
          className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm shadow-sm backdrop-blur-md transition-colors hover:bg-white data-popup-open:bg-white dark:bg-neutral-800/80 dark:data-popup-open:bg-neutral-700/80 dark:hover:bg-neutral-700/80"
          render={<motion.button whileTap={{ scale: 0.95 }} />}
        >
          <Layers className="text-gray-500 dark:text-gray-400" size={16} />
          <span className="max-w-30 truncate text-gray-700 dark:text-gray-200">
            {activeView?.name ?? 'Canvas'}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <ChevronUp className="text-gray-400" size={14} />
          </motion.span>
        </Menu.Trigger>

        {onExportCanvas ? (
          <motion.button
            aria-label="Export canvas as PNG"
            className="flex size-8 items-center justify-center rounded-xl bg-white/80 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-neutral-800/80 dark:hover:bg-neutral-700/80"
            onClick={onExportCanvas}
            type="button"
            whileTap={{ scale: 0.9 }}
          >
            <Download className="text-gray-500 dark:text-gray-400" size={16} />
          </motion.button>
        ) : null}

        <Menu.Root onOpenChange={setCreateMenuOpen} open={createMenuOpen}>
          <Menu.Trigger
            className="flex size-8 items-center justify-center rounded-xl bg-white/80 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-neutral-800/80 dark:hover:bg-neutral-700/80"
            render={<motion.button whileTap={{ scale: 0.9 }} />}
          >
            <motion.span
              animate={{ rotate: createMenuOpen ? 45 : 0 }}
              className="flex items-center justify-center"
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <Plus className="text-gray-500 dark:text-gray-400" size={16} />
            </motion.span>
          </Menu.Trigger>

          <Menu.Portal>
            <Menu.Positioner
              align="end"
              className="z-50 outline-hidden"
              side="top"
              sideOffset={12}
            >
              <Menu.Popup className="min-w-50 overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-800/90">
                {getCreateMenuItems().map((item, index) => {
                  const isLast =
                    !onOpenNoteLibrary &&
                    index === getCreateMenuItems().length - 1;
                  return (
                    <Menu.Item
                      aria-label={item.label}
                      className={`flex cursor-default items-center gap-3 px-4 py-3 font-medium text-sm outline-hidden ${
                        item.enabled
                          ? 'text-gray-800 data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10'
                          : 'cursor-not-allowed text-gray-400 dark:text-gray-600'
                      } ${isLast ? '' : 'border-gray-100 border-b dark:border-neutral-700'}`}
                      closeOnClick
                      disabled={!item.enabled}
                      key={item.id}
                      onClick={() => {
                        const map: Record<
                          string,
                          | 'card'
                          | 'checklist'
                          | 'image'
                          | 'folder'
                          | 'group'
                          | 'sticky'
                        > = {
                          note: 'card',
                          checklist: 'checklist',
                          sticky: 'sticky',
                          image: 'image',
                          folder: 'folder',
                          group: 'group',
                        };
                        const type = map[item.id];
                        if (type) {
                          onCreateNode(type);
                        }
                      }}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </Menu.Item>
                  );
                })}
                {onOpenNoteLibrary ? (
                  <Menu.Item
                    aria-label="Note Library"
                    className="flex cursor-default items-center gap-3 px-4 py-3 font-medium text-gray-800 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10"
                    closeOnClick
                    onClick={onOpenNoteLibrary}
                  >
                    <BookOpen size={18} />
                    Note Library
                  </Menu.Item>
                ) : null}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      <Menu.Portal>
        <Menu.Positioner
          align="center"
          className="z-50 outline-hidden"
          side="top"
          sideOffset={8}
        >
          <Menu.Popup className="min-w-65 origin-(--transform-origin) overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-starting-style:scale-95 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-800/90">
            {views.map((view, index) => {
              const isLast = index === views.length - 1;
              const rowBorder = isLast
                ? ''
                : 'border-gray-100 border-b dark:border-neutral-700';

              if (editingId === view.id) {
                return (
                  <div
                    className={`flex items-center gap-2 px-4 py-3 ${rowBorder}`}
                    key={view.id}
                  >
                    <input
                      className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-gray-900 text-sm outline-none focus:border-blue-400 dark:border-neutral-600 dark:bg-neutral-700 dark:text-white"
                      onChange={(e) => {
                        setEditingName(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRenameConfirm();
                        }
                      }}
                      ref={inputRef}
                      type="text"
                      value={editingName}
                    />
                    <button
                      aria-label="Confirm rename"
                      className="rounded-sm p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                      onClick={handleRenameConfirm}
                      type="button"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      aria-label="Cancel rename"
                      className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-600"
                      onClick={handleRenameCancel}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              }

              const isActive = view.id === activeViewId;
              return (
                <Menu.Item
                  aria-label={view.name}
                  className={`group flex cursor-default items-center gap-3 px-4 py-3 text-sm outline-hidden data-highlighted:bg-black/5 dark:data-highlighted:bg-white/5 ${
                    isActive
                      ? 'font-semibold text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  } ${rowBorder}`}
                  closeOnClick={false}
                  key={view.id}
                  onClick={async () => {
                    await handleSwitchView(view.id);
                  }}
                >
                  <Layers className="shrink-0 opacity-50" size={16} />
                  <span className="flex-1 truncate text-left">{view.name}</span>
                  <button
                    aria-label={`Rename ${view.name}`}
                    className="rounded-sm p-1 text-gray-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-gray-600 group-hover:opacity-100 group-data-highlighted:opacity-100 dark:hover:bg-white/10 dark:hover:text-gray-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameStart(view.id);
                    }}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                  {views.length > 1 ? (
                    <button
                      aria-label={`Delete ${view.name}`}
                      className="rounded-sm p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 group-data-highlighted:opacity-100 dark:hover:bg-red-900/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(view.id);
                      }}
                      type="button"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </Menu.Item>
              );
            })}

            <Menu.Separator className="border-gray-100 border-t dark:border-neutral-700" />

            <Menu.Item
              className="flex cursor-default items-center gap-3 px-4 py-3 text-gray-500 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-400 dark:data-highlighted:bg-white/5"
              onClick={handleCreate}
            >
              <Plus className="opacity-50" size={16} />
              {m.view_new_canvas()}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
