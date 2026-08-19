import type { Node } from '@xyflow/react';

import { RECORDING_CANVAS_TYPE_ID } from '../../shared/extensions/builtinIds';
import { findSpecByNodeType } from './canvasNodeRegistry';
import {
  buildAbsoluteRects,
  type Point,
  type Rect,
  type Size,
} from './collision';

export const FOLDER_EXPANDED_CHILD_NODE_TYPE = 'folderExpandedChild';
/** Closed folder artwork stays intentionally concise. */
export const MAX_FOLDER_PREVIEWS = 5;
/** Expanded shelves can reveal a richer set before a dedicated pager is needed. */
export const MAX_FOLDER_EXPANDED_CHILDREN = 8;
export const FOLDER_EXPANSION_GAP = 18;

const MAX_EXPANDED_WIDTH = 480;
const MAX_EXPANDED_HEIGHT = 480;
const MIN_SOURCE_EDGE = 120;
const MAX_SOURCE_EDGE = 900;
const EXPANDED_SCALE = 0.68;
const FOLDER_SHELF_GAP = 22;
const MAX_WATERFALL_COLUMNS = 5;
const MIN_WATERFALL_WIDTH = 1120;
const WATERFALL_WIDTH_FACTOR = 5;
const HIDDEN_ORIGIN_SCALE = 0.16;
// React Flow raises selected nodes by 1000. Keep the temporary expansion
// layer above that range, then let the folder anchor sit one layer higher so
// returning cards disappear behind its shell instead of painting over it.
const EXPANSION_LAYER_OFFSET = 1001;

export interface FolderChildEntry {
  data: Record<string, unknown>;
  id: string;
  noteId?: string;
  size?: Size;
  type: string;
}

