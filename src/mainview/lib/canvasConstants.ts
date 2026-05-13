import LabeledEdge from '@/components/canvas/edges/LabeledEdge';
import CardNode from '@/components/canvas/nodes/CardNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';
import ImageNode from '@/components/canvas/nodes/ImageNode';
import LinkNode from '@/components/canvas/nodes/LinkNode';
import {
  CardNodeReadOnly,
  FolderNodeReadOnly,
  GroupNodeReadOnly,
  ImageNodeReadOnly,
  LinkNodeReadOnly,
  StickyNodeReadOnly,
} from '@/components/canvas/nodes/readOnlyNodes';
import StickyNode from '@/components/canvas/nodes/StickyNode';

/**
 * Default node dimensions. These now live in `canvasNodeRegistry` (the spec
 * registry is the single source of truth for size); re-exported here so
 * existing call sites keep working unchanged.
 */
export {
  CARD_H,
  CARD_W,
  FOLDER_H,
  FOLDER_W,
  IMAGE_H,
  IMAGE_W,
  STICKY_H,
  STICKY_W,
} from './canvasNodeRegistry';
export {
  CARD_COLORS,
  colorToStyle,
  GROUP_COLORS,
  isColorDark,
  STICKY_COLORS,
} from './colorUtils';

export const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
  group: GroupNode,
  image: ImageNode,
  link: LinkNode,
  sticky: StickyNode,
};

/**
 * Same visual set as `nodeTypes` but without store subscriptions, RPC calls,
 * or interactive editing. Use this `nodeTypes` object when rendering a
 * React Flow canvas for preview-only purposes (e.g. template gallery, PNG
 * export, minimap thumbnails).
 */
export const readOnlyNodeTypes = {
  card: CardNodeReadOnly,
  folder: FolderNodeReadOnly,
  group: GroupNodeReadOnly,
  image: ImageNodeReadOnly,
  link: LinkNodeReadOnly,
  sticky: StickyNodeReadOnly,
};

export const edgeTypes = {
  labeledEdge: LabeledEdge,
};
