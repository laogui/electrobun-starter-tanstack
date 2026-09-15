import LabeledEdge from '@/components/canvas/edges/LabeledEdge';
import CardNode from '@/components/canvas/nodes/CardNode';
import FolderExpandedChildNode from '@/components/canvas/nodes/FolderExpandedChildNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';
import {
  CardNodeReadOnly,
  FolderNodeReadOnly,
  GroupNodeReadOnly,
  StickyNodeReadOnly,
  TopicNodeReadOnly,
} from '@/components/canvas/nodes/readOnlyNodes';
import StickyNode from '@/components/canvas/nodes/StickyNode';
import TopicNode from '@/components/canvas/nodes/TopicNode';
import ExtensionNode, {
  ExtensionNodeReadOnly,
} from '@/extensions/ExtensionNode';

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

/** Core React Flow types plus the generic extension host. */
export const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
  folderExpandedChild: FolderExpandedChildNode,
  group: GroupNode,
  sticky: StickyNode,
  topic: TopicNode,
  extension: ExtensionNode,
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
  sticky: StickyNodeReadOnly,
  topic: TopicNodeReadOnly,
  extension: ExtensionNodeReadOnly,
};

export const edgeTypes = {
  labeledEdge: LabeledEdge,
};
