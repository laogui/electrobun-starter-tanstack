import {
  BookOpen,
  ClipboardPaste,
  Copy,
  FileDown,
  FilePlus,
  FolderOpen,
  Link as LinkIcon,
  LogOut,
  Maximize2,
  Palette,
  PenLine,
  Sparkles,
  Spline,
  Tag,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { getCreatableMenuItems } from '@/lib/creatableNodes';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

interface MenuItem {
  danger?: boolean;
  icon: React.ElementType;
  id: string;
  label: string;
  shortcut?: string;
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
    | 'edge';
  nodeId?: string;
  edgeId?: string;
} | null;

const getCanvasItems = (): MenuItem[] => [
  ...getCreatableMenuItems('new').map((item) => ({
    id: `new-${item.id}`,
    label: item.label,
    icon: item.icon,
  })),
  { id: 'paste', label: m.menu_paste(), icon: ClipboardPaste, shortcut: '⌘V' },
  { id: 'reset-zoom', label: m.menu_reset_zoom(), icon: ZoomIn },
  {
    id: 'export-canvas-markdown',
    label: m.menu_export_canvas_markdown(),
    icon: FileDown,
  },
];

const getCardItems = (): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
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

const getFolderItems = (): MenuItem[] => [
  {
    id: 'open-folder',
    label: m.menu_open(),
    icon: FolderOpen,
    shortcut: 'Enter',
  },
  { id: 'rename', label: m.menu_rename(), icon: PenLine },
  { id: 'new-child', label: m.menu_new_card_inside(), icon: FilePlus },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getStickyItems = (): MenuItem[] => [
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getGroupItems = (): MenuItem[] => [
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getImageItems = (): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getLinkItems = (): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'edit-url', label: 'Edit URL', icon: LinkIcon },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
  { id: 'detach-from-canvas', label: m.menu_move_to_library(), icon: BookOpen },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getAssetItems = (): MenuItem[] => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'edit-tag', label: m.menu_edit_tag(), icon: Tag },
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
  const edgePathType = useCanvasStore((state) => {
    if (menu?.target !== 'edge' || !menu.edgeId) {
      return 'bezier';
    }

    const edge = state.edges.find((item) => item.id === menu.edgeId);
    const pathType = (edge?.data as { pathType?: unknown } | undefined)
      ?.pathType;
    return pathType === 'smoothstep' ? 'smoothstep' : 'bezier';
  });

  useEffect(() => {
    if (!menu) {
      return;
    }
    const handleClick = (e: PointerEvent) => {
      // Ignore right/middle clicks — let the contextmenu event reposition the
      // menu instead of closing-then-reopening (which races with React updates
      // and makes the first right-click appear unresponsive).
      const button = e.button ?? 0;
      if (button !== 0) {
        return;
      }
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu, onClose]);

  const itemGetters: Record<string, () => MenuItem[]> = {
    edge: () => getEdgeItems(edgePathType),
    'folder-child': getFolderChildItems,
    folder: getFolderItems,
    group: getGroupItems,
    sticky: getStickyItems,
    image: getImageItems,
    link: getLinkItems,
    asset: getAssetItems,
    card: getCardItems,
    canvas: getCanvasItems,
  };

  const items = menu ? (itemGetters[menu.target] ?? getCanvasItems)() : [];

  const x = menu ? Math.min(menu.x, window.innerWidth - 220) : 0;
  const y = menu
    ? Math.min(menu.y, window.innerHeight - items.length * 40 - 16)
    : 0;

  return (
    <AnimatePresence>
      {menu ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
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
          style={{ left: x, top: y }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        >
          {items.map((item) => (
            <button
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 font-medium text-[13px] transition-colors',
                item.danger
                  ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30'
                  : 'text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/5'
              )}
              key={item.id}
              onClick={() => {
                onAction(item.id, menu.nodeId ?? menu.edgeId);
                onClose();
              }}
              type="button"
            >
              <item.icon
                className={
                  item.danger
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'
                }
                size={15}
              />
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut ? (
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
