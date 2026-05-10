// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

const rpcMocks = vi.hoisted(() => ({
  rpcListTemplates: vi.fn(),
  rpcGetTemplate: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcListTemplates: rpcMocks.rpcListTemplates,
  rpcGetTemplate: rpcMocks.rpcGetTemplate,
}));

import { useTemplate, useTemplates } from './useTemplates';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc, children });
}

describe('useTemplates', () => {
  it('returns the template list from rpcListTemplates', async () => {
    const templates = [
      {
        id: 'kanban',
        name: 'Kanban Board',
        description: 'A kanban board',
        category: 'planning',
        tags: ['kanban'],
        thumbnail: '',
      },
    ];
    rpcMocks.rpcListTemplates.mockResolvedValue(templates);

    const { result } = renderHook(() => useTemplates(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(templates);
  });

  it('returns empty array when rpc returns null', async () => {
    rpcMocks.rpcListTemplates.mockResolvedValue(null);

    const { result } = renderHook(() => useTemplates(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });
});

describe('useTemplate', () => {
  it('fetches a single template by id', async () => {
    const tpl = {
      meta: {
        id: 'kanban',
        name: 'Kanban',
        description: '',
        category: 'planning',
        tags: [],
        thumbnail: '',
      },
      nodes: [],
      edges: [],
    };
    rpcMocks.rpcGetTemplate.mockResolvedValue(tpl);

    const { result } = renderHook(() => useTemplate('kanban'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(tpl);
    expect(rpcMocks.rpcGetTemplate).toHaveBeenCalledWith('kanban');
  });

  it('throws when template is not found', async () => {
    rpcMocks.rpcGetTemplate.mockResolvedValue(null);

    const { result } = renderHook(() => useTemplate('nonexistent'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('nonexistent');
  });
});
