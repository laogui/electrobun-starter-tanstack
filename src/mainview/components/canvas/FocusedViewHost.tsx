import { AnimatePresence } from 'motion/react';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { preloadBlockNoteEditorOnIdle } from '@/components/editor/loadBlockNoteEditor';
import { prefetchBlockNoteForData } from '@/lib/blockNotePrefetch';
import { useCanvasStore } from '@/store/canvasStore';
import { FocusedView } from './FocusedView';
import { startFocusAnimProbe } from './focusTransition/focusAnimProbe';
import { getActiveFocusTransition } from './focusTransition/registry';
import { closeFocusedViewWithTransition } from './focusTransition/runFocusTransition';
import {
  isFocusViewTransitionRunning,
  notifyFocusCleared,
  notifyFocusOpened,
} from './focusTransition/viewTransitionController';

const CANVAS_HIDDEN_CLASS = 'focus-canvas-hidden';

interface FocusedViewHostProps {
  /** The React Flow container; hidden while the focused view covers it. */
  canvasContainerRef: RefObject<HTMLElement | null>;
}

/**
 * Owns the `focusedNode` subscription so opening / closing a note re-renders
 * only this subtree, not the canvas route shell. Also:
 * - warms the BlockNote chunk on idle once the canvas is mounted,
 * - prefetches the note body the moment a focus target is set,
 * - hides the canvas (visibility) once the open lands, restoring it
 *   synchronously when a close starts — before the exit animation's first
 *   frame,
 * - runs the dev-only `[focus-anim]` frame probe for open / close (the
 *   View Transitions variant probes itself, from start to `finished`).
 */
export function FocusedViewHost({ canvasContainerRef }: FocusedViewHostProps) {
  const focusedNode = useCanvasStore((s) => s.focusedNode);
  const stopOpenProbeRef = useRef<(() => void) | null>(null);
  const stopCloseProbeRef = useRef<(() => void) | null>(null);

  useEffect(() => preloadBlockNoteEditorOnIdle(), []);

  useEffect(() => {
    const transitionId = getActiveFocusTransition().id;
    const showCanvas = () => {
      canvasContainerRef.current?.classList.remove(CANVAS_HIDDEN_CLASS);
    };
    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      const next = state.focusedNode;
      const prev = previous.focusedNode;
      if (next === prev) {
        return;
      }
      if (next && next.id !== prev?.id) {
        // Catch-all for open paths that do not prefetch themselves (search,
        // context menu, sibling navigation, extension host API).
        prefetchBlockNoteForData(next.data);
      }
      // View transitions run their own probe (start → finished).
      const selfProbed = isFocusViewTransitionRunning();
      if (next && !prev) {
        notifyFocusOpened();
        stopCloseProbeRef.current?.();
        stopCloseProbeRef.current = null;
        stopOpenProbeRef.current?.();
        stopOpenProbeRef.current = selfProbed
          ? null
          : startFocusAnimProbe(`open ${transitionId}`);
        return;
      }
      if (!next && prev) {
        showCanvas();
        notifyFocusCleared();
        stopOpenProbeRef.current?.();
        stopOpenProbeRef.current = null;
        stopCloseProbeRef.current?.();
        stopCloseProbeRef.current = selfProbed
          ? null
          : startFocusAnimProbe(`close ${transitionId}`);
      }
    });
    return () => {
      unsubscribe();
      showCanvas();
      stopOpenProbeRef.current?.();
      stopCloseProbeRef.current?.();
    };
  }, [canvasContainerRef]);

  const handleOpenComplete = useCallback(() => {
    stopOpenProbeRef.current?.();
    stopOpenProbeRef.current = null;
    if (useCanvasStore.getState().focusedNode) {
      canvasContainerRef.current?.classList.add(CANVAS_HIDDEN_CLASS);
    }
  }, [canvasContainerRef]);

  const handleExitComplete = useCallback(() => {
    stopCloseProbeRef.current?.();
    stopCloseProbeRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    closeFocusedViewWithTransition();
  }, []);

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {focusedNode ? (
        <FocusedView
          node={focusedNode}
          onClose={handleClose}
          onOpenComplete={handleOpenComplete}
        />
      ) : null}
    </AnimatePresence>
  );
}
