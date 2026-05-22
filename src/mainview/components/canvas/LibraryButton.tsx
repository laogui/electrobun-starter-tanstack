import { Library } from 'lucide-react';

import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

/**
 * Floating top-left entry point for the note library. Sits below the titlebar
 * and opens the LibraryPopup overlay.
 */
export function LibraryButton() {
  const toggleLibrary = useCanvasStore((s) => s.toggleLibrary);
  return (
    <button
      aria-label={m.library_button_aria()}
      className="absolute z-30 flex size-9 items-center justify-center rounded-lg border border-black/5 bg-white/80 text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-neutral-900 dark:border-white/5 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-white"
      onClick={() => {
        toggleLibrary();
      }}
      style={{
        top: 'calc(var(--app-titlebar-height, 2.5rem) + 8px)',
        left: 12,
      }}
      title={m.library_button_aria()}
      type="button"
    >
      <Library size={16} strokeWidth={1.8} />
    </button>
  );
}
