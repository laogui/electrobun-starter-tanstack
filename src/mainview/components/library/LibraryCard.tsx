import {
  Bell,
  Clock3,
  FileText,
  ImageIcon,
  Link2,
  ListChecks,
  Paperclip,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import { formatRelativeTime } from '@/lib/formatRelative';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';
import { LibraryItemPreview } from './LibraryItemPreview';
import type { LibraryItem } from './useLibraryData';

interface LibraryCardProps {
  /** Whether this card is the keyboard-focused entry (drives the focus ring
   *  and programmatic focus / scroll-into-view). */
  isFocused?: boolean;
  item: LibraryItem;
  onClick: (item: LibraryItem) => void;
  /** Called when the card receives focus (mouse or keyboard) so the popup can
   *  keep its `focusedIndex` in sync with the DOM. */
  onFocus?: (item: LibraryItem) => void;
}

function iconFor(type: string, data: Record<string, unknown>) {
  if (type === 'image') {
    return ImageIcon;
  }
  if (type === 'asset') {
    return Paperclip;
  }
  if (type === 'link') {
    return Link2;
  }
  if (type === 'card' && data.type === 'checklist') {
    return ListChecks;
  }
  if (type === 'widget') {
    if (data.kind === 'checklist') {
      return ListChecks;
    }
    if (data.kind === 'pomodoro') {
      return Clock3;
    }
    if (data.kind === 'reminder') {
      return Bell;
    }
  }
  return FileText;
}

/**
 * Fixed-size library card: a scaled-down live preview of the real canvas card
 * (same rendering path as folder thumbnails) above a compact footer with the
 * title, type icon, and relative timestamp.
 */
export function LibraryCard({
  item,
  onClick,
  isFocused = false,
  onFocus,
}: LibraryCardProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const Icon = iconFor(item.type, item.data);
  const relative = formatRelativeTime(item.updatedAt);
  const title =
    item.title.trim().length > 0 ? item.title : m.library_untitled();

  // Keyboard navigation (D2): when this card becomes the active entry, move
  // DOM focus to it and keep it in view inside the scroll container.
  useEffect(() => {
    if (isFocused && buttonRef.current) {
      buttonRef.current.focus({ preventScroll: true });
      buttonRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isFocused]);

  return (
    <button
      className={cn(
        'group relative flex w-[208px] flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white text-left transition-[transform,border-color,box-shadow,background-color]',
        'hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.12)]',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60',
        'dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700',
        isFocused && 'border-accent ring-2 ring-accent/60'
      )}
      onClick={() => onClick(item)}
      onFocus={() => onFocus?.(item)}
      ref={buttonRef}
      type="button"
    >
      <LibraryItemPreview item={item} />
      <span className="flex flex-col gap-1 border-gray-100 border-t px-3 py-2.5 dark:border-neutral-800">
        <span className="truncate font-medium text-[13px] text-gray-900 leading-snug dark:text-gray-100">
          {title}
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-gray-400 dark:text-neutral-500">
          <Icon aria-hidden size={11} strokeWidth={1.75} />
          {relative ? <span className="truncate">{relative}</span> : null}
        </span>
      </span>
    </button>
  );
}
