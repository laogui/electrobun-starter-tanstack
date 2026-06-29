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
    createElement(QueryClientProvider, { client: qc }, children);
}

// Use ids that are NOT registered in the TEMPLATE_I18N dictionary so
// fallback to raw `name` / `description` is exercised. Built-in templates
// (kanban, demo, quick-start, ...) get localized via paraglide instead;
// that path is verified separately below.
describe('useTemplates', () => {
  it('returns the template list from rpcListTemplates', async () => {
    const templates = [
      {
        id: 'fake-template',
        name: 'Fake Template',
        description: 'For tests only',
        category: 'planning',
        tags: ['fake'],
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

  it('localizes name and description for built-in templates', async () => {
    // Backend returns whatever lives in meta.json, but the hook should
    // overwrite name + description with the paraglide-resolved strings so
    // the templates browser respects the active locale.
    rpcMocks.rpcListTemplates.mockResolvedValue([
      {
        id: 'quick-start',
        name: 'should-be-overwritten',
        description: 'should-be-overwritten',
        category: 'blank',
        tags: ['onboarding'],
        thumbnail: '',
      },
    ]);

    const { result } = renderHook(() => useTemplates(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const tpl = result.current.data?.[0];
    expect(tpl?.name).not.toBe('should-be-overwritten');
    expect(tpl?.description).not.toBe('should-be-overwritten');
    expect(tpl?.name.length).toBeGreaterThan(0);
    expect(tpl?.description.length).toBeGreaterThan(0);
  });
});

describe('useTemplate', () => {
  it('fetches a single template by id', async () => {
    const tpl = {
      meta: {
        id: 'fake-template',
        name: 'Fake',
        description: '',
        category: 'planning',
        tags: [],
        thumbnail: '',
      },
      nodes: [],
      edges: [],
    };
    rpcMocks.rpcGetTemplate.mockResolvedValue(tpl);

    const { result } = renderHook(() => useTemplate('fake-template'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(tpl);
    expect(rpcMocks.rpcGetTemplate).toHaveBeenCalledWith('fake-template');
  });

  it('localizes meta on a fetched built-in template', async () => {
    rpcMocks.rpcGetTemplate.mockResolvedValue({
      meta: {
        id: 'kanban',
        name: 'should-be-overwritten',
        description: 'should-be-overwritten',
        category: 'planning',
        tags: [],
        thumbnail: '',
      },
      nodes: [],
      edges: [],
    });

    const { result } = renderHook(() => useTemplate('kanban'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const meta = result.current.data?.meta as {
      name: string;
      description: string;
    };
    expect(meta.name).not.toBe('should-be-overwritten');
    expect(meta.description).not.toBe('should-be-overwritten');
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
