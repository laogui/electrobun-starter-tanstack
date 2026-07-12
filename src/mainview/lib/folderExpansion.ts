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

type FolderThumbnailVariants = readonly (readonly FolderThumbnailSlot[])[];

/**
 * Count-specific compositions for the closed Folder stack. Every count has
 * three intentionally asymmetric variants: enough variation to keep folders
 * from looking stamped out, while keeping all cards close to the folder lip.
 */
const FOLDER_THUMBNAIL_LAYOUTS: Readonly<
  Record<1 | 2 | 3 | 4 | 5, FolderThumbnailVariants>
> = {
  1: [
    [{ leftPercent: 21, topPercent: 19, rotation: -1.6 }],
    [{ leftPercent: 20, topPercent: 18, rotation: 1.4 }],
    [{ leftPercent: 22, topPercent: 20, rotation: -0.6 }],
  ],
  2: [
    [
      { leftPercent: 9, topPercent: 22, rotation: -3.8 },
      { leftPercent: 32, topPercent: 18, rotation: 2.8 },
    ],
    [
      { leftPercent: 12, topPercent: 18, rotation: -2.4 },
      { leftPercent: 30, topPercent: 22, rotation: 3.8 },
    ],
    [
      { leftPercent: 7, topPercent: 21, rotation: -4.2 },
      { leftPercent: 34, topPercent: 19, rotation: 2.2 },
    ],
  ],
  3: [
    [
      { leftPercent: 5, topPercent: 24, rotation: -3.8 },
      { leftPercent: 21, topPercent: 17, rotation: 0.8 },
      { leftPercent: 37, topPercent: 22, rotation: 3.2 },
    ],
    [
      { leftPercent: 6, topPercent: 21, rotation: -2.8 },
      { leftPercent: 22, topPercent: 19, rotation: -0.4 },
      { leftPercent: 36, topPercent: 24, rotation: 4 },
    ],
    [
      { leftPercent: 3, topPercent: 24, rotation: -4.4 },
      { leftPercent: 22, topPercent: 16, rotation: 0 },
      { leftPercent: 39, topPercent: 21, rotation: 2.6 },
    ],
  ],
  4: [
    [
      { leftPercent: 3, topPercent: 24, rotation: -4.2 },
      { leftPercent: 15, topPercent: 20, rotation: -1.4 },
      { leftPercent: 28, topPercent: 18, rotation: 1.2 },
      { leftPercent: 40, topPercent: 23, rotation: 3.6 },
    ],
    [
      { leftPercent: 2, topPercent: 22, rotation: -3.4 },
      { leftPercent: 16, topPercent: 18, rotation: -0.6 },
      { leftPercent: 29, topPercent: 21, rotation: 2.2 },
      { leftPercent: 42, topPercent: 24, rotation: 4.4 },
    ],
    [
      { leftPercent: 5, topPercent: 24, rotation: -4.8 },
      { leftPercent: 14, topPercent: 19, rotation: -2 },
      { leftPercent: 30, topPercent: 17, rotation: 0.8 },
      { leftPercent: 39, topPercent: 22, rotation: 3 },
    ],
  ],
  5: [
    [
      { leftPercent: 3, topPercent: 24, rotation: -4.2 },
      { leftPercent: 13, topPercent: 21, rotation: -1.8 },
      { leftPercent: 23, topPercent: 17, rotation: 0.6 },
      { leftPercent: 33, topPercent: 19, rotation: 2.8 },
      { leftPercent: 42, topPercent: 24, rotation: 4.6 },
    ],
    [
      { leftPercent: 2, topPercent: 23, rotation: -3.6 },
      { leftPercent: 12, topPercent: 18, rotation: -0.8 },
      { leftPercent: 24, topPercent: 20, rotation: 1.4 },
      { leftPercent: 34, topPercent: 17, rotation: 3.8 },
      { leftPercent: 43, topPercent: 24, rotation: 5 },
    ],
    [
      { leftPercent: 4, topPercent: 24, rotation: -4.8 },
      { leftPercent: 14, topPercent: 20, rotation: -2.6 },
      { leftPercent: 22, topPercent: 16, rotation: -0.4 },
      { leftPercent: 32, topPercent: 20, rotation: 1.8 },
      { leftPercent: 41, topPercent: 23, rotation: 3.4 },
    ],
  ],
};

