import { useReactFlow } from '@xyflow/react';
import { Expand, Maximize2, Minimize2, X } from 'lucide-react';
import {
  AnimatePresence,
  useAnimate,
  useIsPresent,
  useReducedMotion,
} from 'motion/react';
import * as motion from 'motion/react-m';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { preloadBlockNoteEditorOnIdle } from '@/components/editor/loadBlockNoteEditor';
import { SaveIndicator } from '@/components/editor/SaveIndicator';
import type { BlockNoteSaveStatus } from '@/components/editor/useBlockNoteSaver';
import { prefetchBlockNoteForData } from '@/lib/blockNotePrefetch';
import { revealNodeBesidePanel } from '@/lib/canvasFocus';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { registerFocusedClose } from '@/lib/focusedCloseRequest';
import { closeFocusedView, findLiveItem } from '@/lib/focusedItem';
import { EASE_OUT } from '@/lib/motion';
import {
  clampSidePanelWidth,
  SIDE_PANEL_MARGIN,
  storedSidePanelWidth,
  storeSidePanelWidth,
} from '@/lib/sidePanelGeometry';
import { cn } from '@/lib/utils';
import { type FocusedItem, useCanvasStore } from '@/store/canvasStore';
import * as m from '../../../paraglide/messages.js';
import {
  FocusedItemBody,
  useFocusedItemLayout,
} from './focused/FocusedItemBody';

/*
 * Motion rules (docs/remediation-plan.md): two durations only, 120ms for
 * fades and 160ms for the panel slide; only transform and opacity animate;
 * nothing animates under prefers-reduced-motion.
 */
const FADE_S = 0.12;
const SLIDE_S = 0.16;
const SLIDE_PX = 24;

interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  type?: string;
}

