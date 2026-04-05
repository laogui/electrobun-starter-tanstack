import { useEffect } from 'react';
import type { Node } from '@xyflow/react';
import { nanoid } from 'nanoid';

interface UseCanvasKeyboardOptions {
  focusedNode: any;
  focusedFolder: any;
  setFocusedNode: (v: any) => void;
  setFocusedFolder: (v: any) => void;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<any[]>>;
  setCreateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  clipboardRef: React.MutableRefObject<any[]>;
}

export function useCanvasKeyboard({
  focusedNode,
  focusedFolder,
  setFocusedNode,
  setFocusedFolder,
  setNodes,
  setEdges,
  setCreateMenuOpen,
  clipboardRef,
}: UseCanvasKeyboardOptions) {
  useEffect(() => {
    const isModal = () => focusedNode || focusedFolder;
    const isEditing = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (e.key === 'Escape') {
        if (focusedNode) { setFocusedNode(null); return; }
        if (focusedFolder) { setFocusedFolder(null); return; }
        return;
      }

      if (isModal() || isEditing()) return;

      // Delete/Backspace: delete selected nodes and connected edges
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setNodes(nds => {
          const selectedIds = new Set(nds.filter(n => n.selected).map(n => n.id));
          if (selectedIds.size === 0) return nds;
          setEdges(eds => eds.filter(edge => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)));
          return nds
            .filter(n => !n.selected)
            .map(n => n.parentId && selectedIds.has(n.parentId) ? { ...n, parentId: undefined, extent: undefined } : n);
        });
        return;
      }

      // Cmd+A: select all
      if (mod && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        return;
      }

      // Cmd+C: copy selected nodes
      if (mod && e.key === 'c') {
        setNodes(nds => {
          const selected = nds.filter(n => n.selected);
          if (selected.length > 0) {
            clipboardRef.current = selected.map(n => {
              const { isHidden, isDropTarget, ...cleanData } = n.data as any;
              return { ...n, data: cleanData };
            });
          }
          return nds;
        });
        return;
      }

      // Cmd+V: paste copied nodes (offset by 30px)
      if (mod && e.key === 'v') {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        const offset = 30;
        const newNodes = clipboardRef.current.map(n => ({
          ...n,
          id: `paste-${nanoid(8)}`,
          position: { x: n.position.x + offset, y: n.position.y + offset },
          selected: true,
        }));
        setNodes(nds => [
          ...nds.map(n => ({ ...n, selected: false })),
          ...newNodes,
        ]);
        return;
      }

      // Cmd+N: open create menu
      if (mod && e.key === 'n') {
        e.preventDefault();
        setCreateMenuOpen(prev => !prev);
        return;
      }

      // Enter: open focused view for single selected node
      if (e.key === 'Enter') {
        setNodes(nds => {
          const selected = nds.filter(n => n.selected);
          if (selected.length !== 1) return nds;
          const node = selected[0]!;
          const el = document.querySelector(`[data-id="${node.id}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return nds;
          if (node.type === 'folder') {
            setFocusedFolder({ id: node.id, data: node.data, rect });
          } else {
            setFocusedNode({ id: node.id, data: node.data, rect });
          }
          return nds;
        });
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedNode, focusedFolder, setFocusedNode, setFocusedFolder, setNodes, setEdges, setCreateMenuOpen, clipboardRef]);
}
