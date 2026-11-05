import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { ContextMenuState } from '@/components/canvas/ContextMenu';
import {
  cycleExtensionColor,
  isHostGenericMenuAction,
  runExtensionMenuAction,
} from '@/extensions/hostMenu';
import { runAISummarize } from '@/lib/ai/runAISummarize';
import { revealNodeBesidePanel } from '@/lib/canvasFocus';
import { isFocusableNode, isLockedNode } from '@/lib/canvasNodePredicates';
import { clearCanvasGraphSelection } from '@/lib/clearCanvasGraphSelection';
import {
  type CreatableCanvasNodeKind,
  normalizeLinkUrl,
} from '@/lib/contentTypes';
import {
  type CanvasCreateRequest,
  resolveCreatableKind,
} from '@/lib/creatableNodes';
import { openFocusedItem } from '@/lib/focusedItem';
import type { FolderChildEntry } from '@/lib/folderExpansion';
import {
  buildImportedCardCreateOptions,
  handleMarkdownImportResult,
} from '@/lib/importMarkdownCards';
import { VIEWPORT_ZOOM_MS, viewportMotion } from '@/lib/motion';
import {
  rpcExportNoteMarkdown,
  rpcExportNotesMarkdown,
  rpcExportTopicOutline,
  rpcImportMarkdownFiles,
  rpcOpenExternalUrl,
  rpcRevealAttachment,
} from '@/lib/rpc';
import {
  buildTopicIndex,
  buildTopicOutline,
  collectTopicBranch,
  topicOutlineExportProblems,
} from '@/lib/topicTree';
import { useCanvasStore } from '@/store/canvasStore';
import { useColorPickerStore } from '@/store/colorPickerStore';
import * as m from '../../paraglide/messages.js';
import { parseCanvasTypeMenuActionId } from '../../shared/extensions/ids';
import { buildTopicOutlineMarkdown } from '../../shared/topicMarkdownExport';

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
  onRequestCreateCanvasType?: (
    canvasTypeId: string,
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
  | 'topic'
  | 'image'
  | 'link'
  | 'recording'
  | 'widget'
  | 'extension';

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
  topic: 'topic',
  image: 'image',
  link: 'link',
  recording: 'recording',
  widget: 'widget',
  extension: 'extension',
};

function nodeContextMenuTarget(type: string | undefined): NodeContextTarget {
  const mapped = type ? NODE_CONTEXT_TARGET[type] : undefined;
  return mapped ?? 'card';
}

