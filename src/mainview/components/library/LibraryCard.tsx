import {
  FileText,
  ImageIcon,
  Link2,
  ListChecks,
  Paperclip,
} from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';
import type { LibraryItem } from './useLibraryData';

interface LibraryCardProps {
  item: LibraryItem;
  onClick: (item: LibraryItem) => void;
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

export function LibraryCard({ item, onClick }: LibraryCardProps) {
  const Icon = useMemo(
    () => iconFor(item.type, item.data),
    [item.type, item.data]
  );
  const relative = useMemo(
    () => formatRelative(item.updatedAt),
    [item.updatedAt]
  );
  const title =
    item.title.trim().length > 0 ? item.title : m.library_untitled();
  // Only treat hex colors as renderable; semantic tokens (e.g. group "blue")
  // don't apply to focusable library items but guard anyway.
  const hexColor =
    typeof item.color === 'string' && item.color.startsWith('#')
      ? item.color
      : undefined;
  const hasColor = Boolean(hexColor);
  return (
    <button
      className={cn(
        'group relative flex h-[108px] flex-col gap-2 overflow-hidden rounded-xl border border-gray-200/80 bg-white p-3 text-left transition-all',
        'hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,0.12)]',
        'dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/70'
      )}
      onClick={() => onClick(item)}
      type="button"
    >
      {hasColor ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
          style={{ backgroundColor: hexColor }}
        />
      ) : null}
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
    </button>
  );
}
