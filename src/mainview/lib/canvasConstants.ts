import CardNode from '@/components/canvas/nodes/CardNode';
import FolderNode from '@/components/canvas/nodes/FolderNode';
import GroupNode from '@/components/canvas/nodes/GroupNode';
import StickyNode from '@/components/canvas/nodes/StickyNode';

export const CARD_W = 350;
export const CARD_H = 450;
export const FOLDER_W = 350;
export const FOLDER_H = 350;
export const STICKY_W = 200;
export const STICKY_H = 200;

export const GROUP_COLORS = ['blue', 'green', 'yellow', 'pink', 'orange'] as const;

export const CARD_COLORS = [
  'bg-white',
  'bg-[#FDF2F8]',
  'bg-[#EAF2B8]',
  'bg-[#DBEAFE]',
  'bg-[#FEF3C7]',
  'bg-[#E0E7FF]',
] as const;

export const STICKY_COLORS = [
  'bg-[#FEF08A]',
  'bg-[#BBF7D0]',
  'bg-[#FBCFE8]',
  'bg-[#BFDBFE]',
  'bg-[#FED7AA]',
  'bg-[#E9D5FF]',
] as const;

export const nodeTypes = {
  card: CardNode,
  folder: FolderNode,
  group: GroupNode,
  sticky: StickyNode,
};
