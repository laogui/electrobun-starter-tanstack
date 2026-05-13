import { Menu } from '@base-ui/react/menu';
import {
  File,
  Folder,
  Group,
  ImageIcon,
  Link as LinkIcon,
  ListChecks,
  NotebookPen,
  Plus,
  StickyNote,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { LinkCreateForm } from '@/components/canvas/LinkCreateForm';
import { saveAssetFile } from '@/lib/assetFiles';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import type { CreateNodeOptions } from '@/store/canvasStore';
import * as m from '../../../paraglide/messages.js';

const getMenuItems = () => [
  { id: 'note', label: m.menu_note(), icon: StickyNote, enabled: true },
  {
    id: 'checklist',
    label: m.menu_checklist(),
    icon: ListChecks,
    enabled: true,
  },
  { id: 'sticky', label: m.menu_sticky(), icon: NotebookPen, enabled: true },
  { id: 'image', label: m.menu_image(), icon: ImageIcon, enabled: true },
  { id: 'link', label: 'Link', icon: LinkIcon, enabled: true },
  { id: 'folder', label: m.menu_folder(), icon: Folder, enabled: true },
  { id: 'group', label: m.menu_group(), icon: Group, enabled: true },
  { id: 'file', label: m.menu_file(), icon: File, enabled: true },
];

export function CreateMenu({
  onCreateNode,
  open,
  setOpen,
}: {
  onCreateNode: (
    type: CreatableCanvasNodeKind,
    options?: CreateNodeOptions
  ) => void;
  open: boolean;
  setOpen: (v: boolean, details?: unknown) => void;
}) {
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const data = await saveAssetFile(file);
        onCreateNode('asset', { data: { ...data } });
        setOpen(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'File could not be saved.';
        toast.error(message);
      }
    },
    [onCreateNode, setOpen]
  );

  const handleSelect = (id: string) => {
    switch (id) {
      case 'note': {
        onCreateNode('card');
        break;
      }
      case 'checklist': {
        onCreateNode('checklist');
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
      case 'link': {
        setLinkFormOpen(true);
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
      case 'file': {
        fileInputRef.current?.click();
        break;
      }
    }
  };

  const menuItems = getMenuItems();

  return (
    <div className="fixed right-6 bottom-6 z-40">
      <input
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            handleFile(file);
          }
          event.target.value = '';
        }}
        ref={fileInputRef}
        type="file"
      />
      <Menu.Root
        onOpenChange={(nextOpen, details) => {
          if (!nextOpen) {
            setLinkFormOpen(false);
          }
          setOpen(nextOpen, details);
        }}
        open={open}
      >
        <Menu.Trigger className="flex size-12 items-center justify-center rounded-full bg-black text-white shadow-xl ring-1 ring-white/10 transition-shadow hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] dark:bg-neutral-100 dark:text-black dark:ring-black/10 dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
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
            <Menu.Popup className="min-w-50 overflow-hidden rounded-2xl bg-white/90 shadow-lg backdrop-blur-md transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-neutral-800/90">
              {menuItems.map((item, index) => {
                const isLast = index === menuItems.length - 1;
                return (
                  <Menu.Item
                    aria-label={item.label}
                    className={`flex cursor-default items-center gap-3 px-4 py-3 font-medium text-sm outline-hidden ${
                      item.enabled
                        ? 'text-gray-800 data-highlighted:bg-black/5 dark:text-gray-200 dark:data-highlighted:bg-white/5'
                        : 'cursor-not-allowed text-gray-400 dark:text-gray-600'
                    } ${isLast ? '' : 'border-gray-100 border-b dark:border-neutral-700'}`}
                    closeOnClick={item.id !== 'link' && item.id !== 'file'}
                    disabled={!item.enabled}
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </Menu.Item>
                );
              })}
              {linkFormOpen ? (
                <LinkCreateForm
                  onCreate={(data) => {
                    onCreateNode('link', { data: { ...data } });
                    setOpen(false);
                  }}
                />
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
