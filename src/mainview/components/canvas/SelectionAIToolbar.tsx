import { useViewport } from '@xyflow/react';
import { Loader2, Sparkles } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import { useMemo } from 'react';

import { hasSummarizableSelection } from '@/lib/ai/buildAIContext';
import { runAISummarize } from '@/lib/ai/runAISummarize';
import { getSelectedNodesFlowBounds } from '@/lib/ai/selectionBounds';
import { cn } from '@/lib/utils';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';

import * as m from '../../../paraglide/messages.js';

/** Gap (px, screen space) between the selection top-right corner and the pill. */
const TOOLBAR_GAP = 8;

/**
 * Floating AI entry that anchors to the top-right of the current selection.
 * Discoverable alternative to the context-menu item (system menus often
 * swallow right-click inside cards).
 */
export function SelectionAIToolbar() {
  const nodes = useCanvasStore((s) => s.nodes);
  const focusedNode = useCanvasStore((s) => s.focusedNode);
  const extensionInstances = useExtensionInstanceStore((s) => s.records);
  const status = useAIPanelStore((s) => s.status);
  const { x, y, zoom } = useViewport();

  const bounds = useMemo(() => getSelectedNodesFlowBounds(nodes), [nodes]);
  const canSummarize = useMemo(
    () => hasSummarizableSelection(nodes, extensionInstances),
    [extensionInstances, nodes]
  );
  const loading = status === 'loading';

  const visible = Boolean(bounds && canSummarize && !focusedNode);

  const style = useMemo(() => {
    if (!bounds) {
      return;
    }
    // Match HelperLines: flow coords → pane-local screen via live viewport.
    const screenRight = bounds.right * zoom + x;
    const screenTop = bounds.top * zoom + y;
    return {
      left: screenRight,
      top: screenTop - TOOLBAR_GAP,
      transform: 'translate(-100%, -100%)',
    } as const;
  }, [bounds, x, y, zoom]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1001] overflow-visible"
      data-testid="selection-ai-toolbar-layer"
    >
      <AnimatePresence>
        {visible && style ? (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="pointer-events-auto absolute"
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            key="selection-ai-toolbar"
            style={style}
            transition={{ type: 'spring', damping: 28, stiffness: 420 }}
          >
            <button
              aria-busy={loading}
              aria-label={m.menu_ai_summarize()}
              className={cn(
                'nodrag nopan canvas-floating-surface flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-neutral-700 text-xs shadow-md transition-colors',
                'hover:bg-white/95 hover:text-neutral-950',
                'dark:text-neutral-200 dark:hover:bg-neutral-700/95 dark:hover:text-white',
                'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent/60',
                'disabled:cursor-wait disabled:opacity-70'
              )}
              disabled={loading}
              onClick={() => {
                if (loading) {
                  return;
                }
                runAISummarize().catch((error) => {
                  console.error(
                    '[AI] summarize from selection toolbar failed:',
                    error
                  );
                });
              }}
              onPointerDown={(event) => {
                // Keep RF selection / pan from eating the click.
                event.stopPropagation();
              }}
              title={m.menu_ai_summarize()}
              type="button"
            >
              {loading ? (
                <Loader2
                  className="shrink-0 animate-spin text-neutral-400 dark:text-neutral-500"
                  size={14}
                  strokeWidth={2}
                />
              ) : (
                <Sparkles
                  className="shrink-0 text-violet-500 dark:text-violet-400"
                  size={14}
                  strokeWidth={2}
                />
              )}
              <span className="whitespace-nowrap">{m.menu_ai_summarize()}</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
