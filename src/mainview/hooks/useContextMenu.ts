import { useState, useCallback, useRef } from 'react';
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import { GROUP_COLORS, CARD_COLORS } from '@/lib/canvasConstants';

interface UseContextMenuOptions {
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setFocusedNode: (v: any) => void;
  setFocusedFolder: (v: any) => void;
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
  clipboardRef: React.MutableRefObject<any[]>;
  nodeIdCounter: React.MutableRefObject<number>;
}

export function useContextMenu({
  setNodes,
  setEdges,
  setFocusedNode,
  setFocusedFolder,
  rfInstance,
  clipboardRef,
  nodeIdCounter,
}: UseContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: 'canvas' });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: node.type === 'folder' ? 'folder' : node.type === 'group' ? 'group' : 'card',
      nodeId: node.id,
    });
  }, []);

  const handleContextMenuAction = useCallback((action: string, nodeId?: string) => {
    const viewport = rfInstance.current?.getViewport();

    const screenToFlow = (sx: number, sy: number) => {
      const zoom = viewport?.zoom ?? 1;
      return {
        x: (sx - (viewport?.x ?? 0)) / zoom,
        y: (sy - (viewport?.y ?? 0)) / zoom,
      };
    };

    switch (action) {
      case 'new-note': {
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = `new-${++nodeIdCounter.current}`;
        setNodes(nds => [...nds, {
          id,
          type: 'card' as const,
          position: pos,
          data: { type: 'text' as const, title: '', content: '', color: 'bg-white' },
        }]);
        break;
      }
      case 'new-folder': {
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = `new-${++nodeIdCounter.current}`;
        setNodes(nds => [...nds, {
          id,
          type: 'folder' as const,
          position: pos,
          style: { width: 350, height: 350 },
          data: { title: '0 items', subtitle: '', children: [] },
        }]);
        break;
      }
      case 'new-group': {
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = `new-${++nodeIdCounter.current}`;
        const color = GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
        setNodes(nds => [...nds, {
          id,
          type: 'group' as const,
          position: pos,
          style: { width: 500, height: 300 },
          data: { label: 'New Group', color },
        }]);
        break;
      }
      case 'paste': {
        if (clipboardRef.current.length === 0) return;
        const offset = 30;
        const newNodes = clipboardRef.current.map(n => ({
          ...n,
          id: `paste-${nanoid(8)}`,
          position: { x: n.position.x + offset, y: n.position.y + offset },
          selected: true,
        }));
        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), ...newNodes]);
        break;
      }
      case 'reset-zoom':
        rfInstance.current?.zoomTo(1, { duration: 300 });
        break;
      case 'focus':
        if (nodeId) {
          const el = document.querySelector(`[data-id="${nodeId}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return;
          setNodes(nds => {
            const node = nds.find(n => n.id === nodeId);
            if (node) setFocusedNode({ id: nodeId, data: node.data, rect });
            return nds;
          });
        }
        break;
      case 'open-folder':
        if (nodeId) {
          const el = document.querySelector(`[data-id="${nodeId}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return;
          setNodes(nds => {
            const node = nds.find(n => n.id === nodeId);
            if (node) setFocusedFolder({ id: nodeId, data: node.data, rect });
            return nds;
          });
        }
        break;
      case 'copy':
        if (nodeId) {
          setNodes(nds => {
            const node = nds.find(n => n.id === nodeId);
            if (node) {
              const { isHidden, isDropTarget, ...cleanData } = node.data as any;
              clipboardRef.current = [{ ...node, data: cleanData }];
            }
            return nds;
          });
        }
        break;
      case 'delete':
        if (nodeId) {
          setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
          setNodes(nds => {
            const deletedNode = nds.find(n => n.id === nodeId);
            if (deletedNode?.type === 'group') {
              return nds
                .filter(n => n.id !== nodeId)
                .map(n => n.parentId === nodeId ? { ...n, parentId: undefined, extent: undefined } : n);
            }
            return nds.filter(n => n.id !== nodeId);
          });
        }
        break;
      case 'change-color':
        if (nodeId) {
          setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            if (n.type === 'group') {
              const currentIdx = GROUP_COLORS.indexOf((n.data as any).color ?? 'blue');
              const nextColor = GROUP_COLORS[(currentIdx + 1) % GROUP_COLORS.length];
              return { ...n, data: { ...n.data, color: nextColor } };
            }
            const currentIdx = CARD_COLORS.indexOf((n.data as any).color ?? 'bg-white');
            const nextColor = CARD_COLORS[(currentIdx + 1) % CARD_COLORS.length];
            return { ...n, data: { ...n.data, color: nextColor } };
          }));
        }
        break;
      case 'new-child':
        if (nodeId) {
          const childId = `child-${nanoid(8)}`;
          setNodes(nds => nds.map(n => {
            if (n.id !== nodeId) return n;
            const children = [...((n.data as any).children || []), {
              id: childId,
              type: 'card' as const,
              data: { type: 'text' as const, title: '', content: '', color: 'bg-white' },
            }];
            return { ...n, data: { ...n.data, children, title: `${children.length} items` } };
          }));
        }
        break;
    }
  }, [contextMenu, rfInstance, setNodes, setEdges, setFocusedNode, setFocusedFolder, clipboardRef, nodeIdCounter]);

  return {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    handleContextMenuAction,
  };
}
