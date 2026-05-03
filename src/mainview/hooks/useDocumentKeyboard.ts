import { useEffect } from 'react';

import { useCanvasStore } from '@/store/canvasStore';

/**
 * Keyboard shortcuts for document mode.
 *
 * Per decision 13 (docs/todo/双布局-PRD-待决问题.md), document mode does NOT
 * expose Enter / Escape / Delete / Cmd+A / Cmd+N / Cmd+C / Cmd+V / Cmd+Z;
 * Tiptap handles undo/redo and editing locally. The only canvas-style hotkey
 * preserved is the global search shortcut (Cmd/Ctrl+K, plus the legacy
 * Cmd/Ctrl+F alias) so users can still open the search dialog from the rail
 * or note list.
 */
export function useDocumentKeyboard() {
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'k' || key === 'f') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);

    const handleOpenSearch = () => {
      setSearchOpen(true);
    };
    globalThis.addEventListener('open-search', handleOpenSearch);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('open-search', handleOpenSearch);
    };
  }, [setSearchOpen]);
}
