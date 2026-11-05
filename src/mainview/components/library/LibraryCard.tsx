import { useEffect, useRef } from 'react';

import { TypeBadge } from '@/components/canvas/nodes/_shared/TypeBadge';
import { formatRelativeTime } from '@/lib/formatRelative';
import { cn } from '@/lib/utils';
import * as m from '../../../paraglide/messages.js';
import {
  FILE_CANVAS_TYPE_ID,
  IMAGE_CANVAS_TYPE_ID,
  LINK_CANVAS_TYPE_ID,
} from '../../../shared/extensions/builtinIds';
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

/** Capsule label painted by library chrome (fixed size, never scaled). */
function typeLabelFor(type: string, data: Record<string, unknown>): string {
  if (type === 'image') {
    return 'Image';
  }
  if (type === 'link') {
    return 'Link';
  }
  if (type === 'asset') {
    return assetTypeLabel(data);
  }
  if (type === 'sticky') {
    return 'Sticky';
  }
  if (type === 'extension') {
    const canvasTypeId =
      typeof data.canvasTypeId === 'string' ? data.canvasTypeId : '';
    if (canvasTypeId === IMAGE_CANVAS_TYPE_ID) {
      return 'Image';
    }
    if (canvasTypeId === LINK_CANVAS_TYPE_ID) {
      return 'Link';
    }
    if (canvasTypeId === FILE_CANVAS_TYPE_ID) {
      return assetTypeLabel(data);
    }
  }
  return 'Note';
}

/** Mirrors AssetNode's getAssetLabel so library pills match canvas ones. */
function assetTypeLabel(data: Record<string, unknown>): string {
  if (data.missing === true) {
    return 'Missing';
  }
  const mimeType = typeof data.mimeType === 'string' ? data.mimeType : '';
  if (mimeType === 'application/pdf') {
    return 'PDF';
  }
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed'
  ) {
    return 'Archive';
  }
  if (mimeType.startsWith('text/')) {
    return 'Text';
  }
  if (data.kind === 'video') {
    return 'Video';
  }
  if (data.kind === 'audio') {
    return 'Audio';
  }
  return 'File';
}

/**
 * Fixed-size library card: a scaled-down live preview of the real canvas card
 * (same rendering path as folder thumbnails) above a compact footer with the
 * title and relative timestamp. Type is always a fixed-size top-right capsule
 * painted by this chrome layer — never the scaled-down badge inside the
 * miniature — so every card's pill is the same size.
 */
export function LibraryCard({
  item,
  onClick,
  isFocused = false,
  onFocus,
}: LibraryCardProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const typeLabel = typeLabelFor(item.type, item.data);
  const missing =
    (item.type === 'asset' && item.data.missing === true) ||
    (item.type === 'extension' &&
      item.data.canvasTypeId === FILE_CANVAS_TYPE_ID &&
      item.data.missing === true);
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
      aria-label={title}
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
      <span className="relative block">
        <LibraryItemPreview item={item} />
        <TypeBadge
          className="absolute top-2 right-2 z-10 border-black/5 bg-white/85 text-neutral-600 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-black/55 dark:text-neutral-200"
          missing={missing}
        >
          {typeLabel}
        </TypeBadge>
      </span>
      {/* The miniature above already renders the live title, so the footer
          carries only the timestamp to avoid printing the same heading twice. */}
      {relative ? (
        <span className="flex items-center border-gray-100 border-t px-3 py-2 text-2xs text-gray-400 dark:border-neutral-800 dark:text-neutral-500">
          <span className="truncate">{relative}</span>
        </span>
      ) : null}
    </button>
  );
}
