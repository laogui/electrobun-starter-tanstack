import { Library, Settings, Tag as TagIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';

/**
 * Floating top-left toolbar that groups the canvas-level entry points
 * (note library, tag filter, settings) into a single frosted pill instead
 * of three loose buttons. Sits just below the transparent titlebar.
 */
export function CanvasToolbar() {
  const toggleLibrary = useCanvasStore((s) => s.toggleLibrary);
  const toggleTagSidebar = useCanvasStore((s) => s.toggleTagSidebar);
  const activeTagCount = useCanvasStore((s) => s.activeTagFilters.length);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  const setSettingsOpen = useCanvasStore((s) => s.setSettingsOpen);
  const hasTagFilters = activeTagCount > 0;

  return (
    <div
      className="absolute z-30 flex flex-col gap-1 rounded-2xl border border-black/5 bg-white/80 p-1 shadow-xs backdrop-blur-md dark:border-white/10 dark:bg-neutral-800/80"
      style={{
        top: 'calc(var(--app-titlebar-height, 2.5rem) + 8px)',
        left: 12,
      }}
    >
      <ToolbarButton
        label={m.library_button_aria()}
        onClick={() => {
          toggleLibrary();
        }}
      >
        <Library size={16} strokeWidth={1.8} />
      </ToolbarButton>

      <ToolbarButton
        active={hasTagFilters}
        label={m.tags_button_aria()}
        onClick={() => {
          toggleTagSidebar();
        }}
      >
        <TagIcon size={16} strokeWidth={1.8} />
        {hasTagFilters ? (
          <span
            aria-hidden
            className="absolute top-1 right-1 size-2 rounded-full bg-primary"
          />
        ) : null}
      </ToolbarButton>

      <div className="mx-1.5 my-0.5 h-px bg-black/5 dark:bg-white/10" />

      <ToolbarButton
        label={m.settings_title()}
        onClick={() => {
          setSearchOpen(false);
          setSettingsOpen(true);
        }}
      >
        <Settings size={16} strokeWidth={1.8} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        'relative flex size-8 items-center justify-center rounded-xl text-neutral-600 transition-colors hover:bg-black/5 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white',
        active && 'text-primary dark:text-primary'
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
