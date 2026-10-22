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
import { sortNodesByParent } from '@/lib/canvasUtils';
import { getNodeSize } from '@/lib/collision';
import { rpcDeleteNote, rpcDeleteWidget } from '@/lib/rpc';
import * as m from '../../../paraglide/messages.js';
import {
  type FolderChildEntry,
  resolveFolderChildSize,
  resolveFolderChildSpec,
} from '../canvas/folderChildren';
import type { CanvasState, CreateNodeOptions } from '../canvasStore';

export interface FolderSlice {
  // Folder-child mutations shared by canvas context menu / FocusedView / Sidebar
  absorbCardIntoFolder: (cardId: string, folderId: string) => void;
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
    const { nodes } = get();
    const card = nodes.find((n) => n.id === cardId);
    const folder = nodes.find((n) => n.id === folderId);
    if (!(card && folder) || folder.type !== 'folder') {
      return;
    }
    if (!isFolderChildNode(card.type, card.data as Record<string, unknown>)) {
      return;
    }
    // Preserve / synthesize noteId for card children so they map 1:1 to .md files
    // (images continue to use the imageFile attachment pattern).
    const isNoteBackedCard = card.type === 'card';
    const cardData = card.data as Record<string, unknown>;
    const existingNoteId = cardData.noteId as string | undefined;
    const childNoteId = isNoteBackedCard
      ? (existingNoteId ?? `note_${nanoid(8)}`)
      : undefined;
    const childData: Record<string, unknown> = isNoteBackedCard
      ? { ...cardData, noteId: childNoteId }
      : cardData;
    get().saveSnapshot();
    set((s) => ({
      nodes: s.nodes.flatMap((n) => {
        if (n.id === cardId) {
          return [];
        }
        if (n.id !== folderId) {
          return [n];
        }
        const existing = ((n.data as any).children ?? []) as Array<{
          data: Record<string, unknown>;
          id: string;
          noteId?: string;
          type?: string;
        }>;
        const children = [
          ...existing,
          {
            id: card.id,
            ...(childNoteId ? { noteId: childNoteId } : {}),
            type: card.type,
            data: childData,
            size: getNodeSize(card),
          },
        ];
        return [
          {
            ...n,
            data: {
              ...n.data,
              children,
            },
          },
        ];
      }),
      edges: s.edges.filter((e) => e.source !== cardId && e.target !== cardId),
    }));
  },

  deleteFolderChild: (folderId, childId) => {
    const folder = get().nodes.find((n) => n.id === folderId);
    const existingChildren = ((folder?.data as any)?.children ?? []) as Array<{
      data?: Record<string, unknown>;
      id: string;
      noteId?: string;
      type?: string;
    }>;
    const removed = existingChildren.find((c) => c.id === childId);
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
    // Fire-and-forget .md cleanup. Images keep their attachment pattern, so we
    // only delete notes for card children that actually had a noteId.
    if (removed?.noteId && removed.type !== 'image') {
      rpcDeleteNote(removed.noteId).catch((error) => {
        console.error(
          '[canvasStore] Failed to delete folder child note:',
          error
        );
        toast.error(m.toast_delete_note_file_failed());
      });
    }
    // Widget children own a backing JSON file; delete it so disk does not
    // accumulate orphan widget files until the next unlinked-file sweep.
    if (removed?.type === 'widget') {
      const removedWidgetId = removed.data?.widgetId as string | undefined;
      if (removedWidgetId) {
        rpcDeleteWidget(removedWidgetId).catch((error) => {
          console.error(
            '[canvasStore] Failed to delete folder child widget:',
            error
          );
          toast.error(m.toast_delete_widget_file_failed());
        });
      }
    }
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
    get().saveSnapshot();
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
    const anchor =
      options?.anchor ??
      (options?.anchorCenter
        ? {
            x: options.anchorCenter.x - childSize.width / 2,
            y: options.anchorCenter.y - childSize.height / 2,
          }
        : {
            x: folder.position.x + (FOLDER_W - childSize.width) / 2,
            y: folder.position.y + FOLDER_H + 32,
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
