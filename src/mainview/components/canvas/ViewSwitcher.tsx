import { Menu } from '@base-ui/react/menu';
import { Link as RouterLink } from '@tanstack/react-router';
import {
  BookOpen,
  Check,
  ChevronRight,
  ChevronUp,
  Download,
  Feather,
  FileImage,
  FileJson,
  FilePlus,
  Layers,
  Lightbulb,
  Mic,
  Network,
  Newspaper,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import * as motion from 'motion/react-m';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { getCanvasTypeMenuItems } from '@/extensions/createMenu';
import { resolveExtensionMessage } from '@/extensions/messages';
import { canvasTypeRegistry } from '@/extensions/registry';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import {
  type CreatableMenuItem,
  getCreatableMenuItems,
  resolveCreatableKind,
} from '@/lib/creatableNodes';
import {
  buildImportedCardCreateOptions,
  handleMarkdownImportResult,
} from '@/lib/importMarkdownCards';
import { clearPendingFlushBackup } from '@/lib/pendingFlushBackup';
import {
  rpcCreateViewFromTemplate,
  rpcDeleteView,
  rpcImportMarkdownFiles,
  rpcListViews,
  rpcRenameView,
  rpcRestoreView,
} from '@/lib/rpc';
import { type CreateNodeOptions, useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../paraglide/messages.js';
import {
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
} from '../../../shared/extensions/builtinIds';
import { canvasTypeMenuActionId } from '../../../shared/extensions/ids';
import { DeleteViewConfirmDialog } from './DeleteViewConfirmDialog';

/**
 * Max length for canvas (view) names. Aligned with the audit's F2 spec —
 * 80 characters is enough for descriptive names but still fits the menu
 * row without ellipsis-soup.
 */
const VIEW_NAME_MAX_LENGTH = 80;

/**
 * Create-menu items shown in the top "common" group. Widgets are first-class
 * creation actions, so keep them visible instead of hiding them behind "More".
 */
const COMMON_CREATE_IDS = new Set<string>([
  'note',
  'sticky',
  canvasTypeMenuActionId(LINK_CANVAS_TYPE_ID),
  canvasTypeMenuActionId(IMAGE_CANVAS_TYPE_ID),
]);

/**
 * Focus ring shared across the bottom-bar trigger buttons. Centralized so
 * adding a new floating control later picks up the same a11y treatment.
 */
const TRIGGER_FOCUS_RING =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60';

interface ViewSwitcherUiState {
  editingId: string | null;
  editingName: string;
  open: boolean;
  pendingDeleteId: string | null;
}

type ViewSwitcherUiAction =
  | { type: 'beginRename'; id: string; name: string; open?: boolean }
  | { type: 'cancelRename' }
  | { type: 'setEditingName'; name: string }
  | { type: 'setOpen'; open: boolean }
  | { type: 'setPendingDeleteId'; id: string | null };

const initialViewSwitcherUiState: ViewSwitcherUiState = {
  editingId: null,
  editingName: '',
  open: false,
  pendingDeleteId: null,
};

function viewSwitcherUiReducer(
  state: ViewSwitcherUiState,
  action: ViewSwitcherUiAction
): ViewSwitcherUiState {
  switch (action.type) {
    case 'beginRename':
      return {
        ...state,
        editingId: action.id,
        editingName: action.name,
        open: action.open ?? state.open,
      };
    case 'cancelRename':
      return { ...state, editingId: null };
    case 'setEditingName':
      return { ...state, editingName: action.name };
    case 'setOpen':
      return { ...state, open: action.open };
    case 'setPendingDeleteId':
      return { ...state, pendingDeleteId: action.id };
  }
}

interface RenderCreateMenuItemDeps {
  onCreateCanvasType?: (canvasTypeId: string) => void | Promise<void>;
  onCreateNode: (
    type: CreatableCanvasNodeKind,
    options?: CreateNodeOptions
  ) => void;
}

/**
 * Renders a single creation `Menu.Item`. Extracted so the common and "More"
 * groups can share one render path and stay 1:1 with what was previously a
 * single flat `createMenuItems.map(...)`.
 */
function renderCreateMenuItem(
  item: CreatableMenuItem,
  { onCreateCanvasType, onCreateNode }: RenderCreateMenuItemDeps
) {
  return (
    <Menu.Item
      aria-label={item.label}
      className={`flex cursor-default items-center gap-3 px-4 py-3 font-medium text-sm outline-hidden ${
        item.enabled
          ? 'text-gray-800 data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10'
          : 'cursor-not-allowed text-gray-400 dark:text-gray-600'
      } border-gray-100 border-b dark:border-neutral-700`}
      closeOnClick={(() => {
        const canvasTypeId = item.id.startsWith('ext:')
          ? item.id.slice('ext:'.length)
          : undefined;
        const flow = canvasTypeId
          ? canvasTypeRegistry.get(canvasTypeId)?.createFlow
          : undefined;
        return flow !== 'url' && flow !== 'file';
      })()}
      disabled={!item.enabled}
      key={item.id}
      onClick={async () => {
        const canvasTypeId = item.id.startsWith('ext:')
          ? item.id.slice('ext:'.length)
          : undefined;
        if (canvasTypeId) {
          onCreateCanvasType?.(canvasTypeId);
          return;
        }
        const type = resolveCreatableKind(item.id);
        if (type) {
          await onCreateNode(type);
        }
      }}
    >
      <item.icon size={18} />
      {item.label}
    </Menu.Item>
  );
}

const getQuickTemplateItems = () => [
  {
    id: 'feature-story',
    label: m.template_feature_story_name(),
    icon: Newspaper,
  },
  {
    id: 'topic-pool',
    label: m.template_topic_pool_name(),
    icon: Lightbulb,
  },
  {
    id: 'interview-notes',
    label: m.template_interview_notes_name(),
    icon: Mic,
  },
  {
    id: 'reading-notes',
    label: m.template_reading_notes_name(),
    icon: BookOpen,
  },
  {
    id: 'novel-bible',
    label: m.template_novel_bible_name(),
    icon: Feather,
  },
  {
    id: 'brainstorm-mindmap',
    label: m.template_brainstorm_mindmap_name(),
    icon: Network,
  },
];

// View switching keeps the menu, restore flow, and import actions in one control.
// react-doctor-disable-next-line react-doctor/no-giant-component
export function ViewSwitcher({
  onCreateCanvasType,
  onCreateNode,
  onExportCanvas,
  onExportCanvasJson,
  onExportMarkdown,
  onOpenNoteLibrary,
  createMenuOpen,
  setCreateMenuOpen,
}: {
  createMenuOpen: boolean;
  onCreateCanvasType?: (canvasTypeId: string) => void | Promise<void>;
  onCreateNode: (
    type: CreatableCanvasNodeKind,
    options?: CreateNodeOptions
  ) => void;
  onExportCanvas?: () => void;
  onExportCanvasJson?: () => void;
  onExportMarkdown?: (scope: 'all' | 'selected' | 'view') => void;
  onOpenNoteLibrary?: () => void;
  setCreateMenuOpen: (v: boolean) => void;
}) {
  const [uiState, dispatchUi] = useReducer(
    viewSwitcherUiReducer,
    initialViewSwitcherUiState
  );
  const { editingId, editingName, open, pendingDeleteId } = uiState;
  const inputRef = useRef<HTMLInputElement>(null);

  const activeViewId = useCanvasStore((s) => s.activeViewId);
  const views = useCanvasStore((s) => s.views);
  const setViews = useCanvasStore((s) => s.setViews);
  const setActiveView = useCanvasStore((s) => s.setActiveView);
  const switchView = useCanvasStore((s) => s.switchView);
  const flushActiveView = useCanvasStore((s) => s.flushActiveView);
  // Load views list + persisted activeViewId on mount
  useEffect(() => {
    (async () => {
      const data = await rpcListViews();
      if (data === null) {
        return;
      }
      const viewsList = (data.views as Array<{ id: string; name: string }>).map(
        (v) => ({
          id: v.id,
          name: v.name,
        })
      );
      setViews(viewsList);

      // Restore the last-active canvas persisted in workspace.json.
      // Use setActiveView (not setActiveViewId) so _hydrated resets and
      // index.tsx's loadCanvas effect re-runs for the correct canvas.
      const persisted = (data as { activeViewId?: string }).activeViewId;
      if (persisted && viewsList.some((v) => v.id === persisted)) {
        setActiveView(persisted);
      }
    })();
  }, [setViews, setActiveView]);

  // Re-fetch the views list when another window mutates it (e.g. the
  // Settings window restores a canvas from Trash). We only refresh the
  // list here — never switch the active view — so the user's current
  // canvas and unsaved edits are left untouched.
  useEffect(() => {
    const handler = () => {
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
    };
    globalThis.addEventListener('views-updated', handler);
    return () => {
      globalThis.removeEventListener('views-updated', handler);
    };
  }, [setViews]);

  if (!(open || editingId === null)) {
    dispatchUi({ type: 'cancelRename' });
  }

  const setOpen = useCallback((nextOpen: boolean) => {
    dispatchUi({ type: 'setOpen', open: nextOpen });
  }, []);

  const setEditingName = useCallback((name: string) => {
    dispatchUi({ type: 'setEditingName', name });
  }, []);

  const setPendingDeleteId = useCallback((id: string | null) => {
    dispatchUi({ type: 'setPendingDeleteId', id });
  }, []);

  // Focus input when editing
  useEffect(() => {
    if (editingId !== null && inputRef.current !== null) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleSwitchView = useCallback(
    async (viewId: string, options?: { keepOpen?: boolean }) => {
      if (viewId === activeViewId) {
        setOpen(options?.keepOpen ?? false);
        return;
      }

      // switchView flushes the current canvas first and refuses to switch
      // when the save fails, so we never clear unsaved edits.
      const switched = await switchView(viewId);
      if (!switched) {
        toast.error(m.toast_view_switch_save_failed());
        return;
      }
      setOpen(options?.keepOpen ?? false);
    },
    [activeViewId, switchView, setOpen]
  );

  const beginInlineRename = useCallback(
    (view: { id: string; name: string }) => {
      dispatchUi({
        type: 'beginRename',
        id: view.id,
        name: view.name,
        open: true,
      });
    },
    []
  );

  const appendCreatedView = useCallback(
    (view: { id: string; name: string }) => {
      const latestViews = useCanvasStore.getState().views;
      if (latestViews.some((existing) => existing.id === view.id)) {
        return;
      }
      setViews([...latestViews, view]);
    },
    [setViews]
  );

  const handleCreateFromTemplate = useCallback(
    async (templateId: string) => {
      const name = `Canvas ${String(useCanvasStore.getState().views.length + 1)}`;
      const result = (await rpcCreateViewFromTemplate(name, templateId)) as {
        id: string;
        name: string;
      } | null;
      if (result === null) {
        return;
      }

      appendCreatedView({ id: result.id, name: result.name });
      await handleSwitchView(result.id, { keepOpen: true });
      beginInlineRename(result);
    },
    [appendCreatedView, handleSwitchView, beginInlineRename]
  );

  const handleRestore = useCallback(
    async (
      trashId: string,
      restoredView: { id: string; name: string },
      previousActiveViewId: string
    ) => {
      const result = (await rpcRestoreView(trashId)) as {
        success: boolean;
        view?: { id: string; name: string; file: string };
        activeViewId?: string;
      } | null;
      if (!result?.success) {
        toast.error(m.toast_view_restore_failed());
        return;
      }
      const current = useCanvasStore.getState().views;
      if (!current.some((v) => v.id === restoredView.id)) {
        setViews([
          ...current,
          { id: restoredView.id, name: restoredView.name },
        ]);
      }
      // Switch back to the previously active view if the restore happened
      // while the user was on a different one.
      const nowActive = useCanvasStore.getState().activeViewId;
      if (
        previousActiveViewId === restoredView.id &&
        nowActive !== restoredView.id
      ) {
        await handleSwitchView(restoredView.id);
      }
      toast.success(m.toast_view_restored({ name: restoredView.name }));
    },
    [setViews, handleSwitchView]
  );

  const handleDeleteConfirmed = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) {
        return;
      }
      const view = views.find((v) => v.id === viewId);
      if (!view) {
        return;
      }
      const previousActiveViewId = activeViewId;
      const deletingActive = viewId === activeViewId;
      // Flush the canvas being deleted first so its trash copy (what "Undo"
      // restores) holds the latest edits. Abort the delete if that fails.
      if (deletingActive && !(await flushActiveView())) {
        toast.error(m.toast_view_delete_save_failed());
        return;
      }
      const result = (await rpcDeleteView(viewId)) as {
        success: boolean;
        activeViewId?: string;
        trashId?: string;
      } | null;
      if (!result?.success) {
        return;
      }

      const newViews = views.filter((v) => v.id !== viewId);
      setViews(newViews);

      if (deletingActive) {
        clearPendingFlushBackup(viewId);
        if (result.activeViewId !== undefined) {
          // The outgoing view no longer exists: never flush it again.
          const switched = await switchView(result.activeViewId, {
            skipFlush: true,
          });
          if (switched) {
            setOpen(false);
          } else {
            toast.error(m.toast_view_switch_save_failed());
          }
        }
      }

      if (result.trashId !== undefined) {
        const trashId = result.trashId;
        toast(m.toast_view_deleted({ name: view.name }), {
          action: {
            label: m.toast_undo(),
            onClick: () => {
              handleRestore(
                trashId,
                { id: view.id, name: view.name },
                previousActiveViewId
              );
            },
          },
        });
      }
    },
    [
      views,
      activeViewId,
      setViews,
      switchView,
      flushActiveView,
      setOpen,
      handleRestore,
    ]
  );

  const handleDelete = useCallback(
    (viewId: string) => {
      setPendingDeleteId(viewId);
    },
    [setPendingDeleteId]
  );

  const pendingDeleteView = views.find((v) => v.id === pendingDeleteId);

  const handleRenameStart = useCallback(
    (viewId: string) => {
      const view = views.find((v) => v.id === viewId);
      if (!view) {
        return;
      }
      dispatchUi({ type: 'beginRename', id: viewId, name: view.name });
    },
    [views]
  );

  // F2: same-name + length validation. Trim once and reuse so the UI and the
  // commit path both see the same canonical form.
  const editingNameTrimmed = editingName.trim();
  const renameValidationError = (() => {
    if (editingId === null) {
      return null;
    }
    if (editingNameTrimmed === '') {
      return m.view_rename_empty();
    }
    if (editingNameTrimmed.length > VIEW_NAME_MAX_LENGTH) {
      return m.view_rename_too_long();
    }
    const collision = views.find(
      (v) =>
        v.id !== editingId &&
        v.name.trim().toLowerCase() === editingNameTrimmed.toLowerCase()
    );
    if (collision) {
      return m.view_rename_duplicate();
    }
    return null;
  })();

  const handleRenameConfirm = useCallback(async () => {
    if (editingId === null || editingNameTrimmed === '') {
      dispatchUi({ type: 'cancelRename' });
      return;
    }
    // Block confirm if duplicate / too-long; the inline banner already tells
    // the user what's wrong, and `rpcRenameView` would happily clobber.
    if (renameValidationError) {
      return;
    }
    await rpcRenameView(editingId, editingNameTrimmed);
    setViews(
      views.map((v) =>
        v.id === editingId ? { ...v, name: editingNameTrimmed } : v
      )
    );
    dispatchUi({ type: 'cancelRename' });
  }, [editingId, editingNameTrimmed, renameValidationError, views, setViews]);

  const handleRenameCancel = useCallback(() => {
    dispatchUi({ type: 'cancelRename' });
  }, []);

  const activeView = views.find((v) => v.id === activeViewId);
  const activeViewNodeCount = useCanvasStore((s) => s.nodes.length);
  const activeViewNodeCountLabel =
    activeViewNodeCount === 1
      ? m.view_node_count_one()
      : m.view_node_count_other({ count: activeViewNodeCount });

  const handleImportMarkdown = useCallback(async () => {
    const result = await rpcImportMarkdownFiles().catch(() => null);
    const imported = await handleMarkdownImportResult(result, async (notes) => {
      for (const [index, note] of notes.entries()) {
        // Imported notes are inserted sequentially so their generated nodes keep order.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        await onCreateNode(
          'card',
          buildImportedCardCreateOptions(note, index, notes.length)
        );
      }
    });
    if (imported) {
      setCreateMenuOpen(false);
    }
  }, [onCreateNode, setCreateMenuOpen]);

  // Split the create menu into "common" (note / sticky / link / image) and
  // "more" (folder / group / file / checklist). Common are the everyday
  // entry points; everything else is one section header away to keep the
  // popup scannable. F4 in the product detail roadmap.
  const createMenuItems = getCreatableMenuItems(
    'short',
    getCanvasTypeMenuItems(canvasTypeRegistry.list(), resolveExtensionMessage)
  );
  const commonCreateItems = createMenuItems.filter((item) =>
    COMMON_CREATE_IDS.has(item.id)
  );
  const moreCreateItems = createMenuItems.filter(
    (item) => !COMMON_CREATE_IDS.has(item.id)
  );

  return (
    <>
      <DeleteViewConfirmDialog
        onCancel={() => {
          setPendingDeleteId(null);
        }}
        onConfirm={() => {
          const id = pendingDeleteId;
          setPendingDeleteId(null);
          if (id !== null) {
            handleDeleteConfirmed(id);
          }
        }}
        open={pendingDeleteId !== null}
        viewName={pendingDeleteView?.name ?? ''}
      />
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
        {/* Deliberately its own pill (not `.canvas-floating-surface`) — this
            is the primary action bar, so it earns a fully-rounded shape and
            a standalone accent-filled create button instead of the flatter
            rounded-2xl chrome used by the toolbar/search/zoom panels. Border,
            tint, and blur values otherwise match `.canvas-floating-surface`
            so the three floating bars still read as one family. */}
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-black/5 bg-white/80 p-1 shadow-xs backdrop-blur-md dark:border-white/10 dark:bg-neutral-800/80">
          <Menu.Trigger
            // Transparent at rest (not its own filled pill) — a solid
            // rounded-full surface nested directly inside the outer
            // rounded-full bar reads as a pill-inside-a-pill. Only the
            // accent create button keeps a persistent fill, as the bar's
            // one deliberate primary action.
            className={`flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors hover:bg-black/5 data-popup-open:bg-black/5 dark:data-popup-open:bg-white/10 dark:hover:bg-white/10 ${TRIGGER_FOCUS_RING}`}
            render={<motion.button whileTap={{ scale: 0.95 }} />}
          >
            <Layers className="shrink-0 text-accent" size={14} />
            <span className="flex min-w-0 items-center gap-1 text-gray-700 dark:text-gray-200">
              <span className="max-w-40 truncate font-medium text-gray-900 dark:text-white">
                {activeView?.name ?? 'Canvas'}
              </span>
              <span
                className="hidden shrink-0 font-normal text-2xs text-gray-500 sm:inline dark:text-gray-400"
                title={activeViewNodeCountLabel}
              >
                · {activeViewNodeCountLabel}
              </span>
            </span>
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              className="shrink-0"
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            >
              <ChevronUp className="text-gray-400" size={12} />
            </motion.span>
          </Menu.Trigger>

          {onExportCanvas || onExportCanvasJson || onExportMarkdown ? (
            <Menu.Root>
              <Menu.Trigger
                aria-label={m.a11y_export_canvas()}
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10 ${TRIGGER_FOCUS_RING}`}
                render={<motion.button whileTap={{ scale: 0.9 }} />}
              >
                <Download size={14} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  align="center"
                  className="z-50 outline-hidden"
                  side="top"
                  sideOffset={12}
                >
                  <Menu.Popup className="floating-menu-popup min-w-44 overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-md dark:bg-neutral-800/90">
                    {onExportCanvas ? (
                      <Menu.Item
                        aria-label={m.a11y_export_png()}
                        className="flex cursor-default items-center gap-3 px-3 py-2.5 font-medium text-gray-700 text-sm outline-hidden hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700/80"
                        onClick={onExportCanvas}
                      >
                        <FileImage
                          className="text-gray-500 dark:text-gray-400"
                          size={16}
                        />
                        <span>{m.a11y_export_png()}</span>
                      </Menu.Item>
                    ) : null}
                    {onExportMarkdown ? (
                      <>
                        <Menu.Item
                          className="cursor-default px-3 py-2.5 text-gray-700 text-sm outline-hidden hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700/80"
                          onClick={() => onExportMarkdown('view')}
                        >
                          {m.menu_export_canvas_markdown()}
                        </Menu.Item>
                        <Menu.Item
                          className="cursor-default px-3 py-2.5 text-gray-700 text-sm outline-hidden hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700/80"
                          onClick={() => onExportMarkdown('selected')}
                        >
                          {m.menu_export_selected_markdown()}
                        </Menu.Item>
                        <Menu.Item
                          className="cursor-default px-3 py-2.5 text-gray-700 text-sm outline-hidden hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700/80"
                          onClick={() => onExportMarkdown('all')}
                        >
                          {m.menu_export_all_markdown()}
                        </Menu.Item>
                      </>
                    ) : null}
                    {onExportCanvasJson ? (
                      <Menu.Item
                        aria-label={m.a11y_export_json()}
                        className="flex cursor-default items-center gap-3 px-3 py-2.5 font-medium text-gray-700 text-sm outline-hidden hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-neutral-700/80"
                        onClick={onExportCanvasJson}
                      >
                        <FileJson
                          className="text-gray-500 dark:text-gray-400"
                          size={16}
                        />
                        <span>{m.a11y_export_json()}</span>
                      </Menu.Item>
                    ) : null}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          ) : null}

          <Menu.Root onOpenChange={setCreateMenuOpen} open={createMenuOpen}>
            <Menu.Trigger
              aria-label={m.menu_create_button_aria()}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm transition-colors hover:bg-accent-strong ${TRIGGER_FOCUS_RING}`}
              render={<motion.button whileTap={{ scale: 0.9 }} />}
            >
              <motion.span
                animate={{ rotate: createMenuOpen ? 45 : 0 }}
                className="flex items-center justify-center"
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              >
                <Plus size={16} />
              </motion.span>
            </Menu.Trigger>

            <Menu.Portal>
              <Menu.Positioner
                align="end"
                className="z-50 outline-hidden"
                side="top"
                sideOffset={12}
              >
                <Menu.Popup className="floating-menu-popup min-w-50 overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md dark:bg-neutral-800/90">
                  {commonCreateItems.map((item) =>
                    renderCreateMenuItem(item, {
                      onCreateCanvasType,
                      onCreateNode,
                    })
                  )}
                  <div className="border-gray-100 border-b px-4 pt-2 pb-1 font-medium text-2xs text-gray-500 uppercase tracking-wide dark:border-neutral-700 dark:text-gray-400">
                    {m.menu_more()}
                  </div>
                  {moreCreateItems.map((item) =>
                    renderCreateMenuItem(item, {
                      onCreateCanvasType,
                      onCreateNode,
                    })
                  )}
                  <Menu.Item
                    aria-label={m.menu_import_markdown()}
                    className={`flex cursor-default items-center gap-3 px-4 py-3 font-medium text-gray-800 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10 ${
                      onOpenNoteLibrary
                        ? 'border-gray-100 border-b dark:border-neutral-700'
                        : ''
                    }`}
                    closeOnClick={false}
                    onClick={handleImportMarkdown}
                  >
                    <FilePlus size={18} />
                    {m.menu_import_markdown()}
                  </Menu.Item>
                  {onOpenNoteLibrary ? (
                    <Menu.Item
                      aria-label={m.menu_note_library()}
                      className="flex cursor-default items-center gap-3 px-4 py-3 font-medium text-gray-800 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10"
                      closeOnClick
                      onClick={onOpenNoteLibrary}
                    >
                      <BookOpen size={18} />
                      {m.menu_note_library()}
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
            <Menu.Popup className="floating-menu-popup min-w-65 overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md dark:bg-neutral-800/90">
              {views.map((view, index) => {
                const isLast = index === views.length - 1;
                const rowBorder = isLast
                  ? ''
                  : 'border-gray-100 border-b dark:border-neutral-700';

                if (editingId === view.id) {
                  const hasError = renameValidationError !== null;
                  return (
                    <div
                      className={`flex flex-col gap-1 px-4 py-3 ${rowBorder}`}
                      key={view.id}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          aria-invalid={hasError}
                          aria-label={m.a11y_view_name()}
                          className={`flex-1 rounded-md border bg-white px-2 py-1 text-gray-900 text-sm outline-hidden focus:border-accent dark:bg-neutral-700 dark:text-white ${
                            hasError
                              ? 'border-red-400 dark:border-red-500'
                              : 'border-gray-200 dark:border-neutral-600'
                          }`}
                          maxLength={VIEW_NAME_MAX_LENGTH}
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
                          aria-label={m.a11y_confirm_rename()}
                          className="rounded-sm p-1 text-green-600 transition-opacity hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-green-900/30"
                          disabled={hasError}
                          onClick={handleRenameConfirm}
                          type="button"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          aria-label={m.a11y_cancel_rename()}
                          className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-600"
                          onClick={handleRenameCancel}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {hasError ? (
                        <p
                          className="px-1 text-2xs text-red-500 dark:text-red-400"
                          role="alert"
                        >
                          {renameValidationError}
                        </p>
                      ) : null}
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
                    <span className="flex-1 truncate text-left">
                      {view.name}
                    </span>
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
                        className="rounded-sm p-1 text-red-500 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 group-data-highlighted:opacity-100 dark:text-red-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
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

              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger className="flex cursor-default items-center gap-3 px-4 py-3 text-gray-500 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-400 dark:data-highlighted:bg-white/5">
                  <Plus className="opacity-50" size={16} />
                  <span className="flex-1">{m.view_new_canvas()}</span>
                  <ChevronRight className="opacity-40" size={14} />
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner
                    align="start"
                    className="z-50 outline-hidden"
                    side="right"
                    sideOffset={4}
                  >
                    <Menu.Popup className="floating-menu-popup min-w-44 overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-md dark:bg-neutral-800/90">
                      <Menu.Item
                        className="flex cursor-default items-center gap-3 px-4 py-3 font-medium text-gray-800 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10"
                        closeOnClick={false}
                        onClick={() => handleCreateFromTemplate('blank')}
                      >
                        <Plus size={16} />
                        {m.view_blank_canvas()}
                      </Menu.Item>

                      <Menu.Separator className="border-gray-100 border-t dark:border-neutral-700" />

                      <div className="px-4 pt-2 pb-1 font-medium text-2xs text-gray-500 uppercase tracking-wide dark:text-gray-400">
                        {m.view_from_template()}
                      </div>

                      {getQuickTemplateItems().map((template) => (
                        <Menu.Item
                          className="flex cursor-default items-center gap-3 px-4 py-3 font-medium text-gray-800 text-sm outline-hidden data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/10"
                          closeOnClick={false}
                          key={template.id}
                          onClick={() => handleCreateFromTemplate(template.id)}
                        >
                          <template.icon size={16} />
                          {template.label}
                        </Menu.Item>
                      ))}

                      <Menu.Separator className="border-gray-100 border-t dark:border-neutral-700" />

                      <Menu.Item
                        className="flex cursor-default items-center gap-3 px-4 py-3 text-gray-500 text-xs outline-hidden data-highlighted:bg-black/5 dark:text-gray-400 dark:data-highlighted:bg-white/10"
                        render={<RouterLink to="/templates" />}
                      >
                        {m.templates_browse_all()}
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </>
  );
}