/** Panel width: dragged by its left edge (360–720px), remembered. */
function usePanelWidth() {
  const [width, setWidth] = useState(() =>
    clampSidePanelWidth(storedSidePanelWidth(), window.innerWidth)
  );
  useEffect(() => {
    const onResize = () =>
      setWidth(clampSidePanelWidth(storedSidePanelWidth(), window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = width;
      let latest = startWidth;
      const onMove = (move: PointerEvent) => {
        latest = clampSidePanelWidth(
          startWidth + (startX - move.clientX),
          window.innerWidth
        );
        setWidth(latest);
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        storeSidePanelWidth(latest);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    },
    [width]
  );
  return { onResizeStart, width };
}

/** Items Cmd/Ctrl+←/→ steps through: the canvas, or the open card's folder. */
function useSiblingItems(node: FocusedItem) {
  const nodes = useCanvasStore((s) => s.nodes);
  const folderId = node.folderId;
  const items = useMemo<FocusedItem[]>(() => {
    if (folderId) {
      const folder = nodes.find((candidate) => candidate.id === folderId);
      const children = ((folder?.data as Record<string, unknown> | undefined)
        ?.children ?? []) as FolderChildEntry[];
      return children
        .filter((child) => isFocusableNode(child.type, child.data))
        .map((child) => ({
          id: child.id,
          folderId,
          type: child.type,
          data: child.data,
          rect: node.rect,
        }));
    }
    return nodes
      .filter(
        (candidate) =>
          isFocusableNode(
            candidate.type,
            candidate.data as Record<string, unknown>
          ) && !(candidate.data as Record<string, unknown>).detached
      )
      .map((candidate) => ({
        id: candidate.id,
        type: candidate.type,
        data: candidate.data as Record<string, unknown>,
        rect: node.rect,
      }));
  }, [folderId, node.rect, nodes]);
  const index = items.findIndex(
    (item) => item.id === node.id && item.folderId === folderId
  );
  return {
    previous: index > 0 ? items[index - 1] : undefined,
    next: index >= 0 && index < items.length - 1 ? items[index + 1] : undefined,
  };
}

interface OpenItemProps {
  node: FocusedItem;
}

/**
 * Shared behaviour of every shell an item opens in: leaving through the
 * editor's conflict guard, Esc, sibling navigation and save status.
 */
function useOpenItemControls(node: FocusedItem) {
  const [saveStatus, setSaveStatus] = useState<BlockNoteSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const toastedErrorRef = useRef(false);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const { previous, next } = useSiblingItems(node);
  const reactFlow = useReactFlow();

  const requestDeparture = useCallback(
    (leave: () => void) => {
      const before = useCanvasStore.getState();
      const leaveIfCurrent = () => {
        const current = useCanvasStore.getState();
        if (
          current._canvasGeneration === before._canvasGeneration &&
          current._focusSession === before._focusSession
        ) {
          leave();
        }
      };
      if (saveStatus === 'conflict') {
        toast.warning(m.note_conflict_close_warning(), {
          action: {
            label: m.note_conflict_close_anyway(),
            onClick: leaveIfCurrent,
          },
          duration: 10_000,
          id: `note-conflict-close-${node.id}`,
        });
        return;
      }
      leaveIfCurrent();
    },
    [node.id, saveStatus]
  );

  const handleClose = useCallback(() => {
    requestDeparture(() => closeFocusedView(true));
  }, [requestDeparture]);

  useEffect(
    () => registerFocusedClose(node.id, handleClose),
    [node.id, handleClose]
  );

  const navigate = useCallback(
    (item: FocusedItem) => {
      requestDeparture(() => {
        const live = findLiveItem(
          useCanvasStore.getState().nodes,
          item.id,
          item.folderId
        );
        if (!(live && isFocusableNode(live.type, live.data))) {
          return;
        }
        prefetchBlockNoteForData(live.data);
        setFocusedNode({ ...item, data: live.data, type: live.type });
        if (!item.folderId) {
          revealNodeBesidePanel(item.id, reactFlow);
        }
      });
    },
    [reactFlow, requestDeparture, setFocusedNode]
  );

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      // A dialog opened over the panel (search, settings) closes first.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[role="dialog"]:not([data-card-panel])')) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      // Full screen and the image viewer step back to the panel first.
      const { focusedMode, setFocusedMode } = useCanvasStore.getState();
      if (focusedMode !== 'panel') {
        setFocusedMode('panel');
        return;
      }
      handleClose();
      return;
    }
    if (!(event.metaKey || event.ctrlKey)) {
      return;
    }
    if (event.key === 'ArrowLeft' && previous) {
      event.preventDefault();
      navigate(previous);
    } else if (event.key === 'ArrowRight' && next) {
      event.preventDefault();
      navigate(next);
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  const handleSaveStatusChange = useCallback(
    (status: BlockNoteSaveStatus, savedAt: Date | null) => {
      setSaveStatus(status);
      if (status === 'saved') {
        setLastSavedAt(savedAt);
        toastedErrorRef.current = false;
      } else if (status === 'error' && !toastedErrorRef.current) {
        toastedErrorRef.current = true;
        toast.error(m.toast_save_failed());
      }
    },
    []
  );

  return { handleClose, handleSaveStatusChange, lastSavedAt, saveStatus };
}

const chromeButton =
  'flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100';

/** Notes, links, checklists and extension cards: beside the canvas. */
function SidePanel({ node }: OpenItemProps) {
  const { isLightbox, isText } = useFocusedItemLayout(node);
  const reduceMotion = Boolean(useReducedMotion());
  const liveMode = useCanvasStore((s) => s.focusedMode);
  // Closing resets the store to `panel`; the exiting shell keeps the layout
  // it had so it fades out in place instead of jumping first.
  const isPresent = useIsPresent();
  const presentModeRef = useRef(liveMode);
  if (isPresent) {
    presentModeRef.current = liveMode;
  }
  const mode = presentModeRef.current;
  const setFocusedMode = useCanvasStore((s) => s.setFocusedMode);
  const fullscreen = mode === 'fullscreen';
  const { onResizeStart, width } = usePanelWidth();
  const { handleClose, handleSaveStatusChange, lastSavedAt, saveStatus } =
    useOpenItemControls(node);
  const [scope, animate] = useAnimate<HTMLElement>();

  // Switching between panel and full screen is a 120ms fade, never a morph.
  const previousModeRef = useRef(mode);
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = mode;
    // The lightbox fades itself; only panel <-> full screen fades here.
    if (previous === mode || previous === 'lightbox' || mode === 'lightbox') {
      return;
    }
    if (reduceMotion || !scope.current) {
      return;
    }
    animate(scope.current, { opacity: [0, 1] }, { duration: FADE_S });
  }, [animate, mode, reduceMotion, scope]);

  const toggleFullscreen = useCallback(() => {
    setFocusedMode(fullscreen ? 'panel' : 'fullscreen');
  }, [fullscreen, setFocusedMode]);

  return (
    <motion.aside
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'fixed z-60 flex flex-col overflow-hidden bg-white dark:bg-zinc-900',
        fullscreen
          ? 'inset-0'
          : 'rounded-2xl border border-black/10 shadow-xl dark:border-white/10'
      )}
      data-card-panel
      data-card-panel-mode={mode}
      exit={{
        opacity: 0,
        x: reduceMotion ? 0 : SLIDE_PX,
        transition: { duration: reduceMotion ? 0 : FADE_S, ease: EASE_OUT },
      }}
      initial={{ opacity: 0, x: reduceMotion ? 0 : SLIDE_PX }}
      ref={scope}
      style={
        fullscreen
          ? undefined
          : {
              top: SIDE_PANEL_MARGIN,
              right: SIDE_PANEL_MARGIN,
              bottom: SIDE_PANEL_MARGIN,
              width,
            }
      }
      transition={{ duration: reduceMotion ? 0 : SLIDE_S, ease: EASE_OUT }}
    >
      {fullscreen ? null : (
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-black/5 dark:hover:bg-white/10"
          onPointerDown={onResizeStart}
        />
      )}
      <div
        className={cn(
          'flex h-11 shrink-0 items-center gap-1 px-2',
          // Clear the macOS traffic lights when covering the whole window.
          fullscreen && 'pt-2'
        )}
      >
        <div className="min-w-0 flex-1 px-2 text-xs text-zinc-400">
          {isText && saveStatus !== 'idle' ? (
            <SaveIndicator lastSavedAt={lastSavedAt} status={saveStatus} />
          ) : null}
        </div>
        {isLightbox ? (
          <button
            aria-label={m.panel_view_large()}
            className={chromeButton}
            onClick={() => setFocusedMode('lightbox')}
            title={m.panel_view_large()}
            type="button"
          >
            <Expand size={15} />
          </button>
        ) : (
          <button
            aria-label={
              fullscreen ? m.panel_exit_fullscreen() : m.panel_fullscreen()
            }
            className={chromeButton}
            onClick={toggleFullscreen}
            title={
              fullscreen ? m.panel_exit_fullscreen() : m.panel_fullscreen()
            }
            type="button"
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        )}
        <button
          aria-label={m.focused_close()}
          className={chromeButton}
          onClick={handleClose}
          title={m.focused_close()}
          type="button"
        >
          <X size={16} />
        </button>
      </div>
      <div
        className={cn(
          '@container min-h-0 flex-1',
          !isText && 'overflow-auto px-4 pb-4',
          isLightbox && 'overflow-hidden bg-zinc-950 px-0 pb-0'
        )}
      >
        <FocusedItemBody
          key={`${node.folderId ?? ''}:${node.id}`}
          node={node}
          onSaveStatusChange={handleSaveStatusChange}
        />
      </div>
    </motion.aside>
  );
}

