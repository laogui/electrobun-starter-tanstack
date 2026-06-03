import { useEffect, useRef } from 'react';

import type { LinkNodeData } from '@/lib/contentTypes';

import { LinkCreateForm } from './LinkCreateForm';

const POPOVER_WIDTH = 280;
const VIEWPORT_MARGIN = 16;

/**
 * Floating wrapper around `LinkCreateForm` used by the canvas right-click menu
 * to collect a URL at the click location. The bottom create menu renders
 * `LinkCreateForm` inline instead, so both entry points share the same form
 * while keeping their own placement.
 */
export function LinkCreatePopover({
  screen,
  onCreate,
  onClose,
}: {
  onClose: () => void;
  onCreate: (data: LinkNodeData) => void;
  screen?: { x: number; y: number };
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const left = screen
    ? Math.min(screen.x, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN)
    : window.innerWidth / 2 - POPOVER_WIDTH / 2;
  const top = screen
    ? Math.min(screen.y, window.innerHeight - 120)
    : window.innerHeight / 2 - 60;

  return (
    <div
      className="fixed z-100 overflow-hidden rounded-xl border border-black/5 bg-white/95 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/90"
      ref={ref}
      style={{ left, top, width: POPOVER_WIDTH }}
    >
      <LinkCreateForm onCreate={onCreate} />
    </div>
  );
}
