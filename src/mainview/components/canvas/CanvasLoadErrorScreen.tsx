import { AlertTriangle, RotateCw } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { rpcListViews } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';
import type { CanvasLoadError } from '@/store/slices/persistenceSlice';
import * as m from '../../../paraglide/messages.js';

const FOCUS_RING =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-900';

function describeError(error: CanvasLoadError): string {
  switch (error.kind) {
    case 'corrupt':
      return m.canvas_load_error_corrupt();
    case 'missing':
      return m.canvas_load_error_missing();
    default:
      return m.canvas_load_error_failed({ message: error.message ?? '' });
  }
}

/**
 * Shown instead of the canvas when the active view failed to load. The canvas
 * stays un-hydrated (nothing is persisted), and no editing surface is
 * rendered, so edits can never be silently dropped. The user can retry or
 * open another canvas.
 */
export function CanvasLoadErrorScreen({ error }: { error: CanvasLoadError }) {
  const views = useCanvasStore((s) => s.views);
  const setViews = useCanvasStore((s) => s.setViews);
  const setCanvasLoadError = useCanvasStore((s) => s.setCanvasLoadError);
  const switchView = useCanvasStore((s) => s.switchView);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = (await rpcListViews().catch(() => null)) as {
        views?: Array<{ id: string; name: string }>;
      } | null;
      if (!cancelled && Array.isArray(data?.views)) {
        setViews(data.views.map((v) => ({ id: v.id, name: v.name })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setViews]);

  const otherViews = views.filter((v) => v.id !== error.viewId);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-[#EFF3F4] px-6 font-sans dark:bg-[#141414]"
      role="alert"
    >
      <div className="w-full max-w-[520px] rounded-lg border border-red-500/30 bg-white/90 p-6 shadow-black/10 shadow-xl dark:bg-neutral-900/90 dark:shadow-black/30">
        <div className="mb-4 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 text-lg leading-tight dark:text-gray-50">
              {m.canvas_load_error_title()}
            </h2>
            <p className="mt-1 font-medium text-red-700 text-sm dark:text-red-300">
              {m.canvas_load_error_readonly()}
            </p>
            <p className="mt-2 break-words text-gray-600 text-sm leading-6 dark:text-gray-300">
              {describeError(error)}
            </p>
          </div>
        </div>

        <button
          className={`inline-flex items-center gap-2 rounded-md border border-black/10 bg-white px-3 py-2 font-medium text-gray-800 text-sm transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-100 dark:hover:bg-neutral-700 ${FOCUS_RING}`}
          onClick={() => {
            setCanvasLoadError(null);
          }}
          type="button"
        >
          <RotateCw size={14} />
          {m.canvas_load_error_retry()}
        </button>

        {otherViews.length > 0 ? (
          <div className="mt-5">
            <p className="mb-2 text-gray-500 text-xs uppercase tracking-wide dark:text-gray-400">
              {m.canvas_load_error_switch()}
            </p>
            <ul className="flex flex-col gap-1">
              {otherViews.map((view) => (
                <li key={view.id}>
                  <button
                    className={`w-full truncate rounded-md px-3 py-2 text-left text-gray-700 text-sm transition-colors hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10 ${FOCUS_RING}`}
                    onClick={async () => {
                      // The failed canvas is not hydrated, so switchView never
                      // flushes it.
                      const switched = await switchView(view.id);
                      if (!switched) {
                        toast.error(m.toast_view_switch_save_failed());
                      }
                    }}
                    type="button"
                  >
                    {view.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
