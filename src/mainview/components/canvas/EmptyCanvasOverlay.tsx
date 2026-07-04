import {
  Command,
  FilePlus,
  LayoutTemplate,
  Library,
  Upload,
} from 'lucide-react';

import * as m from '../../../paraglide/messages.js';

const FOCUS_RING =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900';

export function EmptyCanvasOverlay({
  onCreateNote,
  onOpenNoteLibrary,
}: {
  onCreateNote: () => void;
  onOpenNoteLibrary: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
      <div className="pointer-events-auto w-full max-w-[560px] rounded-lg border border-black/10 bg-white/90 p-6 shadow-black/10 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/88 dark:shadow-black/30">
        <div className="mb-5 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent-softer text-accent-strong">
            <FilePlus size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-[22px] text-gray-900 leading-tight dark:text-gray-50">
              {m.empty_canvas_title()}
            </h2>
            <p className="mt-2 text-gray-600 text-sm leading-6 dark:text-gray-300">
              {m.empty_canvas_description()}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            className={`flex min-h-22 flex-col items-start justify-between rounded-md border border-accent-soft bg-accent-softer px-4 py-3 text-left text-accent-strong transition-colors hover:bg-accent-soft ${FOCUS_RING}`}
            onClick={onCreateNote}
            type="button"
          >
            <FilePlus size={18} />
            <span className="font-medium text-sm">
              {m.empty_canvas_create_note()}
            </span>
          </button>

          <a
            className={`flex min-h-22 flex-col items-start justify-between rounded-md border border-black/10 bg-white px-4 py-3 text-left text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200 dark:hover:bg-neutral-700 ${FOCUS_RING}`}
            href="/templates"
          >
            <LayoutTemplate size={18} />
            <span className="font-medium text-sm">
              {m.empty_canvas_browse_templates()}
            </span>
          </a>

          <button
            className={`flex min-h-22 flex-col items-start justify-between rounded-md border border-black/10 bg-white px-4 py-3 text-left text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200 dark:hover:bg-neutral-700 ${FOCUS_RING}`}
            onClick={onOpenNoteLibrary}
            type="button"
          >
            <Library size={18} />
            <span className="font-medium text-sm">
              {m.empty_canvas_open_library()}
            </span>
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-gray-500 text-xs dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 dark:bg-white/8">
            <Upload size={14} />
            {m.empty_canvas_hint_drop()}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1.5 dark:bg-white/8">
            <Command size={14} />
            {m.empty_canvas_hint_create_menu()}
          </span>
        </div>
      </div>
    </div>
  );
}
