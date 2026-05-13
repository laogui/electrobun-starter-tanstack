// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LinkNode, { LinkContent } from './LinkNode';

const OPEN_LINK_RE = /open link/i;

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div data-testid={`handle-${id}`} />,
  NodeResizeControl: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  useViewport: () => ({ zoom: 1 }),
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      saveSnapshot: () => void;
      updateNodeData: (id: string, updates: Record<string, unknown>) => void;
    }) => unknown
  ) => selector({ saveSnapshot: vi.fn(), updateNodeData: vi.fn() }),
}));

vi.mock('@/lib/rpc', () => ({
  rpcUnfurlLink: vi.fn(async () => null),
}));

describe('LinkContent', () => {
  it('renders host fallback when no title is available', () => {
    render(
      <LinkContent
        data={{
          color: '#ffffff',
          title: '',
          url: 'https://www.example.com/docs',
        }}
      />
    );

    expect(screen.getAllByText('example.com')).toHaveLength(2);
    expect(screen.getByText('Link')).toBeInTheDocument();
  });

  it('renders a safe focused open link', () => {
    render(
      <LinkContent
        data={{
          color: '#ffffff',
          title: 'Example docs',
          url: 'https://example.com/docs',
        }}
        isFocused
      />
    );

    const link = screen.getByRole('link', { name: OPEN_LINK_RE });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('LinkNode', () => {
  it('renders link content with connection handles', () => {
    render(
      <LinkNode
        data={{
          color: '#ffffff',
          title: 'Example',
          url: 'https://example.com/',
        }}
        id="link-1"
      />
    );

    expect(screen.getByText('Example')).toBeInTheDocument();
    expect(screen.getByTestId('handle-top')).toBeInTheDocument();
    expect(screen.getByTestId('handle-right')).toBeInTheDocument();
    expect(screen.getByTestId('handle-bottom')).toBeInTheDocument();
    expect(screen.getByTestId('handle-left')).toBeInTheDocument();
  });
});
