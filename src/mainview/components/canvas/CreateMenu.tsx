import {
  File,
  Folder,
  Group,
  ImageIcon,
  NotebookPen,
  Plus,
  StickyNote,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import * as m from '../../../paraglide/messages.js';

const getMenuItems = () => [
  { id: 'note', label: m.menu_note(), icon: StickyNote, enabled: true },
  { id: 'sticky', label: m.menu_sticky(), icon: NotebookPen, enabled: true },
  { id: 'image', label: m.menu_image(), icon: ImageIcon, enabled: true },
  { id: 'folder', label: m.menu_folder(), icon: Folder, enabled: true },
  { id: 'group', label: m.menu_group(), icon: Group, enabled: true },
  { id: 'file', label: m.menu_file(), icon: File, enabled: false },
];

export function CreateMenu({
  onCreateNode,
  open,
  setOpen,
}: {
  onCreateNode: (
    type: 'card' | 'image' | 'folder' | 'group' | 'sticky'
  ) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as HTMLElement)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, setOpen]);

  const handleSelect = (id: string) => {
    switch (id) {
      case 'note': {
        onCreateNode('card');
        break;
      }
      case 'sticky': {
        onCreateNode('sticky');
        break;
      }
      case 'image': {
        onCreateNode('image');
        break;
      }
      case 'folder': {
        onCreateNode('folder');
        break;
      }
      case 'group': {
        onCreateNode('group');
        break;
      }
    }
    setOpen(false);
  };

  const menuItems = getMenuItems();

  return (
    <div
      className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-3"
      ref={menuRef}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="mb-1 overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md"
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          >
            {menuItems.map((item, index) => (
              <button
                className={`flex w-full items-center gap-3 px-4 py-3 font-medium text-sm transition-colors ${
                  item.enabled
                    ? 'text-gray-800 hover:bg-black/5'
                    : 'cursor-not-allowed text-gray-400'
                }${index < menuItems.length - 1 ? 'border-gray-100 border-b' : ''}`}
                disabled={!item.enabled}
                key={item.id}
                onClick={() => item.enabled && handleSelect(item.id)}
                type="button"
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        animate={{ rotate: open ? 45 : 0 }}
        className="flex size-12 items-center justify-center rounded-full bg-black text-white shadow-xl"
        onClick={() => {
          setOpen(!open);
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        whileHover={{ scale: 1.1, boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus size={24} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
