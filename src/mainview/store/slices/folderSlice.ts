// Canvas store slice: Folder children and detached-note mutations.
import type { Node } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import type { StateCreator } from 'zustand';
import {
  isDetachableNode,
  isFolderChildNode,
} from '@/lib/canvasNodePredicates';
import {
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  findSpecByNodeType,
} from '@/lib/canvasNodeRegistry';
import { NOTE_CONTENT_KEYS } from '@/lib/canvasNoteHistory';
import { sortNodesByParent } from '@/lib/canvasUtils';
import { getNodeSize } from '@/lib/collision';
import * as m from '../../../paraglide/messages.js';
import { absoluteNodePosition } from '../../../shared/canvasGeometry';
import {
  type FolderChildEntry,
  resolveFolderChildSize,
  resolveFolderChildSpec,
} from '../canvas/folderChildren';
import type { CanvasState, CreateNodeOptions } from '../canvasStore';

export interface FolderSlice {
  absorbCardIntoFolder: (cardId: string, folderId: string) => void;
  // Folder-child mutations shared by canvas context menu / FocusedView / Sidebar
  absorbNodesIntoFolder: (
    nodeIds: string[],
    folderId: string,
    options?: { recordHistory?: boolean }
  ) => boolean;
  addFolderChild: (folderId: string) => void;
  commitFolderChildData: (
    folderId: string,
    childId: string,
    updates: Record<string, unknown>
  ) => void;
  deleteFolderChild: (folderId: string, childId: string) => void;
  detachNoteFromCanvas: (nodeId: string) => void;
  moveFolderChildToCanvas: (
    folderId: string,
    childId: string,
    options?: CreateNodeOptions
  ) => void;
  pinNoteToCanvas: (nodeId: string, position: { x: number; y: number }) => void;
  updateFolderChildData: (
    folderId: string,
    childId: string,
    updates: Record<string, unknown>
  ) => void;
}

export const createFolderSlice: StateCreator<
  CanvasState,
  [],
  [],
  FolderSlice
