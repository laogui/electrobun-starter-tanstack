import { describe, expect, it } from 'vitest';

import { calculateFolderFanLayout } from './folderFanLayout';

const makeRect = (left: number, top: number, width = 180, height = 140) => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
});

describe('calculateFolderFanLayout', () => {
  it('fans upward from a mid-canvas folder and keeps every card on-screen', () => {
    const viewport = { height: 800, width: 1280 };
    const layout = calculateFolderFanLayout({
      folderRect: makeRect(550, 360),
      slotCount: 6,
      viewport,
    });

    expect(layout.direction).toBe('up');
    expect(layout.slots).toHaveLength(6);
    for (const slot of layout.slots) {
      expect(slot.left).toBeGreaterThanOrEqual(24);
      expect(slot.top).toBeGreaterThanOrEqual(24);
      expect(slot.left + slot.width).toBeLessThanOrEqual(viewport.width - 24);
      expect(slot.top + slot.height).toBeLessThanOrEqual(viewport.height - 24);
    }
  });

  it('flips downward when the folder is close to the top edge', () => {
    const layout = calculateFolderFanLayout({
      folderRect: makeRect(500, 32),
      slotCount: 4,
      viewport: { height: 760, width: 1100 },
    });

    expect(layout.direction).toBe('down');
    expect(Math.min(...layout.slots.map((slot) => slot.top))).toBeGreaterThan(
      32
    );
  });

  it('shifts the row inward when the folder is close to a side edge', () => {
    const layout = calculateFolderFanLayout({
      folderRect: makeRect(8, 300, 160, 150),
      slotCount: 5,
      viewport: { height: 700, width: 1000 },
    });

    expect(Math.min(...layout.slots.map((slot) => slot.left))).toBe(24);
    expect(
      Math.max(...layout.slots.map((slot) => slot.left + slot.width))
    ).toBeLessThanOrEqual(976);
  });

  it('returns a stable empty layout', () => {
    const layout = calculateFolderFanLayout({
      folderRect: makeRect(200, 200),
      slotCount: 0,
      viewport: { height: 700, width: 900 },
    });

    expect(layout.slots).toEqual([]);
  });
});
