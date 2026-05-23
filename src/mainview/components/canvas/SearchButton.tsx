import { Search } from 'lucide-react';

import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

const isMac =
  typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

/**
 * Floating top-left search button, positioned below the LibraryButton.
 * Opens the global SearchDialog and shows a ⌘K / Ctrl+K shortcut hint.
 */
export function SearchButton() {
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  return (
    <button
      aria-label={m.search_button_aria()}
      className="absolute z-30 flex items-center gap-1.5 rounded-lg border border-black/5 bg-white/80 px-2 py-1.5 text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-neutral-900 dark:border-white/5 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-white"
      onClick={() => {
        setSearchOpen(true);
      }}
      style={{
        top: 'calc(var(--app-titlebar-height, 2.5rem) + 8px)',
        left: 52,
      }}
      title={`${m.search_button_aria()} (${isMac ? '⌘' : 'Ctrl+'}K)`}
      type="button"
    >
      <Search size={15} strokeWidth={1.8} />
      <kbd className="hidden text-[10px] text-neutral-400 sm:inline dark:text-neutral-500">
        {isMac ? '⌘K' : '⌃K'}
      </kbd>
    </button>
  );
}
