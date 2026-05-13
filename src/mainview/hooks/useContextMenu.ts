import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

interface UseContextMenuOptions {
  onDeleteNodes?: (ids: string[]) => void;
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

const NEW_NODE_ACTIONS: Record<string, CreatableCanvasNodeKind> = {
  'new-note': 'card',
  'new-folder': 'folder',
  'new-checklist': 'checklist',
  'new-sticky': 'sticky',
  'new-group': 'group',
  'new-image': 'image',
};

type NodeContextTarget =
  | 'asset'
  | 'card'
  | 'folder'
  | 'group'
  | 'sticky'
  | 'image'
  | 'link';

/**
 * Map a React Flow `node.type` to the context-menu `target` discriminator.
 * Anything we don't have a dedicated menu for falls back to `'card'` (the
 * card menu is the most generic content menu).
 */
const NODE_CONTEXT_TARGET: Record<string, NodeContextTarget> = {
  asset: 'asset',
  folder: 'folder',
  group: 'group',
  sticky: 'sticky',
  image: 'image',
  link: 'link',
};

function nodeContextMenuTarget(type: string | undefined): NodeContextTarget {
  const mapped = type ? NODE_CONTEXT_TARGET[type] : undefined;
  return mapped ?? 'card';
}

export function useContextMenu({
  onDeleteNodes,
  rfInstance,
}: UseContextMenuOptions) {
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const undo = useCanvasStore((s) => s.undo);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);
  const setEditingEdgeId = useCanvasStore((s) => s.setEditingEdgeId);
  const setRenamingFolderId = useCanvasStore((s) => s.setRenamingFolderId);
  const changeNodeColor = useCanvasStore((s) => s.changeNodeColor);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const createNode = useCanvasStore((s) => s.createNode);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const detachNoteFromCanvas = useCanvasStore((s) => s.detachNoteFromCanvas);

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
      target: nodeContextMenuTarget(node.type),
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
            if (onDeleteNodes) {
              onDeleteNodes(ids);
            } else {
              deleteNodes(ids);
              toast(
                ids.length > 1
                  ? m.toast_nodes_deleted({ count: ids.length })
                  : m.toast_node_deleted(),
                { action: { label: m.toast_undo(), onClick: () => undo() } }
              );
            }
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
        case 'rename': {
          if (nodeId) {
            setRenamingFolderId(nodeId);
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
        case 'detach-from-canvas': {
          if (nodeId) {
            detachNoteFromCanvas(nodeId);
            toast('Note moved to library', {
              action: { label: m.toast_undo(), onClick: () => undo() },
            });
          }
          break;
        }
        case 'delete-edge': {
          if (nodeId) {
            deleteEdge(nodeId);
            toast(m.toast_edge_deleted(), {
              action: { label: m.toast_undo(), onClick: () => undo() },
            });
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
      onDeleteNodes,
      deleteNodes,
      deleteEdge,
      detachNoteFromCanvas,
      undo,
      updateEdgeData,
      setEditingEdgeId,
      setRenamingFolderId,
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
