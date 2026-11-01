import type { Node, ReactFlowInstance } from '@xyflow/react';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  closeFocusedViewWithTransition,
  runFocusTransition,
} from '@/components/canvas/focusTransition/runFocusTransition';
import { prefetchBlockNoteForData } from '@/lib/blockNotePrefetch';
import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { buildAbsoluteRects, getNodeSize } from '@/lib/collision';
import { VIEWPORT_ZOOM_MS, viewportMotion } from '@/lib/motion';
import { routeUndoRedo } from '@/lib/routeUndoRedo';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';
import { isTopicNodeType } from '../../shared/topic';

type CanvasDirection = 'down' | 'left' | 'right' | 'up';

interface UseCanvasKeyboardOptions {
  onCloseFolder?: () => void;
  onDeleteNodes?: (ids: string[]) => void;
  rfInstance?: MutableRefObject<ReactFlowInstance<any, any> | null>;
}

function getNodeCenter(node: Node, nodes: Node[]) {
  const rect = buildAbsoluteRects(nodes).get(node.id);
  if (rect) {
    return {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2,
    };
  }

  const size = getNodeSize(node);
  return {
    x: node.position.x + size.width / 2,
    y: node.position.y + size.height / 2,
  };
}

function isFlowPointVisible(
  point: { x: number; y: number },
  viewport: { x: number; y: number; zoom: number }
) {
  const width = globalThis.innerWidth || document.documentElement.clientWidth;
  const height =
    globalThis.innerHeight || document.documentElement.clientHeight;
  const screenX = point.x * viewport.zoom + viewport.x;
  const screenY = point.y * viewport.zoom + viewport.y;
  return screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;
}

function centerNodeIfNeeded(
  node: Node | null,
  rf: ReactFlowInstance<any, any> | null | undefined
) {
  if (!(node && rf?.getViewport && rf.setCenter)) {
    return;
  }

  const nodes = useCanvasStore.getState().nodes;
  const center = getNodeCenter(node, nodes);
  const viewport = rf.getViewport();
  if (isFlowPointVisible(center, viewport)) {
    return;
  }

  suppressViewportPersist(200);
  rf.setCenter(center.x, center.y, {
    ...viewportMotion(180),
    zoom: viewport.zoom,
  });
}

