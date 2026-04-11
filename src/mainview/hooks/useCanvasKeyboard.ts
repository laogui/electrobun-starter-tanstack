import { useEffect } from 'react';

import { useCanvasStore } from '@/store/canvasStore';

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

      if (e.key === 'Escape') {
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
        if (isEditing()) return;
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isModal() || isEditing()) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { nodes } = useCanvasStore.getState();
        const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedIds.length > 0) deleteNodes(selectedIds);
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
        if (selected.length !== 1) return;
        const node = selected[0]!;
        const el = document.querySelector(`[data-id="${node.id}"]`);
        const rect = el?.getBoundingClientRect();
        if (!rect) return;
        if (node.type === 'folder') {
          setFocusedFolder({ id: node.id, data: node.data, rect });
        } else {
          setFocusedNode({ id: node.id, data: node.data, rect });
        }
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
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
    undo,
    redo,
  ]);
}
