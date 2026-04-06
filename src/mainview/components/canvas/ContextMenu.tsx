import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  StickyNote,
  Folder,
  ClipboardPaste,
  ZoomIn,
  Copy,
  Trash2,
  Palette,
  FolderInput,
  Maximize2,
  FolderOpen,
  PenLine,
  FilePlus,
  Group,
  NotebookPen,
  ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  target: 'canvas' | 'card' | 'image' | 'folder' | 'group' | 'sticky';
  nodeId?: string;
} | null;

const canvasItems: MenuItem[] = [
  { id: 'new-note', label: 'New Note', icon: StickyNote, shortcut: '⌘N' },
  { id: 'new-sticky', label: 'New Sticky', icon: NotebookPen },
  { id: 'new-image', label: 'New Image', icon: ImageIcon },
  { id: 'new-folder', label: 'New Folder', icon: Folder },
  { id: 'new-group', label: 'New Group', icon: Group },
  { id: 'paste', label: 'Paste', icon: ClipboardPaste, shortcut: '⌘V' },
  { id: 'reset-zoom', label: 'Reset Zoom', icon: ZoomIn },
];

const cardItems: MenuItem[] = [
  { id: 'focus', label: 'Open Focused', icon: Maximize2, shortcut: 'Enter' },
  { id: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: 'Change Color', icon: Palette },
  { id: 'move-to-folder', label: 'Move to Folder', icon: FolderInput },
  { id: 'delete', label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true },
];

const folderItems: MenuItem[] = [
  { id: 'open-folder', label: 'Open', icon: FolderOpen, shortcut: 'Enter' },
  { id: 'rename', label: 'Rename', icon: PenLine },
  { id: 'new-child', label: 'New Card Inside', icon: FilePlus },
  { id: 'delete', label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true },
];

const stickyItems: MenuItem[] = [
  { id: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: 'Change Color', icon: Palette },
  { id: 'delete', label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true },
];

const groupItems: MenuItem[] = [
  { id: 'change-color', label: 'Change Color', icon: Palette },
  { id: 'delete', label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true },
];

const imageItems: MenuItem[] = [
  { id: 'focus', label: 'Open Focused', icon: Maximize2, shortcut: 'Enter' },
  { id: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C' },
  { id: 'change-color', label: 'Change Color', icon: Palette },
  { id: 'delete', label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true },
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
    // Use capture phase so we receive the event before React Flow stops propagation
    document.addEventListener('pointerdown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu, onClose]);

  const items =
    menu?.target === 'folder'
      ? folderItems
      : menu?.target === 'group'
        ? groupItems
        : menu?.target === 'sticky'
          ? stickyItems
          : menu?.target === 'image'
            ? imageItems
            : menu?.target === 'card'
              ? cardItems
              : canvasItems;

  // Position clamping
  const x = menu ? Math.min(menu.x, window.innerWidth - 220) : 0;
  const y = menu ? Math.min(menu.y, window.innerHeight - items.length * 40 - 16) : 0;

  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={ref}
          className="fixed z-[100] min-w-[200px] bg-white/95 backdrop-blur-xl rounded-xl shadow-xl border border-black/5 overflow-hidden py-1"
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
                "flex items-center gap-3 w-full px-3 py-2 text-[13px] font-medium transition-colors",
                item.danger
                  ? "text-red-600 hover:bg-red-50"
                  : "text-gray-700 hover:bg-black/5"
              )}
              onClick={() => {
                onAction(item.id, menu.nodeId);
                onClose();
              }}
            >
              <item.icon size={15} className={item.danger ? "text-red-500" : "text-gray-400"} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[11px] text-gray-400">{item.shortcut}</span>
              )}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
