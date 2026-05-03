import { useEffect } from 'react';
import { toast } from 'sonner';

import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

export function useCanvasKeyboard() {
  const focusedNode = useCanvasStore((s) => s.focusedNode);
  const focusedFolder = useCanvasStore((s) => s.focusedFolder);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const setNodes = useCanvasStore((s) => s.setNodes);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const copySelected = useCanvasStore((s) => s.copySelected);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const setCreateMenuOpen = useCanvasStore((s) => s.setCreateMenuOpen);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const setSearchOpen = useCanvasStore((s) => s.setSearchOpen);
  const searchOpen = useCanvasStore((s) => s.searchOpen);

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

      // Cmd/Ctrl+K: toggle search dialog (works even while editing/inside modals)
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      // Document mode owns its own keyboard model (decisions 12 & 13 in
      // docs/todo/双布局-PRD-待决问题.md). Short-circuit every canvas-only
      // shortcut once we're in document layout — Tiptap and the rail handle
      // their own input. Cmd+K above is the only canvas shortcut allowed.
      if (useCanvasStore.getState().layoutMode === 'document') {
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

      if (mod && e.key === 'z') {
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

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { nodes } = useCanvasStore.getState();
        const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedIds.length > 0) {
          deleteNodes(selectedIds);
          toast(
            selectedIds.length > 1
              ? m.toast_nodes_deleted({ count: selectedIds.length })
              : m.toast_node_deleted(),
            { action: { label: m.toast_undo(), onClick: () => undo() } }
          );
        }
        return;
      }

      if (mod && e.key === 'a') {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        return;
      }

      if (mod && e.key === 'c') {
        copySelected();
        return;
      }

      if (mod && e.key === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }

      if (mod && e.key === 'n') {
        e.preventDefault();
        setCreateMenuOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Enter') {
        const { nodes } = useCanvasStore.getState();
        const selected = nodes.filter((n) => n.selected);
        if (selected.length !== 1) {
          return;
        }
        const node = selected[0]!;
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
    pasteClipboard,
    setCreateMenuOpen,
    setSearchOpen,
    searchOpen,
    undo,
    redo,
  ]);
}
