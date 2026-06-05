import {
  FileText,
  ImageIcon,
  Link2,
  ListChecks,
  Paperclip,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';
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

const RELATIVE_TIME_UNITS: Array<{
  limit: number;
  divisor: number;
  unit: Intl.RelativeTimeFormatUnit;
}> = [
  { limit: 60_000, divisor: 1000, unit: 'second' },
  { limit: 3_600_000, divisor: 60_000, unit: 'minute' },
  { limit: 86_400_000, divisor: 3_600_000, unit: 'hour' },
  { limit: 604_800_000, divisor: 86_400_000, unit: 'day' },
  { limit: 2_592_000_000, divisor: 604_800_000, unit: 'week' },
  { limit: 31_536_000_000, divisor: 2_592_000_000, unit: 'month' },
];

function formatRelative(timestamp: number): string {
  if (!timestamp) {
    return '';
  }
  const diff = timestamp - Date.now();
  const absDiff = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const { limit, divisor, unit } of RELATIVE_TIME_UNITS) {
    if (absDiff < limit) {
      return rtf.format(Math.round(diff / divisor), unit);
    }
  }
  return rtf.format(Math.round(diff / 31_536_000_000), 'year');
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
  return FileText;
}

function readStr(data: Record<string, unknown>, key: string): string {
  const v = data[key];
  return typeof v === 'string' && v.trim().length > 0 ? v : '';
}

/** A renderable preview for the card's 16:9 header region. */
type Thumb =
  | { kind: 'image'; src: string }
  | { kind: 'favicon'; src: string }
  | { kind: 'excerpt'; text: string }
  | { kind: 'none' };

/**
 * Derive the best available preview for a library item from its node data.
 * - image / asset → hydrated `thumbnailUrl` (falls back to `imageUrl` /
 *   `previewUrl`); text assets fall back to their persisted excerpt.
 * - link → OG `imageUrl`, then `faviconUrl`.
 * - text cards → 2–3 line excerpt from `previewExcerpt` / `content`.
 */
function resolveThumb(item: LibraryItem): Thumb {
  const data = item.data;
  if (item.type === 'image') {
    const src = readStr(data, 'thumbnailUrl') || readStr(data, 'imageUrl');
    return src ? { kind: 'image', src } : { kind: 'none' };
  }
  if (item.type === 'asset') {
    const src = readStr(data, 'thumbnailUrl') || readStr(data, 'previewUrl');
    if (src) {
      return { kind: 'image', src };
    }
    const excerpt = readStr(data, 'previewExcerpt');
    return excerpt ? { kind: 'excerpt', text: excerpt } : { kind: 'none' };
  }
  if (item.type === 'link') {
    const image = readStr(data, 'imageUrl');
    if (image) {
      return { kind: 'image', src: image };
    }
    const favicon = readStr(data, 'faviconUrl');
    return favicon ? { kind: 'favicon', src: favicon } : { kind: 'none' };
  }
  // Text / checklist cards: prefer the persisted excerpt, fall back to the
  // raw stored markdown/plain content.
  const excerpt = readStr(data, 'previewExcerpt') || readStr(data, 'content');
  return excerpt ? { kind: 'excerpt', text: excerpt } : { kind: 'none' };
}

function ThumbRegion({ thumb }: { thumb: Thumb }) {
  if (thumb.kind === 'none') {
    return null;
  }
  if (thumb.kind === 'image') {
    return (
      <div className="aspect-[16/9] w-full overflow-hidden bg-gray-100 dark:bg-neutral-800">
        <img
          alt=""
          aria-hidden
          className="size-full object-cover"
          draggable={false}
          loading="lazy"
          src={thumb.src}
        />
      </div>
    );
  }
  if (thumb.kind === 'favicon') {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center bg-gray-50 dark:bg-neutral-800/60">
        <img
          alt=""
          aria-hidden
          className="size-8 rounded object-contain"
          draggable={false}
          loading="lazy"
          src={thumb.src}
        />
      </div>
    );
  }
  // excerpt
  return (
    <div className="aspect-[16/9] w-full overflow-hidden bg-gray-50 px-3 py-2.5 dark:bg-neutral-800/40">
      <p className="line-clamp-3 whitespace-pre-line text-[11px] text-gray-500 leading-relaxed dark:text-neutral-400">
        {thumb.text}
      </p>
    </div>
  );
}

export function LibraryCard({
  item,
  onClick,
  isFocused = false,
  onFocus,
}: LibraryCardProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const Icon = useMemo(
    () => iconFor(item.type, item.data),
    [item.type, item.data]
  );
  const relative = useMemo(
    () => formatRelative(item.updatedAt),
    [item.updatedAt]
  );
  const thumb = useMemo(() => resolveThumb(item), [item]);
  const hasThumb = thumb.kind !== 'none';
  const title =
    item.title.trim().length > 0 ? item.title : m.library_untitled();
  // Only treat hex colors as renderable; semantic tokens (e.g. group "blue")
  // don't apply to focusable library items but guard anyway.
  const hexColor =
    typeof item.color === 'string' && item.color.startsWith('#')
      ? item.color
      : undefined;
  const hasColor = Boolean(hexColor);

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
        'group relative flex flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white text-left transition-all',
        'hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.12)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60',
        'dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/70',
        isFocused &&
          'border-blue-400 ring-2 ring-blue-500/60 dark:border-blue-500',
        !hasThumb && 'min-h-[108px]'
      )}
      onClick={() => onClick(item)}
      onFocus={() => onFocus?.(item)}
      ref={buttonRef}
      type="button"
    >
      {hasColor ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 z-10 w-[3px] rounded-l-xl"
          style={{ backgroundColor: hexColor }}
        />
      ) : null}
      <ThumbRegion thumb={thumb} />
      <span className="flex flex-1 flex-col gap-2 p-3">
        <span
          aria-hidden
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-gray-600 transition-colors dark:text-neutral-300',
            hasColor
              ? 'group-hover:opacity-90'
              : 'bg-gray-100 group-hover:bg-gray-200/70 dark:bg-neutral-800 dark:group-hover:bg-neutral-700'
          )}
          style={hasColor ? { backgroundColor: `${hexColor}66` } : undefined}
        >
          <Icon aria-hidden size={14} strokeWidth={1.75} />
        </span>
        <span className="line-clamp-2 font-medium text-[13px] text-gray-900 leading-snug dark:text-gray-100">
          {title}
        </span>
        {relative ? (
          <span className="mt-auto text-[11px] text-gray-400 dark:text-neutral-500">
            {relative}
          </span>
        ) : null}
      </span>
    </button>
  );
}
