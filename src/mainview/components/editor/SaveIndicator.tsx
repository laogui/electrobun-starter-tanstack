import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { BlockNoteSaveStatus } from '@/components/editor/useBlockNoteSaver';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

interface SaveIndicatorProps {
  className?: string;
  lastSavedAt: Date | null;
  status: BlockNoteSaveStatus;
}

function formatClock(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Lightweight status pill rendered in the focused editor top bar. Transitions
 * through `idle` → `saving` → `saved`/`error` without owning any RPC state of
 * its own — the parent pushes `status` + `lastSavedAt` in from the saver hook.
 */
export function SaveIndicator({
  className,
  lastSavedAt,
  status,
}: SaveIndicatorProps) {
  // Bump the clock string once per minute so the "Saved at hh:mm" label stays
  // accurate while the user lingers in focused mode.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'saved' || !lastSavedAt) {
      return;
    }
    const now = Date.now();
    const nextMinuteBoundary =
      (Math.floor(now / 60_000) + 1) * 60_000 - now + 50;
    const timer = setTimeout(() => {
      setTick((value) => value + 1);
    }, nextMinuteBoundary);
    return () => {
      clearTimeout(timer);
    };
  }, [lastSavedAt, status]);

  if (status === 'saving') {
    return (
      <div
        aria-live="polite"
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-zinc-500 dark:text-white/80',
          className
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{m.save_status_saving()}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        aria-live="assertive"
        className={cn(
          'inline-flex items-center gap-2 rounded-full bg-red-500/12 px-3 py-1 text-red-700 text-xs dark:bg-red-500/20 dark:text-red-200',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" />
        <span>{m.save_status_error()}</span>
      </div>
    );
  }

  if (status === 'conflict') {
    return (
      <div
        aria-live="assertive"
        className={cn(
          'inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-amber-800 text-xs dark:bg-amber-500/20 dark:text-amber-200',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
        <span>{m.save_status_conflict()}</span>
      </div>
    );
  }

  if (status === 'saved' && lastSavedAt) {
    return (
      <div
        aria-live="polite"
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-zinc-500 dark:text-white/60',
          className
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
        <span>
          {m.save_status_saved_at({ time: formatClock(lastSavedAt) })}
        </span>
      </div>
    );
  }

  return null;
}
