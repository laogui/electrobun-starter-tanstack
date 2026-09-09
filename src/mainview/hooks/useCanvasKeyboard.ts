import type { Node, ReactFlowInstance } from '@xyflow/react';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { isFocusableNode } from '@/lib/canvasNodePredicates';
import { buildAbsoluteRects, getNodeSize } from '@/lib/collision';
import { collectNoteIdsFromCanvasNodes } from '@/lib/noteTitleProjection';
import { routeUndoRedo } from '@/lib/routeUndoRedo';
import { suppressViewportPersist } from '@/lib/viewportPersist';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

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
    duration: 180,
    zoom: viewport.zoom,
  });
}

export function useCanvasKeyboard({
  onCloseFolder,
  onDeleteNodes,
  rfInstance,
}: UseCanvasKeyboardOptions = {}) {
  const focusedNode = useCanvasStore((s) => s.focusedNode);
  const focusedFolder = useCanvasStore((s) => s.focusedFolder);
  const nodes = useCanvasStore((s) => s.nodes);
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
  const focusedNodeRef = useRef(focusedNode);
  focusedNodeRef.current = focusedNode;
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

  // Native application menus briefly move focus away from the renderer. Keep
  // the most recent non-empty note selection so a menu command can still act
  // on the notes the user selected immediately before opening the menu.
  const lastSelectedNoteIdsRef = useRef<string[]>([]);
  const lastSelectedAtRef = useRef(0);
  useEffect(() => {
    const selectedNoteIds = collectNoteIdsFromCanvasNodes(nodes, {
      selectedOnly: true,
    });
    if (selectedNoteIds.length > 0) {
      lastSelectedNoteIdsRef.current = selectedNoteIds;
      lastSelectedAtRef.current = Date.now();
    }
  }, [nodes]);

  useEffect(() => {
    const isModal = () => focusedNodeRef.current || focusedFolderRef.current;
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
        if (searchOpenRef.current) {
          // Let Dialog handle escape itself; do nothing here.
          return;
        }
        if (focusedNodeRef.current) {
          setFocusedNode(null);
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
        rfInstanceRef.current?.current?.zoomIn?.({ duration: 180 });
        return;
      }

      if (mod && e.key === '-') {
        e.preventDefault();
        rfInstanceRef.current?.current?.zoomOut?.({ duration: 180 });
        return;
      }

      if (mod && e.key === '0') {
        e.preventDefault();
        rfInstanceRef.current?.current?.zoomTo?.(1, { duration: 180 });
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

    const handleNormalizeNoteTitles = () => {
      const { normalizeSelectedNoteTitles } = useCanvasStore.getState();
      Promise.resolve(normalizeSelectedNoteTitles())
        .then((result) => {
          if (result.success) {
            toast.success(m.toast_titles_normalized(), {
              action: {
                label: m.toast_undo(),
                onClick: () => useCanvasStore.getState().undo(),
              },
            });
            return;
          }
          toast.error(m.toast_titles_normalize_failed());
        })
        .catch((error) => {
          console.error('[canvas] Failed to normalize titles:', error);
          toast.error(m.toast_titles_normalize_failed());
        });
    };
    globalThis.addEventListener(
      'normalize-note-titles',
      handleNormalizeNoteTitles
    );

    const handlePluginCommandRequested = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        !(
          detail &&
          typeof detail === 'object' &&
          typeof (detail as { commandId?: unknown }).commandId === 'string' &&
          typeof (detail as { pluginId?: unknown }).pluginId === 'string'
        )
      ) {
        return;
      }
      const { commandId, pluginId } = detail as {
        commandId: string;
        pluginId: string;
      };
      const { runEnabledPluginCommand } = useCanvasStore.getState();
      const selectedNoteIds = useCanvasStore
        .getState()
        .collectSelectedNoteIds();
      const hasFreshSelection =
        selectedNoteIds.length === 0 &&
        Date.now() - lastSelectedAtRef.current < 5000 &&
        lastSelectedNoteIdsRef.current.length > 0;
      const focusedNoteId = focusedNodeRef.current?.data.noteId;
      const focusedNoteIds =
        selectedNoteIds.length === 0 &&
        !hasFreshSelection &&
        typeof focusedNoteId === 'string' &&
        focusedNoteId.length > 0
          ? [focusedNoteId]
          : undefined;
      const resultPromise = hasFreshSelection
        ? runEnabledPluginCommand(
            pluginId,
            commandId,
            lastSelectedNoteIdsRef.current
          )
        : focusedNoteIds
          ? runEnabledPluginCommand(pluginId, commandId, focusedNoteIds)
          : runEnabledPluginCommand(pluginId, commandId);
      Promise.resolve(resultPromise)
        .then((result) => {
          if (result.success) {
            toast.success(m.toast_plugin_command_completed(), {
              action: {
                label: m.toast_undo(),
                onClick: () => useCanvasStore.getState().undo(),
              },
            });
            return;
          }
          toast.error(m.toast_plugin_command_failed(), {
            description: result.error,
          });
        })
        .catch((error) => {
          console.error('[canvas] Failed to run plugin command:', error);
          toast.error(m.toast_plugin_command_failed());
        });
    };
    globalThis.addEventListener(
      'plugin-command-requested',
      handlePluginCommandRequested
    );

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
      globalThis.removeEventListener(
        'normalize-note-titles',
        handleNormalizeNoteTitles
      );
      globalThis.removeEventListener(
        'plugin-command-requested',
        handlePluginCommandRequested
      );
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
