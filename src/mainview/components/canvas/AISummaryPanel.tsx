import { Loader2, Sparkles, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import { useState } from 'react';
import { toast } from 'sonner';

import { NotePreview } from '@/components/preview/NotePreview';
import { applyAIActions } from '@/lib/ai/applyAIActions';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../../paraglide/messages.js';
import type { AITaskErrorCode } from '../../../shared/ai/types';

/**
 * Floating preview panel for AI task results (preview → apply → undo).
 * Read-only until the user clicks "Insert"; applying goes through the
 * validated `applyAIActions` pipeline, which owns the single undo snapshot.
 */

interface AISummaryPanelProps {
  rfInstance: React.MutableRefObject<
    import('@xyflow/react').ReactFlowInstance<any, any> | null
  >;
}

function messageForError(
  code: AITaskErrorCode | null,
  detail: string | null
): string {
  switch (code) {
    case 'ai-disabled':
      return m.ai_error_disabled();
    case 'empty-selection':
      return m.ai_error_empty_selection();
    case 'rpc-unavailable':
      return m.ai_error_rpc();
    case 'unsupported-task':
      return m.ai_error_unsupported();
    default:
      return detail?.trim() ? detail.trim() : m.ai_error_model();
  }
}

export function AISummaryPanel({ rfInstance }: AISummaryPanelProps) {
  const status = useAIPanelStore((s) => s.status);
  const result = useAIPanelStore((s) => s.result);
  const errorCode = useAIPanelStore((s) => s.errorCode);
  const errorMessage = useAIPanelStore((s) => s.errorMessage);
  const close = useAIPanelStore((s) => s.close);
  const setSettingsOpen = useCanvasStore((s) => s.setSettingsOpen);
  const undo = useCanvasStore((s) => s.undo);
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    if (!result || applying) {
      return;
    }
    setApplying(true);
    try {
      const { applied, warnings } = await applyAIActions(
        rfInstance.current,
        result.actions
      );
      if (applied > 0) {
        toast(m.toast_ai_card_added(), {
          action: { label: m.toast_undo(), onClick: () => undo() },
        });
        close();
      } else {
        toast.error(warnings[0] ?? m.ai_error_model());
      }
    } catch (error) {
      console.error('[AI] Failed to apply actions:', error);
      toast.error(m.ai_error_model());
    } finally {
      setApplying(false);
    }
  };

  return (
    <AnimatePresence>
      {status !== 'closed' ? (
        <motion.aside
          animate={{ opacity: 1, y: 0 }}
          aria-label={m.ai_panel_title()}
          className="fixed top-14 right-4 z-50 flex max-h-[calc(100vh-120px)] w-[380px] flex-col overflow-hidden rounded-xl border border-black/5 bg-white/95 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-800/90"
          exit={{ opacity: 0, y: -8 }}
          initial={{ opacity: 0, y: -8 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        >
          <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-black/5 border-b px-4 dark:border-white/5">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles
                className="shrink-0 text-gray-400 dark:text-gray-500"
                size={15}
              />
              <h2 className="truncate font-semibold text-gray-800 text-sm dark:text-gray-100">
                {m.ai_panel_title()}
              </h2>
            </div>
            <button
              aria-label={m.ai_panel_discard()}
              className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => {
                close();
              }}
              type="button"
            >
              <X size={14} />
            </button>
          </header>

          {status === 'loading' ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-10">
              <Loader2
                className="animate-spin text-gray-400 dark:text-gray-500"
                size={20}
              />
              <p className="text-gray-500 text-sm dark:text-gray-400">
                {m.ai_panel_loading()}
              </p>
            </div>
          ) : status === 'error' ? (
            <div className="flex flex-col gap-3 px-4 py-5">
              <p className="text-gray-700 text-sm dark:text-gray-200">
                {messageForError(errorCode, errorMessage)}
              </p>
              {errorCode === 'ai-disabled' ? (
                <button
                  className="self-start rounded-lg bg-black px-3 py-1.5 font-medium text-sm text-white transition-opacity hover:opacity-80 dark:bg-white dark:text-black"
                  onClick={() => {
                    close();
                    setSettingsOpen(true);
                  }}
                  type="button"
                >
                  {m.ai_error_open_settings()}
                </button>
              ) : null}
            </div>
          ) : result ? (
            <>
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <NotePreview fallback={result.answer} />
              </div>
              <footer className="flex shrink-0 items-center justify-between gap-3 border-black/5 border-t px-4 py-3 dark:border-white/5">
                <span className="text-gray-400 text-xs dark:text-gray-500">
                  {m.ai_panel_actions({ count: result.actions.length })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg px-3 py-1.5 font-medium text-gray-600 text-sm transition-colors hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5"
                    onClick={() => {
                      close();
                    }}
                    type="button"
                  >
                    {m.ai_panel_discard()}
                  </button>
                  <button
                    className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-1.5 font-medium text-sm text-white transition-opacity hover:opacity-80 disabled:opacity-50 dark:bg-white dark:text-black"
                    disabled={applying || result.actions.length === 0}
                    onClick={() => {
                      handleApply().catch(() => {
                        // Logged inside handleApply.
                      });
                    }}
                    type="button"
                  >
                    {applying ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : null}
                    {m.ai_panel_insert()}
                  </button>
                </div>
              </footer>
            </>
          ) : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
