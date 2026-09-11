import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';

import type { BlockNoteSaveConflict } from '@/components/editor/useBlockNoteSaver';
import { cn } from '@/lib/utils';

import * as m from '../../../paraglide/messages.js';

interface NoteConflictBannerProps {
  canKeepLocal: boolean;
  conflict: BlockNoteSaveConflict;
  isDark: boolean;
  localText: string;
  localTitle: string;
  onKeepLocal: () => void;
  onRetryLoad: () => void;
  onUseSaved: () => void;
}

function VersionPreview({
  label,
  text,
  title,
}: {
  label: string;
  text: string;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-amber-950/10 bg-white/65 p-3 dark:border-amber-100/10 dark:bg-black/15">
      <h4 className="font-medium text-[11px] text-amber-950/60 uppercase tracking-[0.12em] dark:text-amber-100/60">
        {label}
      </h4>
      <p className="mt-1 truncate font-medium text-sm">
        {title.trim() || m.note_conflict_untitled()}
      </p>
      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs opacity-70">
        {text.trim() || m.note_conflict_empty()}
      </p>
    </section>
  );
}

export function NoteConflictBanner({
  canKeepLocal,
  conflict,
  isDark,
  localText,
  localTitle,
  onKeepLocal,
  onRetryLoad,
  onUseSaved,
}: NoteConflictBannerProps) {
  return (
    <aside
      aria-labelledby="note-conflict-title"
      className={cn(
        'relative z-10 mx-auto mt-4 w-[min(88ch,90%)] rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm',
        isDark
          ? 'border-amber-300/25 bg-amber-950/70 text-amber-50'
          : 'border-amber-700/20 bg-amber-50/95 text-amber-950'
      )}
      data-note-conflict={conflict.status}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-amber-500"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm" id="note-conflict-title">
            {m.note_conflict_title()}
          </h3>
          <p className="mt-0.5 text-xs opacity-75">
            {m.note_conflict_description()}
          </p>

          {conflict.status === 'loading' ? (
            <div className="mt-3 flex items-center gap-2 text-xs opacity-75">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              <span>{m.note_conflict_loading()}</span>
            </div>
          ) : null}

          {conflict.status === 'load-error' ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-xs opacity-75">
                {m.note_conflict_load_error()}
              </p>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1.5 font-medium text-xs transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
                onClick={onRetryLoad}
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-3" />
                {m.note_conflict_reload()}
              </button>
            </div>
          ) : null}

          {conflict.status === 'ready' ? (
            <>
              <details className="group mt-3">
                <summary className="w-fit cursor-pointer select-none font-medium text-xs underline decoration-current/30 underline-offset-4 hover:decoration-current/70 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2">
                  {m.note_conflict_compare()}
                </summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <VersionPreview
                    label={m.note_conflict_your_draft()}
                    text={localText}
                    title={localTitle}
                  />
                  <VersionPreview
                    label={m.note_conflict_saved_version()}
                    text={conflict.snapshot.text}
                    title={conflict.snapshot.title}
                  />
                </div>
              </details>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  className="rounded-lg border border-current/20 px-3 py-1.5 font-medium text-xs transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2"
                  data-note-conflict-action="saved"
                  onClick={onUseSaved}
                  type="button"
                >
                  {m.note_conflict_use_saved()}
                </button>
                <button
                  className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white text-xs shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-2 focus-visible:outline-amber-500 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-50 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
                  data-note-conflict-action="local"
                  disabled={!canKeepLocal}
                  onClick={onKeepLocal}
                  type="button"
                >
                  {m.note_conflict_keep_mine()}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
