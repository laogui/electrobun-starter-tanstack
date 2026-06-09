// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LinkNode, { LinkContent } from './LinkNode';

const OPEN_LINK_RE = /open link/i;

interface MockUnfurlResult {
  status: 'failed' | 'ready';
  title?: string;
  url: string;
}

const canvasStoreMocks = vi.hoisted(() => ({
  saveSnapshot: vi.fn(),
  updateNodeData: vi.fn(),
}));

const rpcMocks = vi.hoisted(() => ({
  rpcUnfurlLink: vi.fn(async (): Promise<MockUnfurlResult | null> => null),
}));

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
}));

vi.mock('@/contexts/ZoomLevelContext', () => ({
  useIsZoomedOut: () => false,
}));

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      saveSnapshot: () => void;
      updateNodeData: (id: string, updates: Record<string, unknown>) => void;
    }) => unknown
  ) => selector(canvasStoreMocks),
}));

vi.mock('@/components/card/useNodeTagEditing', () => ({
  useNodeTagEditing: () => ({
    dimmedByFilter: false,
    tag: undefined,
    tagColor: undefined,
    tagEditor: null,
    tags: [],
  }),
}));

vi.mock('@/lib/rpc', () => ({
  rpcUnfurlLink: rpcMocks.rpcUnfurlLink,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

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

  it('commits a normalized URL from focused edit mode', () => {
    const onUrlChange = vi.fn();
    render(
      <LinkContent
        data={{
          color: '#ffffff',
          title: 'Example docs',
          url: 'https://example.com/docs',
        }}
        isFocused
        onUrlChange={onUrlChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'example.org/new' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save URL' }));

    expect(onUrlChange).toHaveBeenCalledWith('https://example.org/new');
  });

  it('shows a read-only focused URL when no change handler is available', () => {
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

    expect(screen.queryByLabelText('Link URL')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save URL' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('https://example.com/docs')).not.toHaveLength(0);
  });

  it('provides a title for the truncated focused URL', () => {
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

    expect(
      screen
        .getAllByText('https://example.com/docs')
        .some(
          (element) =>
            element.getAttribute('title') === 'https://example.com/docs'
        )
    ).toBe(true);
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

  it('waits until the node is visible before fetching link preview metadata', async () => {
    let observerCallback:
      | ((
          entries: Array<{ intersectionRatio: number; isIntersecting: boolean }>
        ) => void)
      | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();

    class MockIntersectionObserver {
      constructor(
        callback: (
          entries: Array<{
            intersectionRatio: number;
            isIntersecting: boolean;
          }>
        ) => void
      ) {
        observerCallback = callback;
      }

      disconnect = disconnect;
      observe = observe;
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    rpcMocks.rpcUnfurlLink.mockResolvedValueOnce({
      status: 'ready',
      title: 'Fetched title',
      url: 'https://example.com/',
    });

    render(
      <LinkNode
        data={{
          color: '#ffffff',
          title: '',
          url: 'https://example.com/',
        }}
        id="link-1"
      />
    );

    expect(observe).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpcUnfurlLink).not.toHaveBeenCalled();

    act(() => {
      observerCallback?.([{ intersectionRatio: 0.5, isIntersecting: true }]);
    });

    await waitFor(() => {
      expect(rpcMocks.rpcUnfurlLink).toHaveBeenCalledWith(
        'https://example.com/'
      );
      expect(canvasStoreMocks.updateNodeData).toHaveBeenCalledWith('link-1', {
        unfurlStatus: 'loading',
      });
      expect(canvasStoreMocks.updateNodeData).toHaveBeenCalledWith('link-1', {
        title: 'Fetched title',
        unfurlError: undefined,
        unfurlStatus: 'ready',
      });
    });
  });

  it('applies the preview result even after re-rendering with the loading status', async () => {
    let observerCallback:
      | ((
          entries: Array<{ intersectionRatio: number; isIntersecting: boolean }>
        ) => void)
      | undefined;

    class MockIntersectionObserver {
      constructor(
        callback: (
          entries: Array<{
            intersectionRatio: number;
            isIntersecting: boolean;
          }>
        ) => void
      ) {
        observerCallback = callback;
      }

      disconnect = vi.fn();
      observe = vi.fn();
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    // Defer the rpc resolution so we can re-render the node with the
    // 'loading' status (mirroring the real store update) before the request
    // settles. This reproduces the effect re-run that previously cancelled the
    // in-flight request and left the node stuck on "Loading preview...".
    let resolveUnfurl: ((value: MockUnfurlResult) => void) | undefined;
    rpcMocks.rpcUnfurlLink.mockReturnValueOnce(
      new Promise<MockUnfurlResult>((resolve) => {
        resolveUnfurl = resolve;
      })
    );

    const { rerender } = render(
      <LinkNode
        data={{
          color: '#ffffff',
          title: '',
          url: 'https://example.com/',
        }}
        id="link-1"
      />
    );

    act(() => {
      observerCallback?.([{ intersectionRatio: 0.5, isIntersecting: true }]);
    });

    await waitFor(() => {
      expect(canvasStoreMocks.updateNodeData).toHaveBeenCalledWith('link-1', {
        unfurlStatus: 'loading',
      });
    });

    // Simulate the store re-rendering the node with the loading status, which
    // re-runs the unfurl effect.
    rerender(
      <LinkNode
        data={{
          color: '#ffffff',
          title: '',
          unfurlStatus: 'loading',
          url: 'https://example.com/',
        }}
        id="link-1"
      />
    );

    await act(async () => {
      resolveUnfurl?.({
        status: 'ready',
        title: 'Fetched title',
        url: 'https://example.com/',
      });
    });

    await waitFor(() => {
      expect(canvasStoreMocks.updateNodeData).toHaveBeenCalledWith('link-1', {
        title: 'Fetched title',
        unfurlError: undefined,
        unfurlStatus: 'ready',
      });
    });

    expect(rpcMocks.rpcUnfurlLink).toHaveBeenCalledTimes(1);
  });
});
