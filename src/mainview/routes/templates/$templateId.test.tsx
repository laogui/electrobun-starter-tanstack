// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so they're available before any import
// ---------------------------------------------------------------------------

const rpcMocks = vi.hoisted(() => ({
  rpcGetTemplate: vi.fn(),
  rpcCreateViewFromTemplate: vi.fn(),
  rpcListTemplates: vi.fn(),
}));

/** The templateId injected into Route.useParams(). */
const templateIdRef = vi.hoisted(() => ({ current: 'kanban' }));

vi.mock('@/lib/rpc', () => ({
  rpcGetTemplate: rpcMocks.rpcGetTemplate,
  rpcCreateViewFromTemplate: rpcMocks.rpcCreateViewFromTemplate,
  rpcListTemplates: rpcMocks.rpcListTemplates,
}));

vi.mock('better-themes', () => ({
  useTheme: () => ({ theme: 'light', systemTheme: 'light' }),
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      views: [{ id: 'default', name: 'Default Canvas' }],
      setViews: vi.fn(),
      setActiveView: vi.fn(),
    }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock('@xyflow/react', () => ({
  Background: () => createElement('div', { 'data-testid': 'rf-bg' }),
  BackgroundVariant: { Dots: 'dots' },
  Controls: () => createElement('div', { 'data-testid': 'rf-controls' }),
  ReactFlow: ({ nodes }: { nodes: unknown[] }) =>
    createElement(
      'div',
      { 'data-testid': 'rf-canvas' },
      `${nodes.length} nodes`
    ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children),
}));

/** Captures the component passed to createFileRoute(...)({component}). */
const capturedComponent = vi.hoisted(() => ({
  current: null as (() => React.ReactElement) | null,
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: () => React.ReactElement }) => {
    capturedComponent.current = opts.component;
    return {
      useParams: () => ({ templateId: templateIdRef.current }),
      options: opts,
    };
  },
  Link: (props: Record<string, unknown>) =>
    createElement('a', { href: props.to as string }, props.children as string),
  useNavigate: () => vi.fn(),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  template_preview_loading: () => 'Loading template…',
  template_preview_error: () => 'Could not load template',
  template_preview_back: () => 'Back to templates',
  template_preview_use: () => 'Use this template',
  template_preview_creating: () => 'Creating…',
}));

// ---------------------------------------------------------------------------
// Import to trigger side effects (registers the component via createFileRoute)
// ---------------------------------------------------------------------------

await import('./$templateId');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPreview(templateId = 'kanban') {
  templateIdRef.current = templateId;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Component = capturedComponent.current;
  if (!Component) {
    throw new Error(
      'Component not captured — import did not trigger createFileRoute'
    );
  }
  return render(
    createElement(QueryClientProvider, { client: qc }, createElement(Component))
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplatePreviewRoute', () => {
  it('shows loading state while fetching', () => {
    rpcMocks.rpcGetTemplate.mockReturnValue(new Promise(() => {}));

    renderPreview();

    expect(screen.getByText('Loading template…')).toBeInTheDocument();
  });

  it('shows error state when template fetch fails', async () => {
    rpcMocks.rpcGetTemplate.mockResolvedValue(null);

    renderPreview('nonexistent');

    await waitFor(() => {
      expect(screen.getByText('Could not load template')).toBeInTheDocument();
    });

    expect(screen.getByText('Back to templates')).toBeInTheDocument();
  });

  it('renders the read-only canvas when template loads successfully', async () => {
    rpcMocks.rpcGetTemplate.mockResolvedValue({
      meta: {
        id: 'kanban',
        name: 'Kanban Board',
        description: 'A simple kanban',
        category: 'planning',
        tags: ['kanban'],
        thumbnail: '',
      },
      nodes: [
        { id: 'n1', type: 'card', position: { x: 0, y: 0 }, data: {} },
        { id: 'n2', type: 'sticky', position: { x: 100, y: 0 }, data: {} },
      ],
      edges: [],
    });

    renderPreview();

    await waitFor(() => {
      expect(screen.getByText('Kanban Board')).toBeInTheDocument();
    });

    expect(screen.getByText('Use this template')).toBeInTheDocument();
    expect(screen.getByText('2 nodes')).toBeInTheDocument();
  });
});