export function useCanvasKeyboard({
  onCloseFolder,
  onDeleteNodes,
  rfInstance,
}: UseCanvasKeyboardOptions = {}) {
  // `focusedNode` is read from the store at event time (not subscribed) so
  // opening a note does not re-render the canvas route that hosts this hook.
  const focusedFolder = useCanvasStore((s) => s.focusedFolder);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const copySelected = useCanvasStore((s) => s.copySelected);
  const cutSelected = useCanvasStore((s) => s.cutSelected);
  const deselectAll = useCanvasStore((s) => s.deselectAll);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const groupSelected = useCanvasStore((s) => s.groupSelected);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const selectNodeInDirection = useCanvasStore((s) => s.selectNodeInDirection);
  const setCreateMenuOpen = useCanvasStore((s) => s.setCreateMenuOpen);
  const ungroupSelected = useCanvasStore((s) => s.ungroupSelected);
  const undo = useCanvasStore((s) => s.undo);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  const searchOpen = useCanvasStore((s) => s.searchOpen);
  const setPendingSearchQuery = useCanvasStore((s) => s.setPendingSearchQuery);

  // These values change identity on focus navigation / search toggle, but the
  // keydown handler only needs their *current* value at event time. Mirror them
  // into refs so the listener is wired up once instead of being torn down and
  // rebuilt on every navigation (which also raced the Escape handler).
  const focusedFolderRef = useRef(focusedFolder);
  focusedFolderRef.current = focusedFolder;
  const searchOpenRef = useRef(searchOpen);
  searchOpenRef.current = searchOpen;
  const onCloseFolderRef = useRef(onCloseFolder);
  onCloseFolderRef.current = onCloseFolder;
  const onDeleteNodesRef = useRef(onDeleteNodes);
  onDeleteNodesRef.current = onDeleteNodes;
  const rfInstanceRef = useRef(rfInstance);
  rfInstanceRef.current = rfInstance;

  useEffect(() => {
    const isModal = () =>
      useCanvasStore.getState().focusedNode || focusedFolderRef.current;
    const isEditing = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // An un-hydrated canvas (loading, or failed to load) is not persisted:
      // never let shortcuts mutate it.
      if (!useCanvasStore.getState()._hydrated) {
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest('[data-canvas-learning][role="dialog"]') ||
        (target?.closest('button[data-canvas-learning]') &&
          (e.key === 'Enter' || e.key === ' ' || e.code === 'Space'))
      ) {
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl+K: toggle search dialog (works even while editing/inside modals)
      if (mod && key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (searchOpenRef.current) {
          // Let Dialog handle escape itself; do nothing here.
          return;
        }
        if (useCanvasStore.getState().focusedNode) {
          closeFocusedViewWithTransition();
          return;
        }
        if (focusedFolderRef.current) {
          const close = onCloseFolderRef.current;
          if (close) {
            close();
          } else {
            setFocusedFolder(null);
          }
          return;
        }
        const { exitTopicCommandContext, topicCommandContextId } =
          useCanvasStore.getState();
        if (topicCommandContextId) {
          e.preventDefault();
          exitTopicCommandContext();
          const canvas = document.querySelector('[role="application"]');
          if (canvas instanceof HTMLElement) {
            canvas.focus();
          }
        }
        return;
      }

      if (mod && key === 'z') {
        const handled = routeUndoRedo(e.shiftKey ? 'redo' : 'undo', {
          eventTarget: e.target,
          fromKeyboard: true,
        });
        if (handled) {
          e.preventDefault();
        }
        return;
      }

      if (isModal() || isEditing()) {
        return;
      }

      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        rfInstanceRef.current?.current?.zoomIn?.(
          viewportMotion(VIEWPORT_ZOOM_MS)
        );
        return;
      }

      if (mod && e.key === '-') {
        e.preventDefault();
        rfInstanceRef.current?.current?.zoomOut?.(
          viewportMotion(VIEWPORT_ZOOM_MS)
        );
        return;
      }

      if (mod && e.key === '0') {
        e.preventDefault();
        rfInstanceRef.current?.current?.zoomTo?.(
          1,
          viewportMotion(VIEWPORT_ZOOM_MS)
        );
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { nodes } = useCanvasStore.getState();
        const selectedIds: string[] = [];
        for (const node of nodes) {
          if (node.selected) {
            selectedIds.push(node.id);
          }
        }
        if (selectedIds.length > 0) {
          const deleteHandler = onDeleteNodesRef.current;
          if (deleteHandler) {
            deleteHandler(selectedIds);
          } else {
            const deleted = deleteNodes(selectedIds);
            if (deleted > 0) {
              toast(
                deleted > 1
                  ? m.toast_nodes_deleted({ count: deleted })
                  : m.toast_node_deleted(),
                { action: { label: m.toast_undo(), onClick: () => undo() } }
              );
            }
          }
        }
        return;
      }

      if (mod && key === 'a') {
        e.preventDefault();
        if (e.shiftKey) {
          deselectAll();
          return;
        }
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }

      if (mod && key === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }

      if (mod && key === 'x') {
        e.preventDefault();
        const cutHandler = onDeleteNodesRef.current;
        if (cutHandler) {
          const selectedIds: string[] = [];
          for (const node of useCanvasStore.getState().nodes) {
            if (node.selected) {
              selectedIds.push(node.id);
            }
          }
          if (selectedIds.length > 0) {
            copySelected();
            cutHandler(selectedIds);
          }
        } else {
          cutSelected();
        }
        return;
      }

      if (mod && key === 'd') {
        e.preventDefault();
        Promise.resolve(duplicateSelected()).catch((error) => {
          console.error('[canvas] Failed to duplicate selection:', error);
        });
        return;
      }

      if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          ungroupSelected();
        } else {
          groupSelected();
        }
        return;
      }

      if (mod && key === 'v') {
        if (useCanvasStore.getState().clipboard.length > 0) {
          e.preventDefault();
          Promise.resolve(pasteClipboard()).catch((error) => {
            console.error('[canvas] Failed to paste clipboard:', error);
          });
        }
        return;
      }

      if (mod && key === 'n') {
        e.preventDefault();
        setCreateMenuOpen((prev) => !prev);
        return;
      }

      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft'
      ) {
        e.preventDefault();
        const direction = e.key
          .replace('Arrow', '')
          .toLowerCase() as CanvasDirection;
        const selected = selectNodeInDirection(direction, {
          extend: e.shiftKey,
        });
        centerNodeIfNeeded(selected, rfInstanceRef.current?.current);
        return;
      }

      // Tab creates a subtopic only inside the explicit Topic command context
      // (or the Topic editor, which is handled locally). A selected Topic
      // after Esc must not reclaim Tab.
      if (e.key === 'Tab' && !e.shiftKey) {
        const { beginTopicRelativeDraft, nodes, topicCommandContextId } =
          useCanvasStore.getState();
        if (!topicCommandContextId) {
          return;
        }
        const node = nodes.find((n) => n.id === topicCommandContextId);
        if (node && isTopicNodeType(node.type)) {
          e.preventDefault();
          beginTopicRelativeDraft('child', node.id);
        }
        return;
      }

      // F2 edits the selected Topic's title, matching the rename convention
      // elsewhere in the app and giving keyboard users an entry point that
      // does not depend on Enter's per-type meaning.
      if (e.key === 'F2') {
        const { nodes, setEditingTopicId } = useCanvasStore.getState();
        const selected = nodes.filter((n) => n.selected);
        const node = selected.length === 1 ? selected[0] : undefined;
        if (node && isTopicNodeType(node.type)) {
          e.preventDefault();
          setEditingTopicId(node.id);
        }
        return;
      }

      if (e.key === 'Enter') {
        const { nodes, setEditingStickyId, setEditingTopicId } =
          useCanvasStore.getState();
        const selected = nodes.filter((n) => n.selected);
        if (selected.length !== 1) {
          return;
        }
        const node = selected[0]!;
        // Stickies have no focused view — Enter starts inline text editing.
        if (node.type === 'sticky') {
          e.preventDefault();
          setEditingStickyId(node.id);
          return;
        }
        // Sibling/root-edit Enter is a Topic command, not a selected-only hook.
        if (isTopicNodeType(node.type)) {
          const { beginTopicRelativeDraft, topicCommandContextId } =
            useCanvasStore.getState();
          if (topicCommandContextId !== node.id) {
            return;
          }
          e.preventDefault();
          if (!beginTopicRelativeDraft('sibling', node.id)) {
            setEditingTopicId(node.id);
          }
          return;
        }
        // Widgets (and other non-focusable content) stay on-canvas only.
        if (
          node.type !== 'folder' &&
          !isFocusableNode(node.type, node.data as Record<string, unknown>)
        ) {
          return;
        }
        const el = document.querySelector(`[data-id="${node.id}"]`);
        const rect = el?.getBoundingClientRect();
        if (!rect) {
          return;
        }
        if (node.type === 'folder') {
          setFocusedFolder({ id: node.id, data: node.data, rect });
        } else {
          prefetchBlockNoteForData(node.data as Record<string, unknown>);
          runFocusTransition(
            () => {
              setFocusedNode({
                id: node.id,
                type: node.type,
                data: node.data,
                rect,
              });
            },
            { direction: 'open', source: el }
          );
        }
        return;
      }

      // Type-to-search: any unmodified single printable character opens the
      // search dialog and seeds the input. Already past the modal/editing
      // guard above, so this only fires when the canvas itself has focus.
      // Skip when any non-shift modifier is held so OS / app shortcuts
      // (Cmd+Q, Cmd+W, Alt+letter accents, …) keep working and we never
      // swallow them with preventDefault. Space is reserved for React Flow's
      // pan activation (drag the canvas).
      if (
        !(searchOpenRef.current || mod || e.altKey) &&
        e.key.length === 1 &&
        e.key !== ' '
      ) {
        e.preventDefault();
        setPendingSearchQuery(e.key);
        setSearchOpen(true);
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);

    const handleOpenSearch = () => {
      setSearchOpen(true);
    };
    globalThis.addEventListener('open-search', handleOpenSearch);

    const handleCanvasUndo = () => {
      routeUndoRedo('undo');
    };
    const handleCanvasRedo = () => {
      routeUndoRedo('redo');
    };
    globalThis.addEventListener('canvas-undo', handleCanvasUndo);
    globalThis.addEventListener('canvas-redo', handleCanvasRedo);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('open-search', handleOpenSearch);
      globalThis.removeEventListener('canvas-undo', handleCanvasUndo);
      globalThis.removeEventListener('canvas-redo', handleCanvasRedo);
    };
  }, [
    // All Zustand actions here are stable references, so the listener is wired
    // up once for the lifetime of the component. The focus/search/instance
    // values are read through refs above, so they intentionally do NOT appear
    // here (they would tear down & rebuild the keydown listener on every nav).
    setFocusedNode,
    setFocusedFolder,
    setNodes,
    deleteNodes,
    copySelected,
    cutSelected,
    deselectAll,
    duplicateSelected,
    groupSelected,
    pasteClipboard,
    selectNodeInDirection,
    setCreateMenuOpen,
    ungroupSelected,
    setSearchOpen,
    setPendingSearchQuery,
    undo,
  ]);
}
