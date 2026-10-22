import type { Node, NodeChange } from '@xyflow/react';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';
import { applyCanvasNodeChanges } from '@/lib/applyCanvasNodeChanges';
import { isLockedNode, isPinnedSticky } from '@/lib/canvasNodePredicates';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { CARD_COLORS, GROUP_COLORS, STICKY_COLORS } from '@/lib/colorUtils';
import { collectNoteIdsFromCanvasNodes } from '@/lib/noteTitleProjection';
import { rpcDeleteWidget } from '@/lib/rpc';
import * as m from '../../../paraglide/messages.js';
import {
  type FolderChildEntry,
  folderChildToDetachedNode,
} from '../canvas/folderChildren';
import { noteTitleMap, projectNoteTitles } from '../canvas/noteTitles';
import { topicCommandContextForNodes } from '../canvas/topicCommandContext';
import { settleTopicsAfterDelete } from '../canvas/topicGraph';
import type { CanvasState } from '../canvasStore';

function nodeZIndex(node: Node): number {
  return typeof node.zIndex === 'number' ? node.zIndex : 0;
}

export interface NodesSlice {
  applyNodesChange: (changes: NodeChange[]) => void;
  applyNoteTitles: (
    titles: Record<string, string>,
    options?: { snapshot?: boolean }
  ) => void;
  bringNodesForward: (ids: string[]) => void;
  bringNodesToFront: (ids: string[]) => void;
  changeNodeColor: (nodeId: string) => void;
  collectSelectedNoteIds: () => string[];
  /** Snapshots history then updates node data — for discrete user edits (blur commits, image upload, checklist toggles, etc.). */
  commitNodeData: (nodeId: string, updates: Record<string, unknown>) => void;
  /** Deletes the unlocked nodes in `ids`; returns how many were deleted. */
  deleteNodes: (ids: string[]) => number;
  // Core data
  nodes: Node[];
  sendNodesBackward: (ids: string[]) => void;
  sendNodesToBack: (ids: string[]) => void;

  // Actions – core
  setNodes: (updater: Node[] | ((prev: Node[]) => Node[])) => void;
  toggleNodeLocked: (nodeId: string) => void;
  /** Lock every node in `ids` unless all are already locked, then unlock. */
  toggleNodesLocked: (ids: string[]) => void;
  toggleStickyPinned: (nodeId: string) => void;
  updateNodeData: (nodeId: string, updates: Record<string, unknown>) => void;
}

