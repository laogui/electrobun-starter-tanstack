// @vitest-environment jsdom

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

const createHashHistoryMock = vi.fn(() => ({ type: 'hash-history' }));
const createRouterMock = vi.fn((options) => options);

vi.mock('@tanstack/react-router', () => ({
  createHashHistory: createHashHistoryMock,
  createRouter: createRouterMock,
}));

vi.mock('@/components/layout/ErrorBoundaryFallback', () => ({
  ErrorBoundaryFallback: () => <div>Error fallback</div>,
}));

vi.mock('@/components/layout/Loader', () => ({
  Loader: () => <div>Loading route...</div>,
}));

vi.mock('./routeTree.gen', () => ({
  routeTree: { id: 'route-tree' },
}));

describe('router', () => {
  it('uses hash history outside http(s) protocols', async () => {
    vi.stubGlobal('location', { protocol: 'tauri:' });
    vi.resetModules();

    const module = await import('./router');

    expect(createHashHistoryMock).toHaveBeenCalledTimes(1);
    expect(module.router.history).toEqual({ type: 'hash-history' });
  });

  it('omits hash history for http protocol and wraps children in QueryClientProvider', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    vi.resetModules();

    const module = (await import('./router')) as unknown as {
      router: {
        Wrap: React.ComponentType<{ children: React.ReactNode }>;
        defaultPendingComponent: React.ComponentType;
        defaultNotFoundComponent: React.ComponentType;
        defaultErrorComponent: React.ComponentType;
        history?: unknown;
      };
    };
    const Wrap = module.router.Wrap;

    render(
      <Wrap>
        <div>Child content</div>
      </Wrap>
    );

    expect(createHashHistoryMock).not.toHaveBeenCalled();
    expect(module.router.history).toBeUndefined();
    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(QueryClientProvider).toBeDefined();
  });

  it('exposes default pending, error, and not found components', async () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    vi.resetModules();

    const module = (await import('./router')) as unknown as {
      router: {
        defaultPendingComponent: React.ComponentType;
        defaultNotFoundComponent: React.ComponentType;
        defaultErrorComponent: React.ComponentType;
      };
    };
    const Pending = module.router.defaultPendingComponent;
    const NotFound = module.router.defaultNotFoundComponent;

    render(
      <>
        <Pending />
        <NotFound />
      </>
    );

    expect(screen.getByText('Loading route...')).toBeInTheDocument();
    expect(screen.getByText('Not Found')).toBeInTheDocument();
    expect(module.router.defaultErrorComponent).toBeDefined();
  });
});
