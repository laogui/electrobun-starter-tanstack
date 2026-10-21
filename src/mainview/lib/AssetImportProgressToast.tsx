import { Loader2 } from 'lucide-react';
import type { AssetImportProgress } from '@/lib/assetFiles';
import * as m from '../../paraglide/messages.js';

function progressPercent(progress: number): number {
  if (!(Number.isFinite(progress) && progress > 0)) {
    return 0;
  }
  return Math.min(100, Math.round(progress * 100));
}

export function AssetImportProgressToast({
  fileName,
  label,
  progress,
}: AssetImportProgress) {
  const percent = progressPercent(progress);
  return (
    <output
      aria-live="polite"
      className="w-72 rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-lg dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
    >
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-neutral-500 dark:text-neutral-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-medium text-sm">
              {m.asset_import_adding()}
            </p>
            <p className="shrink-0 text-neutral-500 text-xs tabular-nums dark:text-neutral-400">
              {percent}%
            </p>
          </div>
          <p className="mt-1 truncate text-neutral-500 text-xs dark:text-neutral-400">
            {fileName}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-neutral-950 transition-[width] duration-150 ease-out dark:bg-neutral-50"
              style={{ width: `${Math.max(3, percent)}%` }}
            />
          </div>
          <p className="mt-2 text-neutral-500 text-xs dark:text-neutral-400">
            {label}
          </p>
        </div>
      </div>
    </output>
  );
}
