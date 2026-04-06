import { useState, useCallback } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import { STICKY_W, STICKY_H, STICKY_COLORS, GROUP_COLORS } from '@/lib/canvasConstants';
import { useCanvasStore } from '@/store/canvasStore';

interface UseContextMenuOptions {
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

export function useContextMenu({ rfInstance }: UseContextMenuOptions) {
  const setNodes = useCanvasStore((s) => s.setNodes);
  const setEdges = useCanvasStore((s) => s.setEdges);
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const changeNodeColor = useCanvasStore((s) => s.changeNodeColor);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const nextNodeId = useCanvasStore((s) => s.nextNodeId);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);

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
      target: node.type === 'folder' ? 'folder' : node.type === 'group' ? 'group' : node.type === 'sticky' ? 'sticky' : 'card',
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
        saveSnapshot();
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = nextNodeId();
        setNodes(nds => [...nds, {
          id,
          type: 'card' as const,
          position: pos,
          data: { type: 'text' as const, title: '', content: '', color: 'bg-white' },
        }]);
        break;
      }
      case 'new-folder': {
        saveSnapshot();
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = nextNodeId();
        setNodes(nds => [...nds, {
          id,
          type: 'folder' as const,
          position: pos,
          style: { width: 350, height: 350 },
          data: { title: '0 items', subtitle: '', children: [] },
        }]);
        break;
      }
      case 'new-sticky': {
        saveSnapshot();
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = nextNodeId();
        const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
        setNodes(nds => [...nds, {
          id,
          type: 'sticky' as const,
          position: pos,
          style: { width: STICKY_W, height: STICKY_H },
          data: { content: '', color },
        }]);
        break;
      }
      case 'new-group': {
        saveSnapshot();
        const pos = contextMenu ? screenToFlow(contextMenu.x, contextMenu.y) : screenToFlow(window.innerWidth / 2, window.innerHeight / 2);
        const id = nextNodeId();
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
      case 'paste':
        pasteClipboard();
        break;
      case 'reset-zoom':
        rfInstance.current?.zoomTo(1, { duration: 300 });
        break;
      case 'focus':
        if (nodeId) {
          const el = document.querySelector(`[data-id="${nodeId}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return;
          const nodes = useCanvasStore.getState().nodes;
          const node = nodes.find(n => n.id === nodeId);
          if (node) setFocusedNode({ id: nodeId, type: node.type, data: node.data, rect });
        }
        break;
      case 'open-folder':
        if (nodeId) {
          const el = document.querySelector(`[data-id="${nodeId}"]`);
          const rect = el?.getBoundingClientRect();
          if (!rect) return;
          const nodes = useCanvasStore.getState().nodes;
          const node = nodes.find(n => n.id === nodeId);
          if (node) setFocusedFolder({ id: nodeId, data: node.data, rect });
        }
        break;
      case 'copy':
        if (nodeId) {
          const nodes = useCanvasStore.getState().nodes;
          const node = nodes.find(n => n.id === nodeId);
          if (node) {
            const { isHidden, isDropTarget, ...cleanData } = node.data as any;
            useCanvasStore.setState({
              clipboard: [{ ...node, data: cleanData }],
            });
          }
        }
        break;
      case 'delete':
        if (nodeId) deleteNodes([nodeId]);
        break;
      case 'change-color':
        if (nodeId) changeNodeColor(nodeId);
        break;
      case 'new-child':
        if (nodeId) addFolderChild(nodeId);
        break;
    }
  }, [contextMenu, rfInstance, setNodes, setFocusedNode, setFocusedFolder, deleteNodes, changeNodeColor, addFolderChild, pasteClipboard, nextNodeId, saveSnapshot]);

  return {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    handleContextMenuAction,
  };
}
