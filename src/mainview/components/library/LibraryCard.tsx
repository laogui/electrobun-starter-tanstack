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
  return (
    <button
      className={cn(
        'group relative flex w-[152px] flex-col gap-1.5 overflow-hidden rounded-lg border border-border/50 bg-muted/30 p-3 text-left transition-all hover:bg-accent/50 hover:shadow-md'
      )}
      onClick={() => onClick(item)}
      type="button"
    >
      {item.color ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ backgroundColor: item.color }}
        />
      ) : null}
      <Icon
        aria-hidden
        className="text-muted-foreground"
        size={14}
        strokeWidth={1.6}
      />
      <span className="line-clamp-2 font-medium text-[13px] text-foreground leading-snug">
        {title}
      </span>
      {relative ? (
        <span className="mt-auto text-[11px] text-muted-foreground">
          {relative}
        </span>
      ) : null}
    </button>
  );
}