export interface FolderExpandedChildData extends Record<string, unknown> {
  child: FolderChildEntry;
  folderId: string;
  motionCount: number;
  /** 0 is the folder-adjacent row; 1 is the highest waterfall row. */
  motionDepth?: number;
  motionOrder: number;
  origin: Point & {
    kind: 'hidden' | 'peek';
    opacity: number;
    peekIndex: number | null;
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function getFolderChildSourceSize(type: string, storedSize?: Size): Size {
  const fallback = findSpecByNodeType(type)?.size ?? {
    width: 350,
    height: 450,
  };
  const hasStoredSize =
    Number.isFinite(storedSize?.width) &&
    Number.isFinite(storedSize?.height) &&
    (storedSize?.width ?? 0) > 0 &&
    (storedSize?.height ?? 0) > 0;
  const source = hasStoredSize ? storedSize! : fallback;
  return {
    width: clamp(source.width, MIN_SOURCE_EDGE, MAX_SOURCE_EDGE),
    height: clamp(source.height, MIN_SOURCE_EDGE, MAX_SOURCE_EDGE),
  };
}

/** Natural size used by both the closed stack and the expansion animation. */
export function getFolderChildPreviewSize(
  type: string,
  storedSize?: Size
): Size {
  const source = getFolderChildSourceSize(type, storedSize);
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

export function getFolderChildShapeClass(
  type: string,
  data?: Record<string, unknown>
): string {
  if (type === 'sticky') {
    return 'rounded-sm';
  }
  if (type === 'recording') {
    return 'rounded-2xl';
  }
  if (type === 'extension' && data?.canvasTypeId === RECORDING_CANVAS_TYPE_ID) {
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
  size?: Size;
  type: string;
}): {
  height: number;
  scaleX: number;
  scaleY: number;
  transform: string;
  width: number;
} {
  const size = getFolderChildPreviewSize(options.type, options.size);
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
    .slice(0, MAX_FOLDER_EXPANDED_CHILDREN);
}

/**
 * The closed folder always previews the same leading identities. Randomness is
 * allowed in their slot composition, never in which cards are selected.
 */
export function getFolderPeekChildren(
  children: readonly FolderChildEntry[]
): FolderChildEntry[] {
  return children.slice(0, MAX_FOLDER_PREVIEWS);
}

export interface FolderShelfSlot extends Point, Size {}

interface WaterfallColumn {
  height: number;
  itemIndexes: number[];
  width: number;
}

interface WaterfallPlan {
  columns: WaterfallColumn[];
  totalWidth: number;
}

function buildWaterfallPlan(
  sizes: readonly Size[],
  columnCount: number
): WaterfallPlan {
  const columns = Array.from(
    { length: columnCount },
    (): WaterfallColumn => ({
      height: 0,
      itemIndexes: [],
      width: 0,
    })
  );
  const centerIndex = (columnCount - 1) / 2;

  for (const [itemIndex, size] of sizes.entries()) {
    let columnIndex = itemIndex;
    if (itemIndex >= columnCount) {
      columnIndex = columns.reduce((bestIndex, column, index) => {
        const best = columns[bestIndex]!;
        if (column.height !== best.height) {
          return column.height < best.height ? index : bestIndex;
        }
        const distance = Math.abs(index - centerIndex);
        const bestDistance = Math.abs(bestIndex - centerIndex);
        return distance < bestDistance ? index : bestIndex;
      }, 0);
    }

    const column = columns[columnIndex]!;
    column.height +=
      size.height + (column.itemIndexes.length > 0 ? FOLDER_SHELF_GAP : 0);
    column.width = Math.max(column.width, size.width);
    column.itemIndexes.push(itemIndex);
  }

  return {
    columns,
    totalWidth:
      columns.reduce((sum, column) => sum + column.width, 0) +
      FOLDER_SHELF_GAP * Math.max(0, columns.length - 1),
  };
}

/**
 * Bottom-up waterfall packing modeled after the reference interaction:
 *
 * - up to five bottom columns grow outward from the folder;
 * - additional cards stack above the currently shortest, center-most column;
 * - wide content automatically reduces the number of columns;
 * - every column grows upward and preserves each card's natural dimensions.
 */
export function calculateFolderWaterfallLayout(options: {
  folderRect: Rect;
  sizes: readonly Size[];
}): FolderShelfSlot[] {
  const { folderRect, sizes } = options;
  if (sizes.length === 0) {
    return [];
  }

  const folderWidth = folderRect.right - folderRect.left;
  const maximumWidth = Math.max(
    MIN_WATERFALL_WIDTH,
    folderWidth * WATERFALL_WIDTH_FACTOR
  );
  let plan = buildWaterfallPlan(
    sizes,
    Math.min(MAX_WATERFALL_COLUMNS, sizes.length)
  );
  while (plan.totalWidth > maximumWidth && plan.columns.length > 1) {
    plan = buildWaterfallPlan(sizes, plan.columns.length - 1);
  }

  const folderCenterX = (folderRect.left + folderRect.right) / 2;
  const slots = Array.from<FolderShelfSlot | undefined>({
    length: sizes.length,
  });
  let cursorX = folderCenterX - plan.totalWidth / 2;

  for (const column of plan.columns) {
    const columnCenterX = cursorX + column.width / 2;
    let baseline = folderRect.top - FOLDER_SHELF_GAP;
    for (const itemIndex of column.itemIndexes) {
      const size = sizes[itemIndex]!;
      slots[itemIndex] = {
        x: columnCenterX - size.width / 2,
        y: baseline - size.height,
        width: size.width,
        height: size.height,
      };
      baseline -= size.height + FOLDER_SHELF_GAP;
    }
    cursorX += column.width + FOLDER_SHELF_GAP;
  }

  return slots.map((slot) => slot!);
}

function getHiddenOrigin(options: {
  folderRect: Rect;
  hiddenIndex: number;
  size: Size;
}): Point & {
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  const { folderRect, hiddenIndex, size } = options;
  const folderWidth = folderRect.right - folderRect.left;
  const folderHeight = folderRect.bottom - folderRect.top;
  const direction = hiddenIndex % 2 === 0 ? -1 : 1;
  const centerX =
    (folderRect.left + folderRect.right) / 2 +
    direction * folderWidth * (0.025 + hiddenIndex * 0.012);
  const centerY = folderRect.top + folderHeight * 0.56;
  const scale = Math.min(
    HIDDEN_ORIGIN_SCALE,
    (folderWidth * 0.28) / size.width,
    (folderHeight * 0.2) / size.height
  );
  return {
    x: centerX,
    y: centerY,
    rotation: direction * (1.2 + hiddenIndex * 0.45),
    scaleX: scale,
    scaleY: scale,
  };
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

  const peekChildren = getFolderPeekChildren(children);
  const peekIndexById = new Map(
    peekChildren.map((child, index) => [child.id, index] as const)
  );
  const thumbnailSlots = getFolderThumbnailSlots(
    peekChildren.map((child) => child.id)
  );
  const sizes = children.map((child) =>
    getFolderChildPreviewSize(child.type, child.size)
  );
  const waterfallSlots = calculateFolderWaterfallLayout({ folderRect, sizes });
  const waterfallItems = waterfallSlots.map((slot, index) => ({
    index,
    bottom: slot.y + slot.height,
    x: slot.x,
  }));
  const lowestBottom = Math.max(...waterfallItems.map((item) => item.bottom));
  const highestBottom = Math.min(...waterfallItems.map((item) => item.bottom));
  const waterfallDepth = lowestBottom - highestBottom;
  const motionOrderByIndex = new Map(
    waterfallItems
      .sort((a, b) => b.bottom - a.bottom || a.x - b.x)
      .map((item, motionOrder) => [item.index, motionOrder] as const)
  );
  const motionDepthByIndex = new Map(
    waterfallItems.map(
      (item) =>
        [
          item.index,
          waterfallDepth > 0
            ? (lowestBottom - item.bottom) / waterfallDepth
            : 0,
        ] as const
    )
  );
  const folderWidth = folderRect.right - folderRect.left;
  const folderHeight = folderRect.bottom - folderRect.top;
  const expansionLayerBase =
    Math.max(
      0,
      ...allNodes.map((node) =>
        typeof node.zIndex === 'number' ? node.zIndex : 0
      )
    ) + EXPANSION_LAYER_OFFSET;
  return children.map((child, index): Node => {
    const size = sizes[index]!;
    const peekIndex = peekIndexById.get(child.id) ?? null;
    const position = waterfallSlots[index]!;
    const targetCenter = {
      x: position.x + size.width / 2,
      y: position.y + size.height / 2,
    };
    const peekSlot = peekIndex === null ? null : thumbnailSlots[peekIndex]!;
    const hiddenOrigin =
      peekIndex === null
        ? getHiddenOrigin({
            folderRect,
            hiddenIndex: index - peekChildren.length,
            size,
          })
        : null;
    const originCenter = peekSlot
      ? {
          x:
            folderRect.left +
            folderWidth *
              ((peekSlot.leftPercent + THUMBNAIL_WIDTH_PERCENT / 2) / 100),
          y:
            folderRect.top +
            folderHeight *
              ((peekSlot.topPercent + THUMBNAIL_HEIGHT_PERCENT / 2) / 100),
        }
      : { x: hiddenOrigin!.x, y: hiddenOrigin!.y };
    const thumbnail = peekSlot
      ? getFolderThumbnailTransform({
          folderHeight,
          folderWidth,
          rotation: peekSlot.rotation,
          size: child.size,
          type: child.type,
        })
      : {
          rotation: hiddenOrigin!.rotation,
          scaleX: hiddenOrigin!.scaleX,
          scaleY: hiddenOrigin!.scaleY,
        };
    const data: FolderExpandedChildData = {
      child,
      folderId,
      motionCount: children.length,
      motionDepth: motionDepthByIndex.get(index) ?? 0,
      motionOrder: motionOrderByIndex.get(index) ?? index,
      origin: {
        x: originCenter.x - targetCenter.x,
        y: originCenter.y - targetCenter.y,
        kind: peekIndex === null ? 'hidden' : 'peek',
        opacity: peekIndex === null ? 0 : 1,
        peekIndex,
        rotation: peekSlot?.rotation ?? hiddenOrigin!.rotation,
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
