import {
  ClipboardPaste,
  Copy,
  FilePlus,
  Folder,
  FolderInput,
  FolderOpen,
  Group,
  ImageIcon,
  Maximize2,
  NotebookPen,
  Palette,
  PenLine,
  Sparkles,
  Spline,
  StickyNote,
  Tag,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

type MenuItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  danger?: boolean;
};

type ContextMenuState = {
  x: number;
  y: number;
  target: 'canvas' | 'card' | 'image' | 'folder' | 'group' | 'sticky' | 'edge';
  nodeId?: string;
  edgeId?: string;
} | null;

const getCanvasItems = (): Array<MenuItem> => [
  {
    id: 'new-note',
    label: m.menu_new_note(),
    icon: StickyNote,
    shortcut: '⌘N',
  },
  { id: 'new-sticky', label: m.menu_new_sticky(), icon: NotebookPen },
  { id: 'new-image', label: m.menu_new_image(), icon: ImageIcon },
  { id: 'new-folder', label: m.menu_new_folder(), icon: Folder },
  { id: 'new-group', label: m.menu_new_group(), icon: Group },
  { id: 'paste', label: m.menu_paste(), icon: ClipboardPaste, shortcut: '⌘V' },
  { id: 'reset-zoom', label: m.menu_reset_zoom(), icon: ZoomIn },
];

const getCardItems = (): Array<MenuItem> => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  { id: 'move-to-folder', label: m.menu_move_to_folder(), icon: FolderInput },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getFolderItems = (): Array<MenuItem> => [
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

const getStickyItems = (): Array<MenuItem> => [
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getGroupItems = (): Array<MenuItem> => [
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getImageItems = (): Array<MenuItem> => [
  {
    id: 'focus',
    label: m.menu_open_focused(),
    icon: Maximize2,
    shortcut: 'Enter',
  },
  { id: 'copy', label: m.menu_copy(), icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: m.menu_change_color(), icon: Palette },
  {
    id: 'delete',
    label: m.menu_delete(),
    icon: Trash2,
    shortcut: '⌫',
    danger: true,
  },
];

const getEdgeItems = (): Array<MenuItem> => [
  { id: 'edit-edge-label', label: m.menu_edit_label(), icon: Tag },
  {
    id: 'toggle-edge-animated',
    label: m.menu_toggle_animation(),
    icon: Sparkles,
  },
  {
    id: 'toggle-edge-path-type',
    label: m.menu_toggle_path_type(),
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

  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu, onClose]);

  const items =
    menu?.target === 'edge'
      ? getEdgeItems()
      : menu?.target === 'folder'
        ? getFolderItems()
        : menu?.target === 'group'
          ? getGroupItems()
          : menu?.target === 'sticky'
            ? getStickyItems()
            : menu?.target === 'image'
              ? getImageItems()
              : menu?.target === 'card'
                ? getCardItems()
                : getCanvasItems();

  const x = menu ? Math.min(menu.x, window.innerWidth - 220) : 0;
  const y = menu
    ? Math.min(menu.y, window.innerHeight - items.length * 40 - 16)
    : 0;

  return (
    <AnimatePresence>
      {menu ? (
        <motion.div
          ref={ref}
          className='fixed z-100 min-w-[200px] overflow-hidden rounded-xl border border-black/5 bg-white/95 py-1 shadow-xl backdrop-blur-xl'
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-[13px] font-medium transition-colors',
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-black/5'
              )}
              onClick={() => {
                onAction(item.id, menu.nodeId ?? menu.edgeId);
                onClose();
              }}
            >
              <item.icon
                size={15}
                className={item.danger ? 'text-red-500' : 'text-gray-400'}
              />
              <span className='flex-1 text-left'>{item.label}</span>
              {item.shortcut ? (
                <span className='text-[11px] text-gray-400'>
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
