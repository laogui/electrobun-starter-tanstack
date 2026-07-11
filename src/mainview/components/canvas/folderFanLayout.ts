export type FolderFanDirection = 'down' | 'up';

export interface FolderFanSlot {
  height: number;
  left: number;
  top: number;
  width: number;
  zIndex: number;
}

export interface FolderFanLayout {
  cardHeight: number;
  cardWidth: number;
  direction: FolderFanDirection;
  slots: FolderFanSlot[];
}

interface CalculateFolderFanLayoutOptions {
  folderRect: Pick<
    DOMRect,
    'bottom' | 'height' | 'left' | 'right' | 'top' | 'width'
  >;
  slotCount: number;
  viewport: { height: number; width: number };
}

const SAFE_MARGIN = 24;
const MIN_CARD_WIDTH = 56;
const MAX_CARD_WIDTH = 104;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function calculateFolderFanLayout({
  folderRect,
  slotCount,
  viewport,
}: CalculateFolderFanLayoutOptions): FolderFanLayout {
  const safeSlotCount = Math.max(0, slotCount);
  const naturalCardWidth = clamp(folderRect.width * 0.58, 72, MAX_CARD_WIDTH);
  const minimumGap = 8;
  const availableWidth = viewport.width - SAFE_MARGIN * 2;
  const widthThatFits =
    safeSlotCount > 0
      ? (availableWidth - minimumGap * (safeSlotCount - 1)) / safeSlotCount
      : naturalCardWidth;
  const cardWidth = Math.round(
    clamp(
      Math.min(naturalCardWidth, widthThatFits),
      MIN_CARD_WIDTH,
      MAX_CARD_WIDTH
    )
  );
  const cardHeight = Math.round(cardWidth * 1.28);
  const gap = clamp(cardWidth * 0.12, minimumGap, 14);
  const direction: FolderFanDirection =
    folderRect.top >= cardHeight + 42 ? 'up' : 'down';

  if (safeSlotCount === 0) {
    return { cardHeight, cardWidth, direction, slots: [] };
  }

  const totalWidth = safeSlotCount * cardWidth + (safeSlotCount - 1) * gap;
  const folderCenterX = folderRect.left + folderRect.width / 2;
  const unclampedLeft = folderCenterX - totalWidth / 2;
  const startLeft = clamp(
    unclampedLeft,
    SAFE_MARGIN,
    viewport.width - SAFE_MARGIN - totalWidth
  );
  const centerIndex = (safeSlotCount - 1) / 2;
  const arcStep = clamp(cardHeight * 0.055, 4, 7);
  const maxArcOffset = Math.abs(centerIndex) * arcStep;
  const rowTop =
    direction === 'up'
      ? folderRect.top - cardHeight - 18
      : folderRect.bottom + 18;

  const slots = Array.from({ length: safeSlotCount }, (_, index) => {
    const arcOffset = Math.abs(index - centerIndex) * arcStep;
    const top =
      direction === 'up'
        ? rowTop + arcOffset
        : rowTop + maxArcOffset - arcOffset;
    return {
      height: cardHeight,
      left: startLeft + index * (cardWidth + gap),
      top: clamp(top, SAFE_MARGIN, viewport.height - SAFE_MARGIN - cardHeight),
      width: cardWidth,
      zIndex: 20 + Math.round(safeSlotCount - Math.abs(index - centerIndex)),
    };
  });

  return { cardHeight, cardWidth, direction, slots };
}
