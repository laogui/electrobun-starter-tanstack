import type { Node } from '@xyflow/react';

import { findSpecByNodeType } from './canvasNodeRegistry';
import { buildAbsoluteRects, type Point, type Size } from './collision';

export const FOLDER_EXPANDED_CHILD_NODE_TYPE = 'folderExpandedChild';
export const MAX_FOLDER_PREVIEWS = 5;
export const FOLDER_EXPANSION_GAP = 18;

const MAX_EXPANDED_WIDTH = 190;
const MAX_EXPANDED_HEIGHT = 234;
const EXPANDED_SCALE = 0.52;
const CARD_GAP = 18;
const FOLDER_TO_CARDS_GAP = 22;
// React Flow raises selected nodes by 1000. Keep the temporary expansion
// layer above that range, then let the folder anchor sit one layer higher so
// returning cards disappear behind its shell instead of painting over it.
const EXPANSION_LAYER_OFFSET = 1001;

export interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  noteId?: string;
  type: string;
}

export interface FolderExpandedChildData extends Record<string, unknown> {
  child: FolderChildEntry;
  folderId: string;
  origin: Point & { rotation: number; scaleX: number; scaleY: number };
  phase: 'closing' | 'open';
  target: Point & Size;
}

export interface FolderThumbnailSlot {
  leftPercent: number;
  rotation: number;
  topPercent: number;
}

/**
 * Five stable slots shared by the closed Folder stack and the expansion
 * origin calculation. Keeping both sides on the same geometry makes the
 * child card appear to come from the thumbnail the user was already seeing.
 */
export const FOLDER_THUMBNAIL_SLOTS: readonly FolderThumbnailSlot[] = [
  { leftPercent: 18, topPercent: 16, rotation: -9 },
  { leftPercent: 27, topPercent: 10, rotation: -5 },
  { leftPercent: 35, topPercent: 6, rotation: 0 },
  { leftPercent: 43, topPercent: 10, rotation: 5 },
  { leftPercent: 52, topPercent: 16, rotation: 9 },
];

const THUMBNAIL_WIDTH_PERCENT = 32;
const THUMBNAIL_HEIGHT_PERCENT = 52;

function expandedSize(type: string): Size {
  const source = findSpecByNodeType(type)?.size ?? {
    width: 350,
    height: 450,
  };
  const scale = Math.min(
    EXPANDED_SCALE,
    MAX_EXPANDED_WIDTH / source.width,
    MAX_EXPANDED_HEIGHT / source.height
  );
  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
}

function getChildren(folder: Node): FolderChildEntry[] {
  const children = (folder.data as { children?: unknown }).children;
  if (!Array.isArray(children)) {
    return [];
  }
  return children
    .filter((child): child is FolderChildEntry =>
      Boolean(
        child &&
          typeof child === 'object' &&
          typeof (child as FolderChildEntry).id === 'string' &&
          typeof (child as FolderChildEntry).type === 'string' &&
          (child as FolderChildEntry).data &&
          typeof (child as FolderChildEntry).data === 'object'
      )
    )
    .slice(0, MAX_FOLDER_PREVIEWS);
}

/**
 * Materialize the visible Folder children as render-only React Flow nodes.
 * Their positions are final collision boxes; the node renderer animates its
 * inner visual from `origin` so React Flow can solve the destination layout
 * immediately without snapping the shared-element animation.
 */
export function buildFolderExpansionNodes(options: {
  allNodes: Node[];
  closing: boolean;
  folderId: string;
}): Node[] {
  const { allNodes, closing, folderId } = options;
  const folder = allNodes.find((node) => node.id === folderId);
  if (!folder) {
    return [];
  }
  const folderRect = buildAbsoluteRects(allNodes).get(folderId);
  if (!folderRect) {
    return [];
  }
  const children = getChildren(folder);
  if (children.length === 0) {
    return [];
  }

  const sizes = children.map((child) => expandedSize(child.type));
  const totalWidth =
    sizes.reduce((sum, size) => sum + size.width, 0) +
    CARD_GAP * Math.max(0, sizes.length - 1);
  const folderCenterX = (folderRect.left + folderRect.right) / 2;
  const folderWidth = folderRect.right - folderRect.left;
  const folderHeight = folderRect.bottom - folderRect.top;
  const expansionLayerBase =
    Math.max(
      0,
      ...allNodes.map((node) =>
        typeof node.zIndex === 'number' ? node.zIndex : 0
      )
    ) + EXPANSION_LAYER_OFFSET;
  let cursorX = folderCenterX - totalWidth / 2;

  return children.map((child, index): Node => {
    const size = sizes[index]!;
    const slot = FOLDER_THUMBNAIL_SLOTS[index]!;
    const distanceFromCenter = Math.abs(index - (children.length - 1) / 2);
    const bottom =
      folderRect.top - FOLDER_TO_CARDS_GAP - distanceFromCenter * 5;
    const position = {
      x: cursorX,
      y: bottom - size.height,
    };
    cursorX += size.width + CARD_GAP;

    const thumbnailCenter = {
      x:
        folderRect.left +
        folderWidth * ((slot.leftPercent + THUMBNAIL_WIDTH_PERCENT / 2) / 100),
      y:
        folderRect.top +
        folderHeight * ((slot.topPercent + THUMBNAIL_HEIGHT_PERCENT / 2) / 100),
    };
    const targetCenter = {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2,
    };
    const previewWidth = (folderWidth * THUMBNAIL_WIDTH_PERCENT) / 100;
    const previewHeight = (folderHeight * THUMBNAIL_HEIGHT_PERCENT) / 100;
    const data: FolderExpandedChildData = {
      child,
      folderId,
      origin: {
        x: thumbnailCenter.x - targetCenter.x,
        y: thumbnailCenter.y - targetCenter.y,
        rotation: slot.rotation,
        scaleX: previewWidth / size.width,
        scaleY: previewHeight / size.height,
      },
      phase: closing ? 'closing' : 'open',
      target: {
        x: position.x - folderRect.left,
        y: position.y - folderRect.top,
        width: size.width,
        height: size.height,
      },
    };

    return {
      id: `${FOLDER_EXPANDED_CHILD_NODE_TYPE}:${folderId}:${child.id}`,
      type: FOLDER_EXPANDED_CHILD_NODE_TYPE,
      position,
      data,
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      zIndex: expansionLayerBase + index,
      className: 'folder-expanded-child',
      width: size.width,
      height: size.height,
      style: {
        width: size.width,
        height: size.height,
        pointerEvents: 'none',
      },
    };
  });
}

export function isFolderExpandedChildNode(
  node: Node
): node is Node<FolderExpandedChildData> {
  return node.type === FOLDER_EXPANDED_CHILD_NODE_TYPE;
}
