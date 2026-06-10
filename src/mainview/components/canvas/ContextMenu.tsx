import {
  BookOpen,
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  ExternalLink,
  FileDown,
  FilePlus,
  FolderOpen,
  Group,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Lock,
  LogOut,
  Maximize2,
  Palette,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  Spline,
  Tag,
  Trash2,
  Unlock,
  ZoomIn,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getCreatableMenuItems } from '@/lib/creatableNodes';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

interface MenuItem {
  danger?: boolean;
  disabled?: boolean;
  icon: React.ElementType;
  id: string;
  label: string;
  shortcut?: string;
  submenu?: MenuItem[];
}

interface ViewSummary {
  id: string;
  name: string;
}

type ContextMenuState = {
  x: number;
  y: number;
  target:
    | 'canvas'
    | 'asset'
    | 'card'
    | 'folder-child'
    | 'image'
    | 'link'
    | 'folder'
    | 'group'
    | 'sticky'
    | 'multi'
    | 'edge';
  nodeId?: string;
  edgeId?: string;
} | null;

const getCanvasItems = (hasClipboard: boolean): MenuItem[] => [
  {
    id: 'new',
    label: m.menu_new(),
    icon: Plus,
    submenu: getCreatableMenuItems('short').map((item) => ({
      id: `new-${item.id}`,
      label: item.label,
      icon: item.icon,
    })),
  },
  {
    id: 'paste',
    label: m.menu_paste(),
    icon: ClipboardPaste,
    shortcut: '⌘V',
    disabled: !hasClipboard,
  },
  { id: 'reset-zoom', label: m.menu_reset_zoom(), icon: ZoomIn },
  {
    id: 'import-markdown',
    label: m.menu_import_markdown(),
    icon: FilePlus,
  },
  {
    id: 'export-canvas-markdown',
    label: m.menu_export_canvas_markdown(),
    icon: FileDown,
  },
];

const lockItem = (locked: boolean): MenuItem => ({
  id: 'toggle-lock',
  label: locked ? m.menu_unlock() : m.menu_lock(),
  icon: locked ? Unlock : Lock,
});

const getCardItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'copy-as-markdown', label: m.menu_copy_as_markdown(), icon: Copy },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  { id: 'export-markdown', label: m.menu_export_markdown(), icon: FileDown },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getFolderChildItems = (): MenuItem[] => [
  { id: 'move-out', label: m.menu_move_out(), icon: LogOut },
];