/** Full-screen image viewer over the panel: fades only, Esc steps back. */
function Lightbox({ node }: OpenItemProps) {
  const { title } = useFocusedItemLayout(node);
  const reduceMotion = Boolean(useReducedMotion());
  const setFocusedMode = useCanvasStore((s) => s.setFocusedMode);
  const fade = { duration: reduceMotion ? 0 : FADE_S, ease: EASE_OUT };
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-70 flex bg-zinc-950"
      data-card-panel
      exit={{ opacity: 0, transition: fade }}
      initial={{ opacity: 0 }}
      role="dialog"
      transition={fade}
    >
      <button
        aria-label={m.focused_close()}
        className="absolute top-4 right-4 z-10 flex size-8 items-center justify-center rounded-full bg-white/10 text-zinc-300 transition-colors hover:bg-white/20"
        onClick={() => setFocusedMode('panel')}
        type="button"
      >
        <X size={16} />
      </button>
      {title ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
          <span className="max-w-[70vw] truncate rounded-full bg-white/10 px-4 py-1.5 text-sm text-white/90">
            {title}
          </span>
        </div>
      ) : null}
      <div className="h-full w-full">
        <FocusedItemBody node={node} onSaveStatusChange={noop} />
      </div>
    </motion.div>
  );
}

function noop() {
  // The image viewer has nothing to save.
}

/**
 * Hosts the card that is open: in the side panel (one card at a time;
 * opening another replaces it), full screen for writing, or the image
 * lightbox. The canvas stays visible and interactive behind the panel.
 * Owns the `focusedNode` subscription so opening and closing re-render only
 * this subtree, and closes the panel when its card is deleted.
 */
export function CardSidePanelHost() {
  const focusedNode = useCanvasStore((s) => s.focusedNode);

  useEffect(() => preloadBlockNoteEditorOnIdle(), []);

  useEffect(
    () =>
      useCanvasStore.subscribe((state, previous) => {
        const open = state.focusedNode;
        if (!open) {
          return;
        }
        if (open.id !== previous.focusedNode?.id) {
          // Catch-all for open paths that do not prefetch themselves.
          prefetchBlockNoteForData(open.data);
        }
        if (
          state.nodes !== previous.nodes &&
          !findLiveItem(state.nodes, open.id, open.folderId)
        ) {
          state.setFocusedNode(null);
        }
      }),
    []
  );

  const lightbox = useCanvasStore((s) => s.focusedMode === 'lightbox');
  return (
    <>
      <AnimatePresence>
        {focusedNode ? (
          <SidePanel key="card-side-panel" node={focusedNode} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {focusedNode && lightbox ? (
          <Lightbox key="card-lightbox" node={focusedNode} />
        ) : null}
      </AnimatePresence>
    </>
  );
}
