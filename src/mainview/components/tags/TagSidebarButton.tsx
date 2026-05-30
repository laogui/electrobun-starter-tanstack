import { Tag as TagIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

/**
 * Floating top-left affordance (stacked below LibraryButton) that toggles
 * the workspace tag filter sidebar. When a tag filter is active, the
 * button shows a small accent dot to remind the user.
 */
export function TagSidebarButton() {
  const toggle = useCanvasStore((s) => s.toggleTagSidebar);
  const activeCount = useCanvasStore((s) => s.activeTagFilters.length);
  const hasFilters = activeCount > 0;
  return (
    <button
      aria-label={m.tags_button_aria()}
      className={cn(
        'absolute z-30 flex size-9 items-center justify-center rounded-lg border border-black/5 bg-white/80 text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-neutral-900 dark:border-white/5 dark:bg-neutral-800/80 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-white',
        hasFilters && 'text-primary dark:text-primary'
      )}
      onClick={() => {
        toggle();
      }}
      style={{
        top: 'calc(var(--app-titlebar-height, 2.5rem) + 56px)',
        left: 12,
      }}
      title={m.tags_button_aria()}
      type="button"
    >
      <TagIcon size={16} strokeWidth={1.8} />
      {hasFilters ? (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary"
        />
      ) : null}
    </button>
  );
}