const getFolderItems = (locked: boolean): MenuItem[] => [
  {
    id: 'open-folder',
    label: m.menu_open(),
    icon: FolderOpen,
    shortcut: 'Enter',
  },
  { id: 'edit-folder', label: m.menu_edit_folder_info(), icon: PenLine },
  { id: 'new-child', label: m.menu_new_card_inside(), icon: FilePlus },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getStickyItems = (locked: boolean): MenuItem[] => [
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getGroupItems = (locked: boolean): MenuItem[] => [
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getImageItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'replace-image', label: m.menu_replace_image(), icon: ImageIcon },
  {
    id: 'copy-image-address',
    label: m.menu_copy_image_address(),
    icon: Copy,
  },
  {
    id: 'reveal-in-finder',
    label: m.menu_reveal_in_finder(),
    icon: FolderOpen,
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getLinkItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'open-link', label: m.menu_open_link(), icon: ExternalLink },
  { id: 'copy-url', label: m.menu_copy_url(), icon: LinkIcon },
  { id: 'refetch-link', label: m.menu_refetch_link(), icon: RefreshCw },
  { id: 'edit-url', label: 'Edit URL', icon: LinkIcon },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const MOVE_TO_VIEW_ACTION_PREFIX = 'move-to-view:';

const getMultiItems = (
  views: ViewSummary[],
  activeViewId: string
): MenuItem[] => {
  const targetViews = views.filter((view) => view.id !== activeViewId);
  return [
    {
      id: 'duplicate',
      label: m.menu_duplicate(),
      icon: CopyPlus,
      shortcut: '⌘D',
    },
    // 'group-selection' (not 'group') — the bare id would be picked up by
    // resolveCreatableKind and create a new empty group node instead.
    {
      id: 'group-selection',
      label: m.menu_group(),
      icon: Group,
      shortcut: '⌘G',
    },
    { id: 'change-color', label: m.menu_change_color(), icon: Palette },
    { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
    {
      id: 'move-to-view',
      label: m.menu_move_to_view(),
      icon: Layers,
      disabled: targetViews.length === 0,
      submenu:
        targetViews.length > 0
          ? targetViews.map((view) => ({
              id: `${MOVE_TO_VIEW_ACTION_PREFIX}${view.id}`,
              label: view.name,
              icon: Layers,
            }))
          : undefined,
    },
    { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
    {
      id: 'delete',
      label: m.menu_delete(),
      icon: Trash2,
      shortcut: '⌫',
      danger: true,
    },
  ];
};

const getAssetItems = (locked: boolean): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  {
    id: 'reveal-in-finder',
    label: m.menu_reveal_in_finder(),
    icon: FolderOpen,
  },
  { id: 'replace-file', label: m.menu_replace_file(), icon: FilePlus },
  { id: 'rename-asset', label: m.menu_rename_asset(), icon: PenLine },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  lockItem(locked),
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

type EdgePathType = 'smoothstep' | 'bezier';

const getEdgeItems = (pathType: EdgePathType): MenuItem[] => [
  { id: 'edit-edge-label', label: m.menu_edit_label(), icon: Tag },
  {
    id: 'toggle-edge-animated',
    label: m.menu_toggle_animation(),
    icon: Sparkles,
  },
  {
    id: 'toggle-edge-path-type',
    label:
      pathType === 'bezier' ? m.menu_toggle_straight() : m.menu_toggle_curved(),
    icon: Spline,
  },
  { id: 'cycle-edge-color', label: m.menu_edge_color(), icon: Palette },
  {
    id: 'delete-edge',
    label: m.menu_delete_edge(),
    icon: Trash2,
    danger: true,
  },
];

export type { ContextMenuState };

export function CanvasContextMenu({
  menu,
  onClose,
  onAction,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, nodeId?: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const submenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndexRef = useRef(0);
  const submenuActiveIndexRef = useRef(0);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgePathType = useCanvasStore((state) => {
    if (menu?.target !== 'edge' || !menu.edgeId) {
      return 'bezier';
    }

    const edge = state.edges.find((item) => item.id === menu.edgeId);
    const pathType = (edge?.data as { pathType?: unknown } | undefined)
      ?.pathType;
    return pathType === 'smoothstep' ? 'smoothstep' : 'bezier';
  });
  const nodeLocked = useCanvasStore((state) => {
    if (!menu?.nodeId) {
      return false;
    }
    const node = state.nodes.find((item) => item.id === menu.nodeId);
    return Boolean((node?.data as { locked?: unknown } | undefined)?.locked);
  });
  const hasClipboard = useCanvasStore((state) => state.clipboard.length > 0);
  const activeViewId = useCanvasStore((state) => state.activeViewId);
  const views = useCanvasStore((state) => state.views);

  const itemGetters: Record<string, () => MenuItem[]> = {
    edge: () => getEdgeItems(edgePathType),
    'folder-child': getFolderChildItems,
    folder: () => getFolderItems(nodeLocked),
    group: () => getGroupItems(nodeLocked),
    sticky: () => getStickyItems(nodeLocked),
    image: () => getImageItems(nodeLocked),
    link: () => getLinkItems(nodeLocked),
    asset: () => getAssetItems(nodeLocked),
    card: () => getCardItems(nodeLocked),
    multi: () => getMultiItems(views, activeViewId),
    canvas: () => getCanvasItems(hasClipboard),
  };

  const items = menu
    ? (itemGetters[menu.target] ?? (() => getCanvasItems(hasClipboard)))()
    : [];
  const submenuItems = openSubmenu
    ? items.find((item) => item.id === openSubmenu)?.submenu
    : undefined;

  const focusItem = useCallback(
    (index: number) => {
      if (items.length === 0) {
        return;
      }
      const next = (index + items.length) % items.length;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    },
    [items.length]
  );

  const focusSubmenuItem = useCallback(
    (index: number) => {
      if (!submenuItems || submenuItems.length === 0) {
        return;
      }
      const next = (index + submenuItems.length) % submenuItems.length;
      submenuActiveIndexRef.current = next;
      submenuItemRefs.current[next]?.focus();
    },
    [submenuItems]
  );

  const openSubmenuFor = useCallback((id: string) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpenSubmenu(id);
    submenuActiveIndexRef.current = 0;
  }, []);

  const scheduleCloseSubmenu = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 100);
  }, []);

  const cancelCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!menu) {
      return;
    }
    activeIndexRef.current = 0;
    setOpenSubmenu(null);
    itemRefs.current[0]?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return;
    }

    const handleClick = (e: PointerEvent) => {
      const button = e.button ?? 0;
      if (button !== 0) {
        return;
      }
      const target = e.target as HTMLElement;
      const inMenu = ref.current?.contains(target) ?? false;
      const inSubmenu = submenuRef.current?.contains(target) ?? false;
      if (!(inMenu || inSubmenu)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (openSubmenu) {
          e.preventDefault();
          setOpenSubmenu(null);
          itemRefs.current[activeIndexRef.current]?.focus();
          return;
        }
        onClose();
        return;
      }
      if (openSubmenu && submenuItems) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          focusSubmenuItem(submenuActiveIndexRef.current + 1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          focusSubmenuItem(submenuActiveIndexRef.current - 1);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setOpenSubmenu(null);
          itemRefs.current[activeIndexRef.current]?.focus();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          const active = document.activeElement;
          const index = submenuItemRefs.current.indexOf(
            active as HTMLButtonElement
          );
          if (index !== -1) {
            e.preventDefault();
            const item = submenuItems[index];
            if (item) {
              onAction(item.id, menu.nodeId ?? menu.edgeId);
              onClose();
            }
          }
          return;
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusItem(activeIndexRef.current + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusItem(activeIndexRef.current - 1);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        focusItem(0);
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        focusItem(items.length - 1);
        return;
      }
      if (e.key === 'ArrowRight') {
        const activeItem = items[activeIndexRef.current];
        if (activeItem?.submenu) {
          e.preventDefault();
          openSubmenuFor(activeItem.id);
          setTimeout(() => {
            focusSubmenuItem(0);
          }, 0);
        }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const active = document.activeElement;
        const index = itemRefs.current.indexOf(active as HTMLButtonElement);
        if (index !== -1) {
          e.preventDefault();
          const item = items[index];
          if (item && !item.disabled) {
            if (item.submenu) {
              openSubmenuFor(item.id);
              setTimeout(() => {
                focusSubmenuItem(0);
              }, 0);
            } else {
              onAction(item.id, menu.nodeId ?? menu.edgeId);
              onClose();
            }
          }
        }
      }
    };
    document.addEventListener('pointerdown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [
    focusItem,
    focusSubmenuItem,
    items,
    menu,
    onAction,
    onClose,
    openSubmenu,
    openSubmenuFor,
    submenuItems,
  ]);

  const x = menu ? Math.max(8, Math.min(menu.x, window.innerWidth - 220)) : 0;
  const y = menu
    ? Math.max(8, Math.min(menu.y, window.innerHeight - items.length * 40 - 16))
    : 0;

  const submenuParentIndex = openSubmenu
    ? items.findIndex((item) => item.id === openSubmenu)
    : -1;
  const submenuParentEl =
    submenuParentIndex >= 0 ? itemRefs.current[submenuParentIndex] : null;
  const submenuWidth = 180;
  const parentRect = submenuParentEl?.getBoundingClientRect();
  const submenuOpensRight = parentRect
    ? parentRect.right + submenuWidth + 8 <= window.innerWidth
    : true;
  const submenuX = parentRect
    ? submenuOpensRight
      ? parentRect.right + 4
      : parentRect.left - submenuWidth - 4
    : 0;
  const submenuY = parentRect
    ? Math.max(
        8,
        Math.min(
          parentRect.top,
          window.innerHeight - (submenuItems?.length ?? 0) * 40 - 16
        )
      )
    : 0;

  return (
    <AnimatePresence>
      {menu ? (
        <>
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-label="Canvas context menu"
            className="fixed z-100 min-w-[200px] overflow-hidden rounded-xl border border-black/5 bg-white/95 py-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/90"
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            ref={ref}
            role="menu"
            style={{ left: x, top: y }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          >
            {items.map((item, index) => (
              <button
                aria-disabled={item.disabled || undefined}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2 font-medium text-[13px] transition-colors',
                  item.disabled
                    ? 'cursor-default text-gray-300 dark:text-gray-600'
                    : item.danger
                      ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30'
                      : 'text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5',
                  !item.disabled && openSubmenu === item.id
                    ? 'bg-black/5 dark:bg-white/5'
                    : ''
                )}
                key={item.id}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  if (item.submenu) {
                    return;
                  }
                  onAction(item.id, menu.nodeId ?? menu.edgeId);
                  onClose();
                }}
                onMouseEnter={() => {
                  if (item.disabled) {
                    return;
                  }
                  activeIndexRef.current = index;
                  if (item.submenu) {
                    openSubmenuFor(item.id);
                  } else if (openSubmenu) {
                    scheduleCloseSubmenu();
                  }
                }}
                onMouseLeave={() => {
                  if (item.submenu) {
                    scheduleCloseSubmenu();
                  }
                }}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
              >
                <item.icon
                  className={
                    item.disabled
                      ? 'text-gray-300 dark:text-gray-600'
                      : item.danger
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-gray-400 dark:text-gray-500'
                  }
                  size={15}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {item.submenu ? (
                  <ChevronRight
                    className="text-gray-400 dark:text-gray-500"
                    size={14}
                  />
                ) : item.shortcut ? (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {item.shortcut}
                  </span>
                ) : null}
              </button>
            ))}
          </motion.div>

          <AnimatePresence>
            {openSubmenu && submenuItems ? (
              <motion.div
                animate={{ opacity: 1, scale: 1, x: 0 }}
                aria-label="New item submenu"
                className="fixed z-101 min-w-[180px] overflow-y-auto rounded-xl border border-black/5 bg-white/95 py-1 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/90"
                exit={{ opacity: 0, scale: 0.95, x: -4 }}
                initial={{ opacity: 0, scale: 0.95, x: -4 }}
                onMouseEnter={cancelCloseSubmenu}
                onMouseLeave={scheduleCloseSubmenu}
                ref={submenuRef}
                role="menu"
                style={{
                  left: submenuX,
                  maxHeight: 'calc(100vh - 16px)',
                  top: submenuY,
                }}
                transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              >
                {submenuItems.map((subItem, subIndex) => (
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 font-medium text-[13px] text-gray-700 transition-colors hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5"
                    key={subItem.id}
                    onClick={() => {
                      onAction(subItem.id, menu.nodeId ?? menu.edgeId);
                      onClose();
                    }}
                    onMouseEnter={() => {
                      submenuActiveIndexRef.current = subIndex;
                    }}
                    ref={(element) => {
                      submenuItemRefs.current[subIndex] = element;
                    }}
                    type="button"
                  >
                    <subItem.icon
                      className="text-gray-400 dark:text-gray-500"
                      size={15}
                    />
                    <span className="flex-1 text-left">{subItem.label}</span>
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </AnimatePresence>
  );
}
