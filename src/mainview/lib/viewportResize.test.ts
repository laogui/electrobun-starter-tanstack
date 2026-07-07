import { describe, expect, it } from 'vitest';

import { anchorViewportToCenter, viewportSizesEqual } from './viewportResize';

describe('viewportSizesEqual', () => {
  it('treats sub-pixel differences as equal', () => {
    expect(
      viewportSizesEqual(
        { width: 800, height: 600 },
        { width: 800.2, height: 599.8 }
      )
    ).toBe(true);
  });

  it('detects meaningful size changes', () => {
    expect(
      viewportSizesEqual(
        { width: 800, height: 600 },
        { width: 820, height: 600 }
      )
    ).toBe(false);
  });
});

describe('anchorViewportToCenter', () => {
  it('keeps zoom unchanged', () => {
    const result = anchorViewportToCenter(
      { x: 0, y: 0, zoom: 1.5 },
      { width: 800, height: 600 },
      { width: 1000, height: 600 }
    );

    expect(result.zoom).toBe(1.5);
  });

  it('keeps the previous screen-center flow point on the new screen center', () => {
    const viewport = { x: 100, y: 50, zoom: 2 };
    const prev = { width: 800, height: 600 };
    const next = { width: 1200, height: 600 };

    const result = anchorViewportToCenter(viewport, prev, next);

    const flowX = (prev.width / 2 - viewport.x) / viewport.zoom;
    const flowY = (prev.height / 2 - viewport.y) / viewport.zoom;

    expect(result.x).toBeCloseTo(next.width / 2 - flowX * viewport.zoom);
    expect(result.y).toBeCloseTo(next.height / 2 - flowY * viewport.zoom);
  });

  it('returns the same offsets when only height changes', () => {
    const viewport = { x: 40, y: 80, zoom: 1 };
    const prev = { width: 1000, height: 800 };
    const next = { width: 1000, height: 500 };

    const result = anchorViewportToCenter(viewport, prev, next);

    expect(result.x).toBe(viewport.x);
    expect(result.y).toBe(80 + (500 - 800) / 2);
    expect(result.zoom).toBe(1);
  });

  it('scales zoom with the pane resize when scaleZoom is enabled', () => {
    const viewport = { x: 100, y: 50, zoom: 2 };
    const prev = { width: 800, height: 600 };
    const next = { width: 1200, height: 600 };

    const result = anchorViewportToCenter(viewport, prev, next, {
      scaleZoom: true,
    });

    expect(result.zoom).toBeCloseTo(2 * Math.sqrt(1.5));

    const flowX = (prev.width / 2 - viewport.x) / viewport.zoom;
    const flowY = (prev.height / 2 - viewport.y) / viewport.zoom;

    expect(result.x).toBeCloseTo(next.width / 2 - flowX * result.zoom);
    expect(result.y).toBeCloseTo(next.height / 2 - flowY * result.zoom);
  });
});
