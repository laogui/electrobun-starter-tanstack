import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resetViewportPersistSuppression,
  shouldPersistViewport,
  suppressViewportPersist,
} from '@/lib/viewportPersist';

describe('viewportPersist', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetViewportPersistSuppression();
  });

  it('allows persistence by default', () => {
    expect(shouldPersistViewport()).toBe(true);
  });

  it('blocks persistence while suppression is active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    suppressViewportPersist(300);

    expect(shouldPersistViewport()).toBe(false);

    vi.setSystemTime(1299);
    expect(shouldPersistViewport()).toBe(false);

    vi.setSystemTime(1300);
    expect(shouldPersistViewport()).toBe(true);
  });
});