export function useContextMenu({
  onDeleteNodes,
  onReplaceNodeFile,
  onRequestCreate,
  onRequestCreateCanvasType,
  rfInstance,
}: UseContextMenuOptions) {
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
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const groupSelected = useCanvasStore((s) => s.groupSelected);
  const addFolderChild = useCanvasStore((s) => s.addFolderChild);
  const commitFolderChildData = useCanvasStore((s) => s.commitFolderChildData);
  const deleteFolderChild = useCanvasStore((s) => s.deleteFolderChild);
  const moveFolderChildToCanvas = useCanvasStore(
    (s) => s.moveFolderChildToCanvas
  );
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const createNode = useCanvasStore((s) => s.createNode);
  const saveSnapshot = useCanvasStore((s) => s.saveSnapshot);
  const detachNoteFromCanvas = useCanvasStore((s) => s.detachNoteFromCanvas);
  const toggleNodeLocked = useCanvasStore((s) => s.toggleNodeLocked);
  const toggleStickyPinned = useCanvasStore((s) => s.toggleStickyPinned);
  const toggleNodesLocked = useCanvasStore((s) => s.toggleNodesLocked);
  const moveSelectedToView = useCanvasStore((s) => s.moveSelectedToView);
  const setEditingTopicId = useCanvasStore((s) => s.setEditingTopicId);
  const beginTopicRelativeDraft = useCanvasStore(
    (s) => s.beginTopicRelativeDraft
  );
  const detachTopicBranch = useCanvasStore((s) => s.detachTopicBranch);
  const deleteTopicBranch = useCanvasStore((s) => s.deleteTopicBranch);
  const copyTopicBranch = useCanvasStore((s) => s.copyTopicBranch);
  const tidyTopicBranch = useCanvasStore((s) => s.tidyTopicBranch);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const onPaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    clearCanvasGraphSelection();
    setContextMenu({ x: e.clientX, y: e.clientY, target: 'canvas' });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    // Right-clicking a node that is part of a multi-selection swaps the menu
    // for the batch variant so the user can act on every selected node.
    const { nodes, setNodes } = useCanvasStore.getState();
    const selected = nodes.filter((n) => n.selected);
    const isMulti =
      selected.length > 1 && selected.some((n) => n.id === node.id);
    // Plain clicks no longer select, so keep the visible selection in sync with
    // what the menu acts on: a right-click outside the current selection makes
    // the target the sole selection; a right-click inside a multi-selection
    // preserves it for batch actions.
    if (!isMulti) {
      setNodes((prev) =>
        prev.map((n) =>
          n.selected === (n.id === node.id)
            ? n
            : { ...n, selected: n.id === node.id }
        )
      );
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: isMulti ? 'multi' : nodeContextMenuTarget(node.type),
      nodeId: node.id,
    });
  }, []);

  const onFolderChildContextMenu = useCallback(
    (e: React.MouseEvent, folderId: string, child: FolderChildEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: nodeContextMenuTarget(child.type),
        nodeId: child.id,
        folderId,
      });
    },
    []
  );

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

      const folderId = contextMenu?.folderId;
      const folderChild = folderId
        ? ((
            (
              useCanvasStore
                .getState()
                .nodes.find((node) => node.id === folderId)?.data as
                | {
                    children?: FolderChildEntry[];
                  }
                | undefined
            )?.children ?? []
          ).find((child) => child.id === nodeId) ?? null)
        : null;

      if (folderId && folderChild) {
        const childData = folderChild.data;
        if (
          folderChild.type === 'extension' &&
          !isHostGenericMenuAction(action)
        ) {
          const handled = await runExtensionMenuAction({
            actionId: action,
            data: childData,
            nodeId: folderChild.id,
            folderId,
          });
          if (handled) {
            return;
          }
        }
        const expandedChildElement = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-folder-expanded-visual-id]'
          )
        ).find(
          (element) => element.dataset.folderExpandedVisualId === folderChild.id
        );
        const childRect = expandedChildElement?.getBoundingClientRect();

        switch (action) {
          case 'focus':
          case 'edit-url': {
            // Widgets (and other non-focusable kinds) never open FocusedView.
            if (
              !(
                childRect &&
                isFocusableNode(
                  folderChild.type,
                  childData as Record<string, unknown>
                )
              )
            ) {
              return;
            }
            openFocusedItem({
              id: folderChild.id,
              type: folderChild.type,
              data: childData,
              folderId,
              rect: childRect,
            });
            return;
          }
          case 'copy': {
            const copiedData =
              folderChild.noteId && !childData.noteId
                ? { ...childData, noteId: folderChild.noteId }
                : childData;
            useCanvasStore.setState({
              clipboard: [
                {
                  id: folderChild.id,
                  type: folderChild.type,
                  data: copiedData,
                  position: { x: 0, y: 0 },
                  ...(folderChild.size
                    ? {
                        style: {
                          width: folderChild.size.width,
                          height: folderChild.size.height,
                        },
                      }
                    : {}),
                },
              ],
              clipboardEdges: [],
            });
            return;
          }
          case 'copy-as-markdown': {
            const title =
              typeof childData.title === 'string' ? childData.title : '';
            const body =
              typeof childData.content === 'string' ? childData.content : '';
            const markdown = title ? `# ${title}\n\n${body}` : body;
            if (markdown) {
              navigator.clipboard
                .writeText(markdown)
                .then(() => toast(m.toast_markdown_copied()))
                .catch(() => toast(m.toast_export_failed()));
            }
            return;
          }
          case 'change-color': {
            if (folderChild.type === 'extension') {
              cycleExtensionColor(childData);
              return;
            }
            useColorPickerStore.getState().open({
              anchor: { x: contextMenu.x, y: contextMenu.y },
              palette: folderChild.type === 'sticky' ? 'sticky' : 'card',
              targets: [
                { kind: 'folder-child', folderId, childId: folderChild.id },
              ],
            });
            return;
          }
          case 'move-out': {
            const screenCenter = childRect
              ? {
                  x: childRect.left + childRect.width / 2,
                  y: childRect.top + childRect.height / 2,
                }
              : { x: contextMenu.x, y: contextMenu.y };
            moveFolderChildToCanvas(folderId, folderChild.id, {
              anchorCenter: screenToFlow(screenCenter.x, screenCenter.y),
            });
            return;
          }
          case 'delete': {
            deleteFolderChild(folderId, folderChild.id);
            toast(m.toast_node_deleted(), {
              action: { label: m.toast_undo(), onClick: () => undo() },
            });
            return;
          }
          case 'export-markdown': {
            const noteId =
              folderChild.noteId ??
              (typeof childData.noteId === 'string'
                ? childData.noteId
                : undefined);
            if (noteId) {
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
            return;
          }
          case 'open-link': {
            const rawUrl = childData.url;
            if (typeof rawUrl === 'string' && rawUrl) {
              const safeUrl = normalizeLinkUrl(rawUrl) ?? rawUrl;
              const result = await rpcOpenExternalUrl(safeUrl);
              if (!result?.success) {
                toast(m.toast_open_link_failed());
              }
            }
            return;
          }
          case 'copy-url': {
            if (typeof childData.url === 'string' && childData.url) {
              navigator.clipboard.writeText(childData.url).catch(() => {
                // Clipboard access can be denied by the host; keep the menu quiet.
              });
            }
            return;
          }
          case 'refetch-link': {
            commitFolderChildData(folderId, folderChild.id, {
              unfurlStatus: 'idle',
              unfurlError: undefined,
            });
            return;
          }
          case 'copy-image-address': {
            if (typeof childData.imageUrl === 'string' && childData.imageUrl) {
              navigator.clipboard.writeText(childData.imageUrl).catch(() => {
                // Clipboard access can be denied by the host; keep the menu quiet.
              });
            }
            return;
          }
          case 'reveal-in-finder': {
            const relativePath =
              (typeof childData.attachmentFile === 'string' &&
                childData.attachmentFile) ||
              (typeof childData.imageFile === 'string' &&
                childData.imageFile) ||
              '';
            if (relativePath) {
              const result = await rpcRevealAttachment(relativePath);
              if (!result?.success) {
                toast(m.toast_reveal_failed());
              }
            }
            return;
          }
          default: {
            return;
          }
        }
      }

      const canvasTypeId = parseCanvasTypeMenuActionId(action);
      if (canvasTypeId) {
        const anchorCenter = contextMenu
          ? screenToFlow(contextMenu.x, contextMenu.y)
          : undefined;
        onRequestCreateCanvasType?.(canvasTypeId, {
          anchorCenter,
          screen: contextMenu
            ? { x: contextMenu.x, y: contextMenu.y }
            : undefined,
        });
        return;
      }

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
          toast.error(m.toast_move_selection_failed());
        }
        return;
      }

      const canvasNode = nodeId
        ? useCanvasStore.getState().nodes.find((n) => n.id === nodeId)
        : undefined;
      if (
        nodeId &&
        canvasNode?.type === 'extension' &&
        !isHostGenericMenuAction(action)
      ) {
        const handled = await runExtensionMenuAction({
          actionId: action,
          data: (canvasNode.data ?? {}) as Record<string, unknown>,
          nodeId,
        });
        if (handled) {
          return;
        }
      }

      switch (action) {
        case 'duplicate': {
          Promise.resolve(duplicateSelected()).catch((error) => {
            console.error('[canvas] Failed to duplicate selection:', error);
          });
          break;
        }
        case 'group-selection': {
          groupSelected();
          break;
        }
        case 'ai-summarize': {
          runAISummarize().catch((error) => {
            console.error('[AI] summarize task failed:', error);
          });
          break;
        }
        case 'paste': {
          Promise.resolve(pasteClipboard()).catch((error) => {
            console.error('[canvas] Failed to paste clipboard:', error);
          });
          break;
        }
        case 'reset-zoom': {
          rfInstance.current?.zoomTo(1, viewportMotion(VIEWPORT_ZOOM_MS));
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
        case 'export-topic-outline': {
          const { activeViewId, edges, nodes, views } =
            useCanvasStore.getState();
          const index = buildTopicIndex(nodes, edges);
          if (topicOutlineExportProblems(index).length > 0) {
            toast.error(m.toast_topic_outline_blocked());
            break;
          }
          const viewName =
            views.find((view) => view.id === activeViewId)?.name ?? 'Canvas';
          const markdown = buildTopicOutlineMarkdown(
            buildTopicOutline(index, nodes),
            { heading: viewName }
          );
          rpcExportTopicOutline(markdown, `${viewName}-topics.md`)
            .then((res) => {
              if (res?.success) {
                toast(m.toast_topic_outline_exported());
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
          await handleMarkdownImportResult(result, async (notes) => {
            for (const [index, note] of notes.entries()) {
              // Sequential so cards keep order and each create sees the last.
              // react-doctor-disable-next-line react-doctor/async-await-in-loop
              await createNode(
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
            if (
              node &&
              isFocusableNode(
                node.type,
                node.data as Record<string, unknown>
              ) &&
              openFocusedItem({
                id: nodeId,
                type: node.type,
                data: node.data,
                rect,
              })
            ) {
              revealNodeBesidePanel(nodeId, rfInstance.current);
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
                clipboardEdges: edges.flatMap((edge) => {
                  if (
                    !(targetIds.has(edge.source) && targetIds.has(edge.target))
                  ) {
                    return [];
                  }
                  const { selected: _selected, ...clean } = edge as Edge & {
                    selected?: boolean;
                  };
                  return [clean];
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
              const deleted = deleteNodes(ids);
              if (deleted > 0) {
                toast(
                  deleted > 1
                    ? m.toast_nodes_deleted({ count: deleted })
                    : m.toast_node_deleted(),
                  { action: { label: m.toast_undo(), onClick: () => undo() } }
                );
              }
            }
          }
          break;
        }
        case 'change-color': {
          if (nodeId) {
            const { nodes } = useCanvasStore.getState();
            const selected = nodes.filter((n) => n.selected);
            const ids =
              selected.length > 1 && selected.some((n) => n.id === nodeId)
                ? selected.map((n) => n.id)
                : [nodeId];
            const pickerTargets: string[] = [];
            let palette: 'card' | 'group' | 'sticky' | null = null;
            for (const id of ids) {
              const node = nodes.find((entry) => entry.id === id);
              if (!node || isLockedNode(node)) {
                continue;
              }
              if (node.type === 'extension') {
                cycleExtensionColor(
                  (node.data ?? {}) as Record<string, unknown>
                );
              } else {
                const kind =
                  node.type === 'sticky'
                    ? 'sticky'
                    : node.type === 'group'
                      ? 'group'
                      : 'card';
                // One palette per popover: a mixed selection recolours only
                // the items that share the first item's palette.
                palette ??= kind;
                if (kind === palette) {
                  pickerTargets.push(id);
                }
              }
            }
            if (palette && pickerTargets.length > 0) {
              useColorPickerStore.getState().open({
                anchor: { x: contextMenu?.x ?? 0, y: contextMenu?.y ?? 0 },
                palette,
                targets: pickerTargets.map((targetId) => ({
                  kind: 'node' as const,
                  nodeId: targetId,
                })),
              });
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
        case 'edit-topic-title': {
          if (nodeId) {
            setEditingTopicId(nodeId);
          }
          break;
        }
        case 'topic-new-child': {
          if (nodeId) {
            beginTopicRelativeDraft('child', nodeId);
          }
          break;
        }
        case 'topic-new-sibling': {
          if (nodeId) {
            beginTopicRelativeDraft('sibling', nodeId);
          }
          break;
        }
        case 'topic-copy-branch': {
          if (nodeId) {
            copyTopicBranch(nodeId);
          }
          break;
        }
        case 'topic-tidy-branch': {
          if (nodeId) {
            tidyTopicBranch(nodeId);
          }
          break;
        }
        case 'topic-select-branch': {
          if (nodeId) {
            const { edges, nodes, setNodes } = useCanvasStore.getState();
            const branch = new Set(
              collectTopicBranch(buildTopicIndex(nodes, edges), nodeId)
            );
            setNodes((current) =>
              current.map((node) => ({
                ...node,
                selected: branch.has(node.id),
              }))
            );
          }
          break;
        }
        case 'topic-detach-branch': {
          if (nodeId) {
            detachTopicBranch(nodeId);
          }
          break;
        }
        case 'topic-delete-branch': {
          if (nodeId) {
            deleteTopicBranch(nodeId);
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
          const node = useCanvasStore
            .getState()
            .nodes.find((entry) => entry.id === nodeId);
          if (nodeId && !(node && isLockedNode(node))) {
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
            toast(m.toast_note_moved_to_library(), {
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
        case 'toggle-sticky-pin': {
          if (nodeId) {
            toggleStickyPinned(nodeId);
          }
          break;
        }
        case 'toggle-lock': {
          if (nodeId) {
            toggleNodeLocked(nodeId);
          }
          break;
        }
        case 'toggle-lock-selection': {
          const selected: string[] = [];
          for (const node of useCanvasStore.getState().nodes) {
            if (node.selected) {
              selected.push(node.id);
            }
          }
          const ids = selected.length > 0 ? selected : nodeId ? [nodeId] : [];
          toggleNodesLocked(ids);
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
      duplicateSelected,
      groupSelected,
      addFolderChild,
      commitFolderChildData,
      deleteFolderChild,
      moveFolderChildToCanvas,
      pasteClipboard,
      saveSnapshot,
      createNode,
      toggleNodeLocked,
      toggleStickyPinned,
      toggleNodesLocked,
      moveSelectedToView,
      onRequestCreate,
      onRequestCreateCanvasType,
      setEditingTopicId,
      beginTopicRelativeDraft,
      copyTopicBranch,
      detachTopicBranch,
      deleteTopicBranch,
      tidyTopicBranch,
    ]
  );

  return {
    contextMenu,
    setContextMenu,
    onPaneContextMenu,
    onNodeContextMenu,
    onFolderChildContextMenu,
    onEdgeContextMenu,
    handleContextMenuAction,
  };
}
