import { type Node, useViewport } from '@xyflow/react';
import { Loader2, Sparkles } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as motion from 'motion/react-m';
import { useShallow } from 'zustand/react/shallow';

import { hasSummarizableSelection } from '@/lib/ai/buildAIContext';
import { runAISummarize } from '@/lib/ai/runAISummarize';
import { getSelectedNodesFlowBounds } from '@/lib/ai/selectionBounds';
import { EASE_OUT, POPOVER_EXIT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useAIPanelStore } from '@/store/aiPanelStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';

import * as m from '../../../paraglide/messages.js';

/** Gap (px, screen space) between the selection top-right corner and the pill. */
const TOOLBAR_GAP = 8;

type ExtensionInstances = ReturnType<
  typeof useExtensionInstanceStore.getState
>['records'];

interface ToolbarAnchor {
  right: number;
  top: number;
}

/** Summarizability depends only on node content, so drag frames (which only
 *  replace positions) reuse the previous answer instead of rebuilding context. */
const summarizableCache = new WeakMap<
  object,
  { instances: ExtensionInstances; type: Node['type']; value: boolean }
>();

function isNodeSummarizable(node: Node, instances: ExtensionInstances) {
  const cached = summarizableCache.get(node.data);
  if (cached && cached.instances === instances && cached.type === node.type) {
    return cached.value;
  }
  const value = hasSummarizableSelection([node], instances);
  summarizableCache.set(node.data, { instances, type: node.type, value });
  return value;
}

function selectToolbarAnchor(
  nodes: Node[],
  hasFocusedNode: boolean,
  instances: ExtensionInstances
): ToolbarAnchor | null {
  if (hasFocusedNode) {
    return null;
  }
  const canSummarize = nodes.some(
    (node) => node.selected && isNodeSummarizable(node, instances)
  );
  if (!canSummarize) {
    return null;
  }
  const bounds = getSelectedNodesFlowBounds(nodes);
  return bounds ? { right: bounds.right, top: bounds.top } : null;
}

/**
 * Floating AI entry that anchors to the top-right of the current selection.
 * Discoverable alternative to the context-menu item (system menus often
 * swallow right-click inside cards).
 */
export function SelectionAIToolbar() {
  const extensionInstances = useExtensionInstanceStore((s) => s.records);
  // Subscribe to the derived anchor, not the node array, so unrelated node
  // updates (e.g. dragging an unselected card) skip this component.
  const anchor = useCanvasStore(
    useShallow((s) =>
      selectToolbarAnchor(s.nodes, Boolean(s.focusedNode), extensionInstances)
    )
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1001] overflow-visible"
      data-testid="selection-ai-toolbar-layer"
    >
      <AnimatePresence>
        {anchor ? (
          <SelectionAIToolbarPill
            key="selection-ai-toolbar"
            right={anchor.right}
            top={anchor.top}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Only mounted while visible, so pan/zoom does not re-render an idle toolbar. */
function SelectionAIToolbarPill({ right, top }: ToolbarAnchor) {
  const status = useAIPanelStore((s) => s.status);
  const { x, y, zoom } = useViewport();
  const loading = status === 'loading';

  // Match HelperLines: flow coords → pane-local screen via live viewport.
  // Anchor via Motion's x/y so the entrance scale composes with it.
  const style = {
    left: right * zoom + x,
    top: top * zoom + y - TOOLBAR_GAP,
    x: '-100%',
    y: '-100%',
    transformOrigin: '100% 100%',
  } as const;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="pointer-events-auto absolute"
      exit={{ opacity: 0, scale: 0.96, transition: POPOVER_EXIT }}
      initial={{ opacity: 0, scale: 0.94 }}
      style={style}
      transition={{ duration: 0.18, ease: EASE_OUT }}
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
  );
}
