import CardNode from '@/components/canvas/nodes/CardNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';

export const CARD_W = 350;
export const CARD_H = 450;
export const FOLDER_W = 350;
export const FOLDER_H = 350;

export const GROUP_COLORS = ['blue', 'green', 'yellow', 'pink', 'orange'] as const;

export const CARD_COLORS = [
  'bg-white',
  'bg-[#FDF2F8]',
  'bg-[#EAF2B8]',
  'bg-[#DBEAFE]',
  'bg-[#FEF3C7]',
  'bg-[#E0E7FF]',
] as const;

export const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
  group: GroupNode,
};
