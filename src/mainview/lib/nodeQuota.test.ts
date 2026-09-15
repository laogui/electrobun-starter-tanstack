import type { Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCachedLicenseMock, refreshLicenseMock } = vi.hoisted(() => ({
  getCachedLicenseMock: vi.fn<() => { activated: boolean } | null>(() => null),
  refreshLicenseMock: vi.fn<() => Promise<{ activated: boolean } | null>>(() =>
    Promise.resolve({ activated: false })
  ),
}));

vi.mock('@/lib/rpc-license', () => ({
  getCachedLicense: getCachedLicenseMock,
  refreshLicense: refreshLicenseMock,
}));

vi.mock('../../paraglide/messages.js', () => ({
  toast_node_quota: () => 'Quota reached',
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

import {
  COUNTED_NODE_TYPES,
  countCountedNodes,
  FREE_NODE_LIMIT,
  hasNodeQuota,
} from './nodeQuota';

function card(id: string): Node {
  return {
    data: {},
    id,
    position: { x: 0, y: 0 },
    type: 'card',
  };
}

describe('nodeQuota', () => {
  beforeEach(() => {
    getCachedLicenseMock.mockReset();
    refreshLicenseMock.mockReset();
    getCachedLicenseMock.mockReturnValue(null);
    refreshLicenseMock.mockResolvedValue({ activated: false });
  });

  it('counts card, sticky, and topic together and ignores other types', () => {
    expect(COUNTED_NODE_TYPES.has('folder')).toBe(false);
    expect(
      countCountedNodes([
        card('a'),
        { ...card('b'), type: 'sticky' },
        { ...card('c'), type: 'topic' },
        { ...card('d'), type: 'group' },
      ])
    ).toBe(3);
  });

  it('allows adding counted nodes up to the free limit without a license check', async () => {
    const nodes = Array.from({ length: FREE_NODE_LIMIT - 1 }, (_, index) =>
      card(`n-${index}`)
    );
    await expect(hasNodeQuota(nodes, 1)).resolves.toBe(true);
    expect(refreshLicenseMock).not.toHaveBeenCalled();
  });

  it('blocks an unlicensed batch that would pass the free limit', async () => {
    const nodes = Array.from({ length: FREE_NODE_LIMIT - 1 }, (_, index) =>
      card(`n-${index}`)
    );
    await expect(hasNodeQuota(nodes, 2)).resolves.toBe(false);
    expect(refreshLicenseMock).toHaveBeenCalledTimes(1);
  });

  it('allows a licensed user to exceed the free limit', async () => {
    getCachedLicenseMock.mockReturnValue({ activated: true });
    const nodes = Array.from({ length: FREE_NODE_LIMIT }, (_, index) =>
      card(`n-${index}`)
    );
    await expect(hasNodeQuota(nodes, 3)).resolves.toBe(true);
    expect(refreshLicenseMock).not.toHaveBeenCalled();
  });
});
