import type { Node, ReactFlowInstance } from '@xyflow/react';
import { type MutableRefObject, useEffect } from 'react';
import { toast } from 'sonner';

import { buildAbsoluteRects, getNodeSize } from '@/lib/collision';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

type CanvasDirection = 'down' | 'left' | 'right' | 'up';

interface UseCanvasKeyboardOptions {
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

  rf.setCenter(center.x, center.y, {
    duration: 180,
    zoom: viewport.zoom,
  });
}

export function useCanvasKeyboard({
  onDeleteNodes,
  rfInstance,
}: UseCanvasKeyboardOptions = {}) {
  const focusedNode = useCanvasStore((s) => s.focusedNode);
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
  const redo = useCanvasStore((s) => s.redo);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  const searchOpen = useCanvasStore((s) => s.searchOpen);
  const setPendingSearchQuery = useCanvasStore((s) => s.setPendingSearchQuery);

  useEffect(() => {
    const isModal = () => focusedNode || focusedFolder;
    const isEditing = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Cmd/Ctrl+K: toggle search dialog (works even while editing/inside modals)
      if (mod && key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (searchOpen) {
          // Let Dialog handle escape itself; do nothing here.
          return;
        }
        if (focusedNode) {
          setFocusedNode(null);
          return;
        }
        if (focusedFolder) {
          setFocusedFolder(null);
          return;
        }
        return;
      }

      if (mod && key === 'z') {
        if (isEditing()) {
          return;
        }
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isModal() || isEditing()) {
        return;
      }

      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        rfInstance?.current?.zoomIn?.({ duration: 180 });
        return;
      }

      if (mod && e.key === '-') {
        e.preventDefault();
        rfInstance?.current?.zoomOut?.({ duration: 180 });
        return;
      }

      if (mod && e.key === '0') {
        e.preventDefault();
        rfInstance?.current?.zoomTo?.(1, { duration: 180 });
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { nodes } = useCanvasStore.getState();
        const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedIds.length > 0) {
          if (onDeleteNodes) {
            onDeleteNodes(selectedIds);
          } else {
            deleteNodes(selectedIds);
            toast(
              selectedIds.length > 1
                ? m.toast_nodes_deleted({ count: selectedIds.length })
                : m.toast_node_deleted(),
              { action: { label: m.toast_undo(), onClick: () => undo() } }
            );
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
        if (onDeleteNodes) {
          const selectedIds = useCanvasStore
            .getState()
            .nodes.filter((n) => n.selected)
            .map((n) => n.id);
          if (selectedIds.length > 0) {
            copySelected();
            onDeleteNodes(selectedIds);
          }
        } else {
          cutSelected();
        }
        return;
      }

      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelected();
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
          pasteClipboard();
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
        centerNodeIfNeeded(selected, rfInstance?.current);
        return;
      }

      if (e.key === 'Enter') {
        const { nodes, setEditingStickyId } = useCanvasStore.getState();
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
        const el = document.querySelector(`[data-id="${node.id}"]`);
        const rect = el?.getBoundingClientRect();
        if (!rect) {
          return;
        }
        if (node.type === 'folder') {
          setFocusedFolder({ id: node.id, data: node.data, rect });
        } else {
          setFocusedNode({
            id: node.id,
            type: node.type,
            data: node.data,
            rect,
          });
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
        !(searchOpen || mod || e.altKey) &&
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

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('open-search', handleOpenSearch);
    };
  }, [
    focusedNode,
    focusedFolder,
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
    searchOpen,
    setPendingSearchQuery,
    onDeleteNodes,
    undo,
    redo,
    rfInstance,
  ]);
}
