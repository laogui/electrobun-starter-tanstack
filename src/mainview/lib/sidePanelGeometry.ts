/**
 * Geometry of the card side panel (docs/remediation-plan.md, phase 1). The
 * panel floats over the right edge of the canvas without a backdrop; these
 * helpers keep the card that is open in it visible to its left.
 */

export const SIDE_PANEL_MARGIN = 12;
export const SIDE_PANEL_DEFAULT_WIDTH = 480;
export const SIDE_PANEL_MIN_WIDTH = 360;
export const SIDE_PANEL_MAX_WIDTH = 720;
/** Breathing room kept between a revealed card and the panel / window edge. */
const REVEAL_GAP = 32;
const WIDTH_STORAGE_KEY = 'gb:card-panel-width';

/** The width the user dragged the panel to, or the default. */
export function storedSidePanelWidth(): number {
  try {
    const raw = Number(globalThis.localStorage?.getItem(WIDTH_STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : SIDE_PANEL_DEFAULT_WIDTH;
  } catch {
    return SIDE_PANEL_DEFAULT_WIDTH;
  }
}

export function storeSidePanelWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(
      WIDTH_STORAGE_KEY,
      String(Math.round(width))
    );
  } catch {
    // Storage unavailable: the width just is not remembered.
  }
}

/** Clamp a requested width to 360–720 and to what the window can afford. */
export function clampSidePanelWidth(
  width: number,
  viewportWidth: number
): number {
  const max = Math.min(
    SIDE_PANEL_MAX_WIDTH,
    viewportWidth - SIDE_PANEL_MARGIN * 2
  );
  return Math.round(
    Math.max(Math.min(SIDE_PANEL_MIN_WIDTH, max), Math.min(width, max))
  );
}

export function sidePanelWidth(viewportWidth: number): number {
  return clampSidePanelWidth(storedSidePanelWidth(), viewportWidth);
}

/** Screen x where the panel begins. */
export function sidePanelLeft(viewportWidth: number): number {
  return viewportWidth - sidePanelWidth(viewportWidth) - SIDE_PANEL_MARGIN;
}

interface ScreenRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/**
 * Screen-space shift (dx, dy) that brings `rect` fully into the area left of
 * the panel, or null when it is already there. With `center` the card is
 * centred in that area instead (search and library jumps, where the card may
 * be far away). A card wider or taller than the area is aligned to its
 * top-left so the start of it is readable.
 */
export function revealShift(
  rect: ScreenRect,
  viewport: { height: number; width: number },
  center = false
): { dx: number; dy: number } | null {
  const areaLeft = REVEAL_GAP;
  const areaRight = sidePanelLeft(viewport.width) - REVEAL_GAP;
  const areaTop = REVEAL_GAP;
  const areaBottom = viewport.height - REVEAL_GAP;
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;

  const axis = (
    start: number,
    end: number,
    size: number,
    min: number,
    max: number
  ): number => {
    if (size > max - min) {
      return min - start;
    }
    if (center) {
      return (min + max) / 2 - (start + size / 2);
    }
    if (start < min) {
      return min - start;
    }
    if (end > max) {
      return max - end;
    }
    return 0;
  };

  const dx = axis(rect.left, rect.right, width, areaLeft, areaRight);
  const dy = axis(rect.top, rect.bottom, height, areaTop, areaBottom);
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return null;
  }
  return { dx, dy };
}
