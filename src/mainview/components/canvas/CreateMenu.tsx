import { Menu } from '@base-ui/react/menu';
import {
  File,
  Folder,
  Group,
  ImageIcon,
  NotebookPen,
  Plus,
  StickyNote,
} from 'lucide-react';
import { motion } from 'motion/react';

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
  };

  const menuItems = getMenuItems();

  return (
    <div className="fixed right-6 bottom-6 z-40">
      <Menu.Root onOpenChange={setOpen} open={open}>
        <Menu.Trigger className="flex size-12 items-center justify-center rounded-full bg-black text-white shadow-xl transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
          <motion.span
            animate={{ rotate: open ? 45 : 0 }}
            className="flex items-center justify-center"
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <Plus size={24} strokeWidth={2.5} />
          </motion.span>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner
            align="end"
            className="z-50 outline-hidden"
            side="top"
            sideOffset={12}
          >
            <Menu.Popup className="min-w-50 overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0">
              {menuItems.map((item, index) => {
                const isLast = index === menuItems.length - 1;
                return (
                  <Menu.Item
                    aria-label={item.label}
                    className={`flex cursor-default items-center gap-3 px-4 py-3 font-medium text-sm outline-hidden ${
                      item.enabled
                        ? 'text-gray-800 data-highlighted:bg-black/5'
                        : 'cursor-not-allowed text-gray-400'
                    } ${isLast ? '' : 'border-gray-100 border-b'}`}
                    closeOnClick
                    disabled={!item.enabled}
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Menu.Item>
                );
              })}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
