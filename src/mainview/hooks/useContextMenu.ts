import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import {
  type CreatableCanvasNodeKind,
  normalizeLinkUrl,
} from '@/lib/contentTypes';
import {
  type CanvasCreateRequest,
  resolveCreatableKind,
} from '@/lib/creatableNodes';
import {
  buildImportedCardCreateOptions,
  handleMarkdownImportResult,
} from '@/lib/importMarkdownCards';
import {
  rpcExportNoteMarkdown,
  rpcExportNotesMarkdown,
  rpcImportMarkdownFiles,
  rpcOpenExternalUrl,
  rpcRevealAttachment,
} from '@/lib/rpc';
import { useCanvasStore } from '@/store/canvasStore';

import * as m from '../../paraglide/messages.js';

interface UseContextMenuOptions {
  onDeleteNodes?: (ids: string[]) => void;
  /**
   * Opens the native file picker so the caller can replace the underlying
   * file of an image or asset node. `kind` selects the accept filter; the
   * caller wires the chosen file back into the node's `data`.
   */
  onReplaceNodeFile?: (nodeId: string, kind: 'image' | 'asset') => void;
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
  onReplaceNodeFile,
  onRequestCreate,
  rfInstance,
}: UseContextMenuOptions) {
  const setFocusedNode = useCanvasStore((s) => s.setFocusedNode);
  const setFocusedFolder = useCanvasStore((s) => s.setFocusedFolder);
  const deleteNodes = useCanvasStore((s) => s.deleteNodes);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);
  const undo = useCanvasStore((s) => s.undo);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const setEditingEdgeId = useCanvasStore((s) => s.setEditingEdgeId);
  const setEditingTagNodeId = useCanvasStore((s) => s.setEditingTagNodeId);
  const setEditingFolderId = useCanvasStore((s) => s.setEditingFolderId);
  const setRenamingNodeId = useCanvasStore((s) => s.setRenamingNodeId);
  const changeNodeColor = useCanvasStore((s) => s.changeNodeColor);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const createNode = useCanvasStore((s) => s.createNode);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const detachNoteFromCanvas = useCanvasStore((s) => s.detachNoteFromCanvas);
  const toggleNodeLocked = useCanvasStore((s) => s.toggleNodeLocked);
  const moveSelectedToView = useCanvasStore((s) => s.moveSelectedToView);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target: 'canvas' });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    // Right-clicking a node that is part of a multi-selection swaps the menu
    // for the batch variant so the user can act on every selected node.
    const selected = useCanvasStore.getState().nodes.filter((n) => n.selected);
    const isMulti =
      selected.length > 1 && selected.some((n) => n.id === node.id);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: isMulti ? 'multi' : nodeContextMenuTarget(node.type),
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
    async (action: string, nodeId?: string) => {
      const screenToFlow = (sx: number, sy: number) => {
        const inst = rfInstance.current;
        if (inst?.screenToFlowPosition) {
          return inst.screenToFlowPosition({ x: sx, y: sy });
        }
        const viewport = inst?.getViewport();
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

      if (action.startsWith('move-to-view:')) {
        const moved = await moveSelectedToView(
          action.slice('move-to-view:'.length)
        );
        if (!moved) {
          toast.error('Could not move selection');
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
        case 'import-markdown': {
          // Capture position before the async gap — `contextMenu` will be
          // nulled by `onClose()` while the native file picker is open.
          const savedMenu = contextMenu;
          const result = await rpcImportMarkdownFiles().catch(() => null);
          const anchorCenter = savedMenu
            ? screenToFlow(savedMenu.x, savedMenu.y)
            : undefined;
          handleMarkdownImportResult(result, (notes) => {
            for (const [index, note] of notes.entries()) {
              createNode(
                'card',
                rfInstance.current,
                buildImportedCardCreateOptions(
                  note,
                  index,
                  notes.length,
                  anchorCenter
                )
              );
            }
          });
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
            const { edges, nodes } = useCanvasStore.getState();
            const selected = nodes.filter((n) => n.selected);
            // If the right-clicked node is part of a multi-selection, copy all selected
            const targetNodes =
              selected.length > 1 && selected.some((n) => n.id === nodeId)
                ? selected
                : nodes.filter((n) => n.id === nodeId);
            if (targetNodes.length > 0) {
              const targetIds = new Set(targetNodes.map((node) => node.id));
              useCanvasStore.setState({
                clipboard: targetNodes.map((n) => {
                  const { isHidden, isDropTarget, ...cleanData } =
                    n.data as any;
                  return { ...n, data: cleanData };
                }),
                clipboardEdges: edges
                  .filter(
                    (edge) =>
                      targetIds.has(edge.source) && targetIds.has(edge.target)
                  )
                  .map((edge) => {
                    const { selected: _selected, ...clean } = edge as Edge & {
                      selected?: boolean;
                    };
                    return clean;
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
            const selected = useCanvasStore
              .getState()
              .nodes.filter((n) => n.selected);
            const ids =
              selected.length > 1 && selected.some((n) => n.id === nodeId)
                ? selected.map((n) => n.id)
                : [nodeId];
            for (const id of ids) {
              changeNodeColor(id);
            }
          }
          break;
        }
        case 'new-child': {
          if (nodeId) {
            addFolderChild(nodeId);
          }
          break;
        }
        case 'edit-folder': {
          if (nodeId) {
            setEditingFolderId(nodeId);
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
        case 'copy-as-markdown': {
          if (nodeId) {
            const { nodes } = useCanvasStore.getState();
            const node = nodes.find((n) => n.id === nodeId);
            const data = (node?.data ?? {}) as {
              title?: unknown;
              content?: unknown;
            };
            const title = typeof data.title === 'string' ? data.title : '';
            const body = typeof data.content === 'string' ? data.content : '';
            const markdown = title ? `# ${title}\n\n${body}` : body;
            if (markdown) {
              navigator.clipboard
                .writeText(markdown)
                .then(() => toast(m.toast_markdown_copied()))
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
        case 'toggle-lock': {
          if (nodeId) {
            toggleNodeLocked(nodeId);
          }
          break;
        }
        case 'open-link': {
          if (nodeId) {
            const node = useCanvasStore
              .getState()
              .nodes.find((n) => n.id === nodeId);
            const url = (node?.data as { url?: unknown } | undefined)?.url;
            if (typeof url === 'string' && url) {
              const safe = normalizeLinkUrl(url) ?? url;
              const res = await rpcOpenExternalUrl(safe);
              if (!res?.success) {
                toast(m.toast_open_link_failed());
              }
            }
          }
          break;
        }
        case 'copy-url': {
          if (nodeId) {
            const node = useCanvasStore
              .getState()
              .nodes.find((n) => n.id === nodeId);
            const url = (node?.data as { url?: unknown } | undefined)?.url;
            if (typeof url === 'string' && url) {
              navigator.clipboard
                .writeText(url)
                .then(() => toast(m.toast_copied()))
                .catch(() => {
                  /* clipboard denied — ignore */
                });
            }
          }
          break;
        }
        case 'refetch-link': {
          if (nodeId) {
            updateNodeData(nodeId, {
              unfurlStatus: 'idle',
              unfurlError: undefined,
            });
          }
          break;
        }
        case 'copy-image-address': {
          if (nodeId) {
            const node = useCanvasStore
              .getState()
              .nodes.find((n) => n.id === nodeId);
            const data = (node?.data ?? {}) as { imageUrl?: unknown };
            const addr = typeof data.imageUrl === 'string' ? data.imageUrl : '';
            if (addr) {
              navigator.clipboard
                .writeText(addr)
                .then(() => toast(m.toast_copied()))
                .catch(() => {
                  /* clipboard denied — ignore */
                });
            }
          }
          break;
        }
        case 'reveal-in-finder': {
          if (nodeId) {
            const node = useCanvasStore
              .getState()
              .nodes.find((n) => n.id === nodeId);
            const data = (node?.data ?? {}) as {
              attachmentFile?: unknown;
              imageFile?: unknown;
            };
            const rel =
              (typeof data.attachmentFile === 'string' &&
                data.attachmentFile) ||
              (typeof data.imageFile === 'string' && data.imageFile) ||
              '';
            if (rel) {
              const res = await rpcRevealAttachment(rel);
              if (!res?.success) {
                toast(m.toast_reveal_failed());
              }
            }
          }
          break;
        }
        case 'replace-image': {
          if (nodeId && onReplaceNodeFile) {
            onReplaceNodeFile(nodeId, 'image');
          }
          break;
        }
        case 'replace-file': {
          if (nodeId && onReplaceNodeFile) {
            onReplaceNodeFile(nodeId, 'asset');
          }
          break;
        }
        case 'rename-asset': {
          if (nodeId) {
            setRenamingNodeId(nodeId);
          }
          break;
        }
        case 'cycle-edge-color': {
          if (nodeId) {
            const { edges } = useCanvasStore.getState();
            const edge = edges.find((e) => e.id === nodeId);
            if (edge) {
              const rawColor = (edge.data as { color?: unknown } | undefined)
                ?.color;
              const current =
                typeof rawColor === 'string' ? rawColor : undefined;
              const palette: (string | undefined)[] = [
                undefined,
                '#ef4444',
                '#f97316',
                '#10b981',
                '#3b82f6',
                '#a855f7',
              ];
              const idx = palette.indexOf(current);
              const next = palette[(idx + 1 + palette.length) % palette.length];
              saveSnapshot();
              updateEdgeData(nodeId, { color: next });
            }
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
      onReplaceNodeFile,
      deleteNodes,
      deleteEdge,
      detachNoteFromCanvas,
      undo,
      updateEdgeData,
      updateNodeData,
      setEditingEdgeId,
      setEditingTagNodeId,
      setEditingFolderId,
      setRenamingNodeId,
      changeNodeColor,
      addFolderChild,
      pasteClipboard,
      saveSnapshot,
      createNode,
      toggleNodeLocked,
      moveSelectedToView,
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
