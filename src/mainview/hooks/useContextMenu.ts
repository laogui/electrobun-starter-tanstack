import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';

import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import { useCanvasStore } from '@/store/canvasStore';

interface UseContextMenuOptions {
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

type NewNodeType =
  | 'card'
  | 'checklist'
  | 'folder'
  | 'group'
  | 'image'
  | 'sticky';
const NEW_NODE_ACTIONS: Record<string, NewNodeType> = {
  'new-note': 'card',
  'new-folder': 'folder',
  'new-checklist': 'checklist',
  'new-sticky': 'sticky',
  'new-group': 'group',
  'new-image': 'image',
};

export function useContextMenu({ rfInstance }: UseContextMenuOptions) {
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);
  const setEditingEdgeId = useCanvasStore((s) => s.setEditingEdgeId);
  const changeNodeColor = useCanvasStore((s) => s.changeNodeColor);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const createNode = useCanvasStore((s) => s.createNode);
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
      target:
        node.type === 'folder'
          ? 'folder'
          : node.type === 'group'
            ? 'group'
            : node.type === 'sticky'
              ? 'sticky'
              : node.type === 'image'
                ? 'image'
                : 'card',
      nodeId: node.id,
    });
  }, []);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: 'edge',
      edgeId: edge.id,
    });
  }, []);

  const handleContextMenuAction = useCallback(
    (action: string, nodeId?: string) => {
      const viewport = rfInstance.current?.getViewport();

      const screenToFlow = (sx: number, sy: number) => {
        const zoom = viewport?.zoom ?? 1;
        return {
          x: (sx - (viewport?.x ?? 0)) / zoom,
          y: (sy - (viewport?.y ?? 0)) / zoom,
        };
      };

      const newType = NEW_NODE_ACTIONS[action];
      if (newType) {
        const anchorCenter = contextMenu
          ? screenToFlow(contextMenu.x, contextMenu.y)
          : undefined;
        createNode(newType, rfInstance.current, { anchorCenter });
        return;
      }

      switch (action) {
        case 'paste': {
          pasteClipboard();
          break;
        }
        case 'reset-zoom': {
          rfInstance.current?.zoomTo(1, { duration: 300 });
          break;
        }
        case 'focus': {
          if (nodeId) {
            const el = document.querySelector(`[data-id="${nodeId}"]`);
            const rect = el?.getBoundingClientRect();
            if (!rect) {
              return;
            }
            const { nodes } = useCanvasStore.getState();
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              setFocusedNode({
                id: nodeId,
                type: node.type,
                data: node.data,
                rect,
              });
            }
          }
          break;
        }
        case 'open-folder': {
          if (nodeId) {
            const el = document.querySelector(`[data-id="${nodeId}"]`);
            const rect = el?.getBoundingClientRect();
            if (!rect) {
              return;
            }
            const { nodes } = useCanvasStore.getState();
            const node = nodes.find((n) => n.id === nodeId);
            if (node) {
              setFocusedFolder({ id: nodeId, data: node.data, rect });
            }
          }
          break;
        }
        case 'copy': {
          if (nodeId) {
            const { nodes } = useCanvasStore.getState();
            const selected = nodes.filter((n) => n.selected);
            // If the right-clicked node is part of a multi-selection, copy all selected
            const targetNodes =
              selected.length > 1 && selected.some((n) => n.id === nodeId)
                ? selected
                : nodes.filter((n) => n.id === nodeId);
            if (targetNodes.length > 0) {
              useCanvasStore.setState({
                clipboard: targetNodes.map((n) => {
                  const { isHidden, isDropTarget, ...cleanData } =
                    n.data as any;
                  return { ...n, data: cleanData };
                }),
              });
            }
          }
          break;
        }
        case 'delete': {
          if (nodeId) {
            const { nodes } = useCanvasStore.getState();
            const selected = nodes.filter((n) => n.selected);
            const ids =
              selected.length > 1 && selected.some((n) => n.id === nodeId)
                ? selected.map((n) => n.id)
                : [nodeId];
            deleteNodes(ids);
          }
          break;
        }
        case 'change-color': {
          if (nodeId) {
            changeNodeColor(nodeId);
          }
          break;
        }
        case 'new-child': {
          if (nodeId) {
            addFolderChild(nodeId);
          }
          break;
        }
        case 'edit-edge-label': {
          // nodeId here is actually edgeId (passed through the generic slot)
          if (nodeId) {
            setEditingEdgeId(nodeId);
          }
          break;
        }
        case 'toggle-edge-animated': {
          if (nodeId) {
            const { edges } = useCanvasStore.getState();
            const edge = edges.find((e) => e.id === nodeId);
            if (edge) {
              saveSnapshot();
              const isAnimated = (edge.data as any)?.animated ?? false;
              updateEdgeData(nodeId, { animated: !isAnimated });
            }
          }
          break;
        }
        case 'toggle-edge-path-type': {
          if (nodeId) {
            const { edges } = useCanvasStore.getState();
            const edge = edges.find((e) => e.id === nodeId);
            if (edge) {
              saveSnapshot();
              const current = (edge.data as any)?.pathType ?? 'bezier';
              updateEdgeData(nodeId, {
                pathType: current === 'smoothstep' ? 'bezier' : 'smoothstep',
              });
            }
          }
          break;
        }
        case 'delete-edge': {
          if (nodeId) {
            deleteEdge(nodeId);
          }
          break;
        }
        default: {
          break;
        }
      }
    },
    [
      contextMenu,
      rfInstance,
      setFocusedNode,
      setFocusedFolder,
      deleteNodes,
      deleteEdge,
      updateEdgeData,
      setEditingEdgeId,
      changeNodeColor,
      addFolderChild,
      pasteClipboard,
      saveSnapshot,
      createNode,
    ]
  );

  return {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    handleContextMenuAction,
  };
}
