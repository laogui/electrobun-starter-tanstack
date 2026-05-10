// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const rpcMocks = vi.hoisted(() => ({
  rpcListTemplates: vi.fn(),
  rpcGetTemplate: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpcListTemplates: rpcMocks.rpcListTemplates,
  rpcGetTemplate: rpcMocks.rpcGetTemplate,
}));

vi.mock('../../../paraglide/messages.js', () => ({
  templates_title: () => 'Template Library',
  templates_back: () => 'Back to Canvas',
  templates_search_placeholder: () => 'Search templates…',
  templates_category_all: () => 'All',
  templates_category_planning: () => 'Planning',
  templates_category_thinking: () => 'Thinking',
  templates_category_knowledge: () => 'Knowledge',
  templates_category_blank: () => 'Blank',
  templates_empty: () => 'No templates found',
  templates_empty_search: ({ query }: { query: string }) =>
    `No templates match "${query}"`,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** We import the real component lazily so mocks are registered first. */
const { TemplatesRoute: TemplatesComponent } = await import('./index').then(
  (mod) => ({
    TemplatesRoute: (mod.Route as any).options.component,
  })
);

function renderWithRouter() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const rootRoute = createRootRoute({
    component: () =>
      createElement(
        QueryClientProvider,
        { client: qc },
        createElement(TemplatesComponent)
      ),
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  return render(createElement(RouterProvider, { router }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplatesRoute', () => {
  it('renders the page title and category tabs', async () => {
    rpcMocks.rpcListTemplates.mockResolvedValue([]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Template Library')).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Planning' })).toBeInTheDocument();
  });

  it('shows empty state when no templates exist', async () => {
    rpcMocks.rpcListTemplates.mockResolvedValue([]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('No templates found')).toBeInTheDocument();
    });
  });

  it('renders template cards from the RPC data', async () => {
    rpcMocks.rpcListTemplates.mockResolvedValue([
      {
        id: 'kanban',
        name: 'Kanban Board',
        description: 'A simple kanban board',
        category: 'planning',
        tags: ['kanban', 'project'],
        thumbnail: '',
      },
    ]);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Kanban Board')).toBeInTheDocument();
    });

    expect(screen.getByText('A simple kanban board')).toBeInTheDocument();
    expect(screen.getByText('kanban')).toBeInTheDocument();
    expect(screen.getByText('project')).toBeInTheDocument();
  });
});
