import LabeledEdge from '@/components/canvas/edges/LabeledEdge';
import CardNode from '@/components/canvas/nodes/CardNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';
import ImageNode from '@/components/canvas/nodes/ImageNode';
import {
  CardNodeReadOnly,
  FolderNodeReadOnly,
  GroupNodeReadOnly,
  ImageNodeReadOnly,
  StickyNodeReadOnly,
} from '@/components/canvas/nodes/readOnlyNodes';
import StickyNode from '@/components/canvas/nodes/StickyNode';

export {
  CARD_COLORS,
  colorToStyle,
  GROUP_COLORS,
  isColorDark,
  STICKY_COLORS,
} from './colorUtils';

export const CARD_W = 350;
export const CARD_H = 450;
export const IMAGE_W = 350;
export const IMAGE_H = 350;
export const FOLDER_W = 280;
export const FOLDER_H = 280;
export const STICKY_W = 200;
export const STICKY_H = 200;

export const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
  group: GroupNode,
  image: ImageNode,
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
  sticky: StickyNodeReadOnly,
};

export const edgeTypes = {
  labeledEdge: LabeledEdge,
};