export const createNodesSlice: StateCreator<CanvasState, [], [], NodesSlice> = (
  set,
  get
) => ({
  nodes: [],

  setNodes: (updater) => {
    set((s) => {
      const updated =
        typeof updater === 'function' ? updater(s.nodes) : updater;
      if (updated === s.nodes) {
        return s;
      }
      const pinned = new Map(
        s.nodes.filter(isPinnedSticky).map((node) => [node.id, node])
      );
      const nodes = pinned.size
        ? updated.map((node) => {
            const previous = pinned.get(node.id);
            // Reparenting converts coordinates; moving a parent leaves its
            // children's relative positions untouched.
            if (
              !(previous && isPinnedSticky(node)) ||
              node.parentId !== previous.parentId ||
              (node.position.x === previous.position.x &&
                node.position.y === previous.position.y)
            ) {
              return node;
            }
            return { ...node, position: previous.position };
          })
        : updated;
      return {
        nodes,
        topicCommandContextId: topicCommandContextForNodes(
          s.nodes,
          nodes,
          s.topicCommandContextId
        ),
      };
    });
  },

  applyNodesChange: (changes) => {
    set((s) => {
      const nodes = applyCanvasNodeChanges(changes, s.nodes);
      if (nodes === s.nodes) {
        return s;
      }
      return {
        nodes,
        topicCommandContextId: topicCommandContextForNodes(
          s.nodes,
          nodes,
          s.topicCommandContextId
        ),
      };
    });
  },

  collectSelectedNoteIds: () =>
    collectNoteIdsFromCanvasNodes(get().nodes, { selectedOnly: true }),

  applyNoteTitles: (titles, options) => {
    const map = noteTitleMap(titles);
    if (!map) {
      return;
    }
    if (options?.snapshot !== false) {
      get().saveSnapshot();
    }
    set((s) => projectNoteTitles(s.nodes, s.focusedNode, map));
  },

  updateNodeData: (nodeId, updates) => {
    set((s) => {
      // The focused view reads from `focusedNode.data`, a snapshot captured when
      // the view opened. Without syncing it here, edits made inside the focused
      // view (e.g. deleting a checklist item) write to `nodes` but the view
      // keeps rendering stale data, so the edit appears to "not work". Mirror
      // the folder-child path (see updateFolderChildData) by refreshing the
      // snapshot whenever it points at the node being updated.
      const focusedNode =
        s.focusedNode?.id === nodeId
          ? {
              ...s.focusedNode,
              data: { ...s.focusedNode.data, ...updates },
            }
          : s.focusedNode;
      return {
        focusedNode,
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
        ),
      };
    });
  },

  commitNodeData: (nodeId, updates) => {
    get().saveSnapshot();
    get().updateNodeData(nodeId, updates);
  },

  toggleStickyPinned: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (node?.type !== 'sticky') {
      return;
    }
    get().commitNodeData(nodeId, { pinned: !isPinnedSticky(node) });
  },

  toggleNodeLocked: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node) {
      return;
    }
    const current = Boolean(
      (node.data as { locked?: unknown } | undefined)?.locked
    );
    get().commitNodeData(nodeId, { locked: !current });
  },

  toggleNodesLocked: (ids) => {
    const idSet = new Set(ids);
    const targets = get().nodes.filter((node) => idSet.has(node.id));
    if (targets.length === 0) {
      return;
    }
    // Mixed selections lock everything; only a fully locked selection unlocks.
    const nextLocked = targets.some(
      (node) => !(node.data as { locked?: unknown } | undefined)?.locked
    );
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) =>
        idSet.has(node.id)
          ? { ...node, data: { ...node.data, locked: nextLocked } }
          : node
      ),
    }));
  },

  bringNodesToFront: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    const { nodes } = get();
    const targets = nodes.filter((node) => idSet.has(node.id));
    if (targets.length === 0) {
      return;
    }
    const maxZ = Math.max(0, ...nodes.map(nodeZIndex));
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) => {
        const index = targets.findIndex((target) => target.id === node.id);
        return index === -1 ? node : { ...node, zIndex: maxZ + index + 1 };
      }),
    }));
  },

  sendNodesToBack: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    const { nodes } = get();
    const targets = nodes.filter((node) => idSet.has(node.id));
    if (targets.length === 0) {
      return;
    }
    const minZ = Math.min(0, ...nodes.map(nodeZIndex));
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) => {
        const index = targets.findIndex((target) => target.id === node.id);
        return index === -1
          ? node
          : { ...node, zIndex: minZ - targets.length + index };
      }),
    }));
  },

  bringNodesForward: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) =>
        idSet.has(node.id) ? { ...node, zIndex: nodeZIndex(node) + 1 } : node
      ),
    }));
  },

  sendNodesBackward: (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((node) =>
        idSet.has(node.id) ? { ...node, zIndex: nodeZIndex(node) - 1 } : node
      ),
    }));
  },

  deleteNodes: (ids) => {
    const lockedIds = new Set(
      get()
        .nodes.filter(isLockedNode)
        .map((node) => node.id)
    );
    const idSet = new Set(ids.filter((id) => !lockedIds.has(id)));
    if (ids.some((id) => lockedIds.has(id))) {
      toast.error(m.toast_locked_nodes_not_deleted());
    }
    if (idSet.size === 0) {
      return 0;
    }
    // Collect backing widget files for top-level widget nodes being removed.
    // Folder children are detached (not deleted) when a folder is removed, so
    // their widget files are intentionally left intact here.
    const widgetIdsToDelete: string[] = [];
    for (const node of get().nodes) {
      if (idSet.has(node.id) && node.type === 'widget') {
        const widgetId = (node.data as Record<string, unknown> | undefined)
          ?.widgetId;
        if (typeof widgetId === 'string' && widgetId) {
          widgetIdsToDelete.push(widgetId);
        }
      }
    }
    get().saveSnapshot();
    set((s) => {
      const usedNodeIds = new Set<string>();
      for (const node of s.nodes) {
        if (!idSet.has(node.id)) {
          usedNodeIds.add(node.id);
        }
      }
      const detachedFolderChildren = s.nodes.flatMap((node) => {
        if (!idSet.has(node.id) || node.type !== 'folder') {
          return [];
        }
        const children = ((node.data as any)?.children ??
          []) as FolderChildEntry[];
        return children.map((child) =>
          folderChildToDetachedNode(child, usedNodeIds)
        );
      });

      return settleTopicsAfterDelete(
        s.nodes,
        s.edges,
        sortNodesByParent([
          ...s.nodes.flatMap((n) => {
            if (idSet.has(n.id)) {
              return [];
            }
            if (n.parentId && idSet.has(n.parentId)) {
              const { parentId, extent, ...rest } = n as any;
              return [rest as Node];
            }
            return [n];
          }),
          ...detachedFolderChildren,
        ]),
        s.edges.filter((e) => !(idSet.has(e.source) || idSet.has(e.target))),
        idSet
      );
    });
    // Fire-and-forget widget file cleanup for removed top-level widget nodes.
    for (const widgetId of widgetIdsToDelete) {
      rpcDeleteWidget(widgetId).catch((error) => {
        console.error('[canvasStore] Failed to delete widget file:', error);
        toast.error(m.toast_delete_widget_file_failed());
      });
    }
    return idSet.size;
  },

  changeNodeColor: (nodeId) => {
    const node = get().nodes.find((entry) => entry.id === nodeId);
    if (!node || node.type === 'extension') {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }
        if (n.type === 'group') {
          const idx = GROUP_COLORS.indexOf((n.data as any).color ?? 'blue');
          return {
            ...n,
            data: {
              ...n.data,
              color: GROUP_COLORS[(idx + 1) % GROUP_COLORS.length],
            },
          };
        }
        if (n.type === 'sticky') {
          const idx = STICKY_COLORS.indexOf(
            (n.data as any).color ?? STICKY_COLORS[0]
          );
          return {
            ...n,
            data: {
              ...n.data,
              color: STICKY_COLORS[(idx + 1) % STICKY_COLORS.length],
            },
          };
        }
        if (n.type === 'image') {
          const idx = CARD_COLORS.indexOf((n.data as any).color ?? '#FFFFFF');
          return {
            ...n,
            data: {
              ...n.data,
              color: CARD_COLORS[(idx + 1) % CARD_COLORS.length],
            },
          };
        }
        const idx = CARD_COLORS.indexOf((n.data as any).color ?? '#FFFFFF');
        return {
          ...n,
          data: {
            ...n.data,
            color: CARD_COLORS[(idx + 1) % CARD_COLORS.length],
          },
        };
      }),
    }));
  },
});