function hashFolderThumbnailSeed(childIds: readonly string[]): number {
  let hash = 0;
  for (const childId of childIds) {
    for (let index = 0; index < childId.length; index += 1) {
      hash = (hash * 31 + childId.charCodeAt(index)) % 2_147_483_647;
    }
    hash = (hash * 31 + 31) % 2_147_483_647;
  }
  return hash;
}

/**
 * Pick a stable pseudo-random layout from the matching card-count family.
 * The same children always produce the same slots, so regular renders never
 * jitter and the expansion origin stays identical to the closed thumbnail.
 */
export function getFolderThumbnailSlots(
  childIds: readonly string[]
): readonly FolderThumbnailSlot[] {
  const count = Math.min(MAX_FOLDER_PREVIEWS, childIds.length) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5;
  if (count === 0) {
    return [];
  }
  const variants = FOLDER_THUMBNAIL_LAYOUTS[count];
  return variants[hashFolderThumbnailSeed(childIds) % variants.length]!;
}

export const THUMBNAIL_WIDTH_PERCENT = 58;
export const THUMBNAIL_HEIGHT_PERCENT = 38;

/** Natural size used by both the closed stack and the expansion animation. */
export function getFolderChildPreviewSize(type: string): Size {
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

export function getFolderChildShapeClass(type: string): string {
  if (type === 'sticky') {
    return 'rounded-sm';
  }
  if (type === 'recording') {
    return 'rounded-2xl';
  }
  return 'rounded-3xl';
}

/**
 * Closed-stack thumbnail transform that matches the expansion origin frame:
 * layout the card at its natural preview size, then scale it into the slot.
 *
 * Transform order must match Motion's default (`scale` then `rotate`) so the
 * closing shared-element frame is pixel-identical to the static stack.
 */
export function getFolderThumbnailTransform(options: {
  folderHeight: number;
  folderWidth: number;
  rotation: number;
  type: string;
}): {
  height: number;
  scaleX: number;
  scaleY: number;
  transform: string;
  width: number;
} {
  const size = getFolderChildPreviewSize(options.type);
  const previewWidth = (options.folderWidth * THUMBNAIL_WIDTH_PERCENT) / 100;
  const previewHeight = (options.folderHeight * THUMBNAIL_HEIGHT_PERCENT) / 100;
  const scaleX = previewWidth / size.width;
  const scaleY = previewHeight / size.height;
  return {
    height: size.height,
    scaleX,
    scaleY,
    // Motion emits: translate → scaleX/scaleY → rotate
    transform: `translate(-50%, -50%) scale(${scaleX}, ${scaleY}) rotate(${options.rotation}deg)`,
    width: size.width,
  };
}

/**
 * Counter-scale thumbnail contents so a wide, shallow card does not stretch
 * its typography or imagery. The outer frame still fills its slot, while the
 * nested preview lands at the smaller axis' uniform scale.
 */
export function getFolderThumbnailContentTransform(options: {
  scaleX: number;
  scaleY: number;
}): {
  scaleX: number;
  transform: string;
  widthPercent: number;
} {
  if (!(options.scaleX > 0 && options.scaleY > 0)) {
    return { scaleX: 1, transform: 'scaleX(1)', widthPercent: 100 };
  }
  const scaleX = options.scaleY / options.scaleX;
  return {
    scaleX,
    transform: `scaleX(${scaleX})`,
    widthPercent: 100 / scaleX,
  };
}

/** Build a static-stack transform from the live expansion origin (exact match). */
export function getFolderThumbnailTransformFromOrigin(options: {
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
}): {
  height: number;
  scaleX: number;
  scaleY: number;
  transform: string;
  width: number;
} {
  return {
    height: options.height,
    scaleX: options.scaleX,
    scaleY: options.scaleY,
    transform: `translate(-50%, -50%) scale(${options.scaleX}, ${options.scaleY}) rotate(${options.rotation}deg)`,
    width: options.width,
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

  const thumbnailSlots = getFolderThumbnailSlots(
    children.map((child) => child.id)
  );
  const sizes = children.map((child) => getFolderChildPreviewSize(child.type));
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
    const slot = thumbnailSlots[index]!;
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
    const thumbnail = getFolderThumbnailTransform({
      folderHeight,
      folderWidth,
      rotation: slot.rotation,
      type: child.type,
    });
    const data: FolderExpandedChildData = {
      child,
      folderId,
      origin: {
        x: thumbnailCenter.x - targetCenter.x,
        y: thumbnailCenter.y - targetCenter.y,
        rotation: slot.rotation,
        scaleX: thumbnail.scaleX,
        scaleY: thumbnail.scaleY,
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
