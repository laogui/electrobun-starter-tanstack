import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, StickyNote, Folder, File } from 'lucide-react';

const menuItems = [
  { id: 'note', label: 'Note', icon: StickyNote, enabled: true },
  { id: 'folder', label: 'Folder', icon: Folder, enabled: true },
  { id: 'file', label: 'File', icon: File, enabled: false },
];

export function CreateMenu({ onCreateNode, open, setOpen }: { onCreateNode: (type: 'card' | 'folder') => void; open: boolean; setOpen: (v: boolean) => void }) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = (id: string) => {
    if (id === 'note') onCreateNode('card');
    else if (id === 'folder') onCreateNode('folder');
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg overflow-hidden mb-1"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          >
            {menuItems.map((item, index) => (
              <button
                key={item.id}
                className={
                  "flex items-center gap-3 w-full px-4 py-3 text-sm font-medium transition-colors " +
                  (item.enabled
                    ? "text-gray-800 hover:bg-black/5"
                    : "text-gray-400 cursor-not-allowed") +
                  (index < menuItems.length - 1 ? " border-b border-gray-100" : "")
                }
                disabled={!item.enabled}
                onClick={() => item.enabled && handleSelect(item.id)}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className="w-12 h-12 rounded-full bg-black text-white shadow-xl flex items-center justify-center"
        onClick={() => setOpen(!open)}
        animate={{ rotate: open ? 45 : 0 }}
        whileHover={{ scale: 1.1, boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <Plus size={24} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
