import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import {
  type CanvasCreateRequest,
  resolveCreatableKind,
} from '@/lib/creatableNodes';
import { rpcExportNoteMarkdown, rpcExportNotesMarkdown } from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

interface UseContextMenuOptions {
  onDeleteNodes?: (ids: string[]) => void;
  /**
   * Routes a create action to the shared creation flow (handles the `link` URL
   * prompt and `asset` file picker). When omitted, plain kinds fall back to a
   * direct store `createNode` so the hook stays usable standalone.
   */
  onRequestCreate?: (
    kind: CreatableCanvasNodeKind,
    request: CanvasCreateRequest
  ) => void;
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}

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
  onRequestCreate,
  rfInstance,
}: UseContextMenuOptions) {
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const undo = useCanvasStore((s) => s.undo);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);
  const setEditingEdgeId = useCanvasStore((s) => s.setEditingEdgeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
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

      const newType = resolveCreatableKind(action);
      if (newType) {
        const anchorCenter = contextMenu
          ? screenToFlow(contextMenu.x, contextMenu.y)
          : undefined;
        if (onRequestCreate) {
          onRequestCreate(newType, {
            anchorCenter,
            screen: contextMenu
              ? { x: contextMenu.x, y: contextMenu.y }
              : undefined,
          });
        } else {
          createNode(newType, rfInstance.current, { anchorCenter });
        }
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
        case 'export-canvas-markdown': {
          const { activeViewId } = useCanvasStore.getState();
          rpcExportNotesMarkdown('view', { viewId: activeViewId })
            .then((res) => {
              if (res?.success) {
                toast(
                  m.toast_markdown_exported_count({
                    count: res.exported ?? 0,
                  })
                );
              } else if (!res?.canceled) {
                toast(m.toast_export_failed());
              }
            })
            .catch(() => toast(m.toast_export_failed()));
          break;
        }
        case 'focus':
        case 'edit-url': {
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
        case 'edit-tag': {
          if (nodeId) {
            setEditingTagNodeId(nodeId);
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
        case 'export-markdown': {
          if (nodeId) {
            const { nodes } = useCanvasStore.getState();
            const node = nodes.find((n) => n.id === nodeId);
            const noteId = (node?.data as { noteId?: unknown } | undefined)
              ?.noteId;
            if (typeof noteId === 'string' && noteId) {
              rpcExportNoteMarkdown(noteId)
                .then((res) => {
                  if (res?.success) {
                    toast(m.toast_markdown_exported());
                  } else if (!res?.canceled) {
                    toast(m.toast_export_failed());
                  }
                })
                .catch(() => toast(m.toast_export_failed()));
            }
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
      setEditingTagNodeId,
      setRenamingFolderId,
      changeNodeColor,
      addFolderChild,
      pasteClipboard,
      saveSnapshot,
      createNode,
      onRequestCreate,
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