> = (set, get) => ({
  absorbCardIntoFolder: (cardId, folderId) => {
    get().absorbNodesIntoFolder([cardId], folderId);
  },

  absorbNodesIntoFolder: (nodeIds, folderId, options) => {
    const { nodes, edges } = get();
    const ids = new Set(nodeIds);
    const folder = nodes.find((node) => node.id === folderId);
    const cards = nodes.filter((node) => ids.has(node.id));
    if (
      !folder ||
      folder.type !== 'folder' ||
      ids.size === 0 ||
      cards.length !== ids.size ||
      ids.has(folderId)
    ) {
      return false;
    }
    if (edges.some((edge) => ids.has(edge.source) || ids.has(edge.target))) {
      toast.warning(m.toast_folder_connected_nodes());
      return false;
    }
    if (
      folder.data.locked ||
      cards.some(
        (card) => card.data.locked || !isFolderChildNode(card.type, card.data)
      )
    ) {
      toast.warning(m.toast_folder_selection_rejected());
      return false;
    }
    const existing = Array.isArray(folder.data.children)
      ? (folder.data.children as FolderChildEntry[])
      : [];
    if (existing.some((child) => ids.has(child.id))) {
      return false;
    }
    const children = cards.map((card) => {
      const { isHidden: _hidden, isDropTarget: _target, ...data } = card.data;
      const noteId =
        card.type === 'card'
          ? typeof data.noteId === 'string' && data.noteId
            ? data.noteId
            : `note_${nanoid(8)}`
          : undefined;
      return {
        id: card.id,
        type: card.type,
        ...(noteId ? { noteId } : {}),
        data: { ...data, ...(noteId ? { noteId } : {}) },
        size: getNodeSize(card),
      };
    });
    if (options?.recordHistory !== false) {
      get().saveSnapshot();
    }
    const nextData = { ...folder.data, children: [...existing, ...children] };
    set((state) => ({
      nodes: state.nodes
        .filter((node) => !ids.has(node.id))
        .map((node) =>
          node.id === folderId ? { ...node, data: nextData } : node
        ),
      focusedFolder:
        state.focusedFolder?.id === folderId
          ? { ...state.focusedFolder, data: nextData }
          : state.focusedFolder,
      focusedNode:
        state.focusedNode && ids.has(state.focusedNode.id)
          ? null
          : state.focusedNode,
    }));
    return true;
  },

  deleteFolderChild: (folderId, childId) => {
    const folder = get().nodes.find((n) => n.id === folderId);
    const existingChildren = ((folder?.data as any)?.children ?? []) as Array<{
      id: string;
    }>;
    if (!existingChildren.some((c) => c.id === childId)) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const existing = ((n.data as any).children ?? []) as Array<{
          id: string;
        }>;
        const children = existing.filter((c) => c.id !== childId);
        return {
          ...n,
          data: {
            ...n.data,
            children,
          },
        };
      }),
    }));
    // Only the reference is removed: the backing note/widget file stays so
    // undo, cut-paste and other canvases sharing it keep working. Orphans are
    // collected by the unlinked-files cleanup (src/bun/cleanup.ts).
  },

  updateFolderChildData: (folderId, childId, updates) => {
    set((s) => {
      let focusedFolder = s.focusedFolder;
      const nodes = s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const existing = ((n.data as any).children ?? []) as Array<{
          data: Record<string, unknown>;
          id: string;
          type?: string;
        }>;
        const children = existing.map((c) =>
          c.id === childId ? { ...c, data: { ...c.data, ...updates } } : c
        );
        if (focusedFolder?.id === folderId) {
          focusedFolder = {
            ...focusedFolder,
            data: { ...focusedFolder.data, children },
          };
        }
        return {
          ...n,
          data: { ...n.data, children },
        };
      });
      return { focusedFolder, nodes };
    });
  },

  commitFolderChildData: (folderId, childId, updates) => {
    const children = get().nodes.find((node) => node.id === folderId)?.data
      .children as FolderChildEntry[] | undefined;
    const child = children?.find((item) => item.id === childId);
    if (
      !(
        (child?.noteId || child?.data.noteId) &&
        Object.keys(updates).every((key) =>
          (NOTE_CONTENT_KEYS as readonly string[]).includes(key)
        )
      )
    ) {
      get().saveSnapshot();
    }
    get().updateFolderChildData(folderId, childId, updates);
  },

  addFolderChild: (folderId) => {
    get().saveSnapshot();
    const childId = `child-${nanoid(8)}`;
    // Each folder card-child maps 1:1 to an independent .md file (M5). The
    // actual file is created lazily by saveManifest; the noteId is stamped
    // up-front so the renderer and saver treat it like a top-level card.
    const noteId = `note_${nanoid(8)}`;
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== folderId) {
          return n;
        }
        const children = [
          ...((n.data as any).children || []),
          {
            id: childId,
            noteId,
            type: 'card' as const,
            data: {
              type: 'text' as const,
              title: '',
              content: '',
              color: '#FFFFFF',
              noteId,
            },
          },
        ];
        return {
          ...n,
          data: { ...n.data, children },
        };
      }),
    }));
  },

  moveFolderChildToCanvas: (folderId, childId, options) => {
    const { nodes } = get();
    const folder = nodes.find((node) => node.id === folderId);
    const children = ((folder?.data as any)?.children ??
      []) as FolderChildEntry[];
    const child = children.find((item) => item.id === childId);
    if (!(folder && child)) {
      return;
    }

    const spec = resolveFolderChildSpec(child);
    const childSize = resolveFolderChildSize(child, spec.size);
    const folderPosition = absoluteNodePosition(folder, nodes);
    const anchor =
      options?.anchor ??
      (options?.anchorCenter
        ? {
            x: options.anchorCenter.x - childSize.width / 2,
            y: options.anchorCenter.y - childSize.height / 2,
          }
        : {
            x: folderPosition.x + (FOLDER_W - childSize.width) / 2,
            y: folderPosition.y + FOLDER_H + 32,
          });

    get().saveSnapshot();
    set((s) => {
      const remainingChildren = children.filter((item) => item.id !== childId);
      const nextFolderData = {
        ...folder.data,
        children: remainingChildren,
      };
      const existingIds = new Set(s.nodes.map((node) => node.id));
      const restoredNodeId = existingIds.has(child.id)
        ? `node-${nanoid(8)}`
        : child.id;
      // Preserve the child's full data (including noteId) so the restored
      // top-level card keeps pointing at the same .md file on disk.
      const restoredNode: Node = {
        ...spec.base,
        id: restoredNodeId,
        type: spec.base.type,
        data: child.data,
        position: anchor,
        style: {
          ...spec.base.style,
          width: childSize.width,
          height: childSize.height,
        },
        selected: true,
      };

      return {
        focusedFolder:
          s.focusedFolder?.id === folderId
            ? {
                ...s.focusedFolder,
                data: nextFolderData,
              }
            : s.focusedFolder,
        nodes: sortNodesByParent([
          ...s.nodes.map((node) => {
            if (node.id === folderId) {
              return { ...node, data: nextFolderData, selected: false };
            }
            return { ...node, selected: false };
          }),
          restoredNode,
        ]),
      };
    });
  },

  pinNoteToCanvas: (nodeId, position) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!(node && (node.data as any).detached)) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }
        const spec = n.type ? findSpecByNodeType(n.type) : null;
        const { detached: _, ...cleanData } = n.data as Record<string, unknown>;
        return {
          ...n,
          position,
          style:
            n.style ??
            (spec
              ? { width: spec.size.width, height: spec.size.height }
              : { width: CARD_W, height: CARD_H }),
          data: cleanData,
        };
      }),
    }));
  },

  detachNoteFromCanvas: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (
      !(
        node &&
        isDetachableNode(node.type, node.data as Record<string, unknown>)
      )
    ) {
      return;
    }
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== nodeId) {
          return n;
        }
        return {
          ...n,
          position: { x: 0, y: 0 },
          data: { ...n.data, detached: true },
        };
      }),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
  },
});
