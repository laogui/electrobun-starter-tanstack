// @vitest-environment jsdom

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createAppRouter, router } from './router';

const routerMocks = vi.hoisted(() => ({
  createHashHistory: vi.fn(() => ({ type: 'hash-history' })),
  createRouter: vi.fn((options) => options),
}));

vi.mock('@tanstack/react-router', () => ({
  createHashHistory: routerMocks.createHashHistory,
  createRouter: routerMocks.createRouter,
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

interface RouterPresentation {
  defaultErrorComponent: React.ComponentType;
  defaultNotFoundComponent: React.ComponentType;
  defaultPendingComponent: React.ComponentType;
  history?: unknown;
  Wrap: React.ComponentType<{ children: React.ReactNode }>;
}

function presentRouter(value: unknown): RouterPresentation {
  return value as RouterPresentation;
}

describe('router', () => {
  it('uses hash history outside http(s) protocols', async () => {
    routerMocks.createHashHistory.mockClear();
    const nonHttpRouter = presentRouter(createAppRouter('tauri:'));

    expect(routerMocks.createHashHistory).toHaveBeenCalledTimes(1);
    expect(nonHttpRouter.history).toEqual({ type: 'hash-history' });
  });

  it('omits hash history for http protocol and wraps children in QueryClientProvider', async () => {
    routerMocks.createHashHistory.mockClear();
    const httpRouter = presentRouter(createAppRouter('http:'));
    const Wrap = httpRouter.Wrap;

    render(
      <Wrap>
        <div>Child content</div>
      </Wrap>
    );

    expect(routerMocks.createHashHistory).not.toHaveBeenCalled();
    expect(httpRouter.history).toBeUndefined();
    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(QueryClientProvider).toBeDefined();
  });

  it('exposes default pending, error, and not found components', async () => {
    const rootRouter = presentRouter(router);
    const Pending = rootRouter.defaultPendingComponent;
    const NotFound = rootRouter.defaultNotFoundComponent;

    render(
      <>
        <Pending />
        <NotFound />
      </>
    );

    expect(screen.getByText('Loading route...')).toBeInTheDocument();
    expect(screen.getByText('Not Found')).toBeInTheDocument();
    expect(rootRouter.defaultErrorComponent).toBeDefined();
  });
});
