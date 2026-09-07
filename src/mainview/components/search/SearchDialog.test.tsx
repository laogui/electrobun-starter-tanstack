// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '@/lib/searchTypes';
import { useCanvasStore } from '@/store/canvasStore';

const searchState = vi.hoisted(() => ({
  current: {
    query: '',
    setQuery: vi.fn(),
    results: [] as SearchResult[],
    isLoading: false,
    error: null as string | null,
    fallback: false,
  },
}));

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => searchState.current,
}));

const rpcMocks = vi.hoisted(() => ({
  isRpcAvailable: vi.fn().mockResolvedValue(true),
  rpcSaveManifest: vi.fn().mockResolvedValue({ success: true }),
  rpcSetActiveView: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  rpcSaveManifest: rpcMocks.rpcSaveManifest,
  rpcSetActiveView: rpcMocks.rpcSetActiveView,
}));

vi.mock('../../../paraglide/messages.js', () => ({
  search_dialog_placeholder: () => 'Localized search placeholder',
  search_no_matches: () => 'Localized no matches',
  search_recent_title: () => 'Recent searches',
  search_recent_clear: () => 'Clear',
  search_filter_all: () => 'All',
  search_filter_notes: () => 'Notes',
  search_filter_folders: () => 'Folders',
  search_filter_links: () => 'Links',
  search_filter_images: () => 'Images',
  search_recent_cards: () => 'Recent cards',
  search_jump_to_canvas: () => 'Jump to canvas',
  search_tip_navigate: () => 'Navigate',
  search_tip_select: () => 'Select',
  search_tip_create: () => 'New card',
  search_group_collapse: () => 'Collapse group',
  search_group_expand: () => 'Expand group',
  toast_view_switch_save_failed: () => 'Failed to switch view',
}));

import { SearchDialog } from './SearchDialog';

const SEARCH_FAILED_RE = /Search failed: boom/;
const OFFLINE_FALLBACK_RE = /Searching current canvas only/i;

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'node:default:n1:title',
    kind: 'note',
    viewId: 'default',
    viewName: 'Default Canvas',
    nodeId: 'n1',
    title: 'Hello world',
    excerpt: 'Hello world body',
    matchField: 'title',
    score: 100,
    position: { x: 100, y: 50 },
    ...overrides,
  };
}

function setSearch(partial: Partial<typeof searchState.current>) {
  searchState.current = { ...searchState.current, ...partial };
}

function getResultButtons(): HTMLButtonElement[] {
  return Array.from(
    screen
      .getByTestId('search-results')
      .querySelectorAll<HTMLButtonElement>('[data-result-index]')
  );
}

function activeResult(index: number): HTMLButtonElement {
  return getResultButtons()[index]!;
}

function buildRfInstance() {
  const setCenter = vi.fn();
  return {
    setCenter,
    ref: {
      current: {
        getViewport: () => ({ zoom: 1, x: 0, y: 0 }),
        getNodes: () => [
          {
            id: 'n1',
            position: { x: 100, y: 50 },
            measured: { width: 200, height: 100 },
          },
        ],
        getEdges: () => [],
        setCenter,
      },
    } as any,
  };
}

function buildRfInstanceWithEdge() {
  const setCenter = vi.fn();
  return {
    setCenter,
    ref: {
      current: {
        getViewport: () => ({ zoom: 1, x: 0, y: 0 }),
        getNodes: () => [
          {
            id: 'n1',
            position: { x: 0, y: 0 },
            measured: { width: 100, height: 100 },
          },
          {
            id: 'n2',
            position: { x: 200, y: 100 },
            measured: { width: 100, height: 100 },
          },
        ],
        getEdges: () => [{ id: 'e1', source: 'n1', target: 'n2' }],
        setCenter,
      },
    } as any,
  };
}

beforeEach(() => {
  // Search history persists to localStorage; clear it so recorded queries from
  // one test don't leak navigable history rows into the next.
  window.localStorage.clear();
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    activeViewId: 'default',
    views: [
      { id: 'default', name: 'Default Canvas' },
      { id: 'other', name: 'Other Canvas' },
    ],
    nodes: [],
    edges: [],
    searchOpen: true,
    pendingSearchTarget: null,
    _hydrated: true,
  });
  rpcMocks.isRpcAvailable.mockReset().mockResolvedValue(true);
  rpcMocks.rpcSaveManifest.mockReset().mockResolvedValue({ success: true });
  rpcMocks.rpcSetActiveView.mockReset().mockResolvedValue({ success: true });
  searchState.current = {
    query: '',
    setQuery: vi.fn(),
    results: [],
    isLoading: false,
    error: null,
    fallback: false,
  };
});

describe('searchDialog', () => {
  it('renders nothing when searchOpen is false', () => {
    useCanvasStore.setState({ searchOpen: false });
    render(<SearchDialog />);
    expect(screen.queryByLabelText('Search query')).not.toBeInTheDocument();
  });

  it('renders the search input and listbox when open', () => {
    render(<SearchDialog />);
    expect(screen.getByLabelText('Search query')).toHaveAttribute(
      'placeholder',
      'Localized search placeholder'
    );
    expect(screen.getByTestId('search-results')).toBeInTheDocument();
  });

  it('reads legacy unversioned search history', () => {
    window.localStorage.setItem(
      ['ghostboard', 'search-history'].join(':'),
      JSON.stringify(['legacy query'])
    );

    render(<SearchDialog />);

    expect(screen.getByText('legacy query')).toBeInTheDocument();
  });

  it('shows the loading indicator when isLoading is true', () => {
    setSearch({ query: 'foo', isLoading: true });
    render(<SearchDialog />);
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('renders the empty state when the query has no matches', () => {
    setSearch({ query: 'nothing', results: [] });
    render(<SearchDialog />);
    expect(screen.getByText('Localized no matches')).toBeInTheDocument();
  });

  it('shows the result count for non-empty searches', () => {
    setSearch({
      query: 'hello',
      results: [
        makeResult({ id: 'r1', title: 'First' }),
        makeResult({ id: 'r2', title: 'Second', nodeId: 'n2' }),
      ],
    });
    render(<SearchDialog />);

    expect(screen.getByText('2 results for "hello"')).toBeInTheDocument();
  });

  it('renders an error message when the search hook reports an error', () => {
    setSearch({ query: 'foo', error: 'boom' });
    render(<SearchDialog />);
    expect(screen.getByText(SEARCH_FAILED_RE)).toBeInTheDocument();
  });

  it('renders the offline fallback banner when fallback is true', () => {
    setSearch({ query: 'foo', fallback: true });
    render(<SearchDialog />);
    expect(screen.getByText(OFFLINE_FALLBACK_RE)).toBeInTheDocument();
  });
});

describe('searchDialog interactions', () => {
  it('moves the active row with ArrowDown / ArrowUp', () => {
    setSearch({
      query: 'h',
      results: [
        makeResult({ id: 'r1', title: 'First' }),
        makeResult({ id: 'r2', title: 'Second', nodeId: 'n2' }),
      ],
    });
    render(<SearchDialog />);
    const input = screen.getByLabelText('Search query');
    expect(activeResult(0)).toHaveClass('bg-accent-softer');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeResult(1)).toHaveClass('bg-accent-softer');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(activeResult(0)).toHaveClass('bg-accent-softer');
  });

  it('resets active selection when results change', async () => {
    const { ref, setCenter } = buildRfInstance();
    useCanvasStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'card',
          position: { x: 100, y: 50 },
          data: {},
        } as any,
      ],
    });
    setSearch({
      query: 'h',
      results: [
        makeResult({ id: 'r1', title: 'First' }),
        makeResult({ id: 'r2', title: 'Second', nodeId: 'n2' }),
      ],
    });
    const { rerender } = render(<SearchDialog rfInstance={ref} />);
    const input = screen.getByLabelText('Search query');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeResult(1)).toHaveClass('bg-accent-softer');

    setSearch({ query: 'first', results: [makeResult({ id: 'r1' })] });
    rerender(<SearchDialog rfInstance={ref} />);
    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Enter' });

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledTimes(1);
    });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('Enter on a same-view result selects the node, locates it, and closes', async () => {
    const { ref, setCenter } = buildRfInstance();
    useCanvasStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'card',
          position: { x: 100, y: 50 },
          data: {},
        } as any,
      ],
    });
    setSearch({ query: 'h', results: [makeResult()] });
    render(<SearchDialog rfInstance={ref} />);
    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Enter' });
    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledTimes(1);
    });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
    expect(
      useCanvasStore.getState().nodes.find((n) => n.id === 'n1')?.selected
    ).toBe(true);
  });

  it('passes a same-view Folder-child target to canvas navigation', async () => {
    setSearch({
      query: 'child',
      results: [
        makeResult({
          id: 'node:default:child-1:title',
          nodeId: 'child-1',
          target: {
            type: 'folder-child',
            viewId: 'default',
            folderId: 'folder-1',
            childId: 'child-1',
            placement: 'folder',
            content: { kind: 'note', id: 'note-child-1' },
          },
        }),
      ],
    });
    render(<SearchDialog />);

    fireEvent.click(activeResult(0));

    await waitFor(() => {
      expect(useCanvasStore.getState().pendingSearchTarget).toEqual({
        viewId: 'default',
        nodeId: 'child-1',
        edgeId: undefined,
        target: {
          type: 'folder-child',
          viewId: 'default',
          folderId: 'folder-1',
          childId: 'child-1',
          placement: 'folder',
          content: { kind: 'note', id: 'note-child-1' },
        },
      });
    });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('clicking a cross-view result saves the manifest, switches view, and sets the pending target', async () => {
    setSearch({
      query: 'h',
      results: [
        makeResult({
          id: 'node:other:n2:title',
          viewId: 'other',
          viewName: 'Other Canvas',
          nodeId: 'n2',
          target: {
            type: 'node',
            viewId: 'other',
            nodeId: 'n2',
            placement: 'top-level',
          },
        }),
      ],
    });
    render(<SearchDialog />);
    fireEvent.click(getResultButtons()[0]!);
    await waitFor(() => {
      expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    });
    expect(useCanvasStore.getState().activeViewId).toBe('other');
    expect(useCanvasStore.getState().pendingSearchTarget).toEqual({
      viewId: 'other',
      nodeId: 'n2',
      edgeId: undefined,
      target: {
        type: 'node',
        viewId: 'other',
        nodeId: 'n2',
        placement: 'top-level',
      },
    });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('does not switch away from unsaved edits when a Folder-child jump cannot flush', async () => {
    rpcMocks.rpcSaveManifest.mockResolvedValueOnce({ success: false });
    setSearch({
      query: 'child',
      results: [
        makeResult({
          id: 'node:other:child-2:title',
          viewId: 'other',
          viewName: 'Other Canvas',
          nodeId: 'child-2',
          target: {
            type: 'folder-child',
            viewId: 'other',
            folderId: 'folder-2',
            childId: 'child-2',
            placement: 'folder',
          },
        }),
      ],
    });
    render(<SearchDialog />);

    fireEvent.click(activeResult(0));

    await waitFor(() => {
      expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
      expect(useCanvasStore.getState().activeViewId).toBe('default');
      expect(useCanvasStore.getState().pendingSearchTarget).toBeNull();
      expect(useCanvasStore.getState().searchOpen).toBe(false);
    });
  });

  it('selecting a view-kind result switches view without setting a pending target', async () => {
    setSearch({
      query: 'other',
      results: [
        makeResult({
          id: 'view:other',
          kind: 'view',
          viewId: 'other',
          viewName: 'Other Canvas',
          nodeId: undefined,
          position: undefined,
          matchField: 'viewName',
        }),
      ],
    });
    render(<SearchDialog />);
    fireEvent.click(getResultButtons()[0]!);
    await waitFor(() => {
      expect(useCanvasStore.getState().activeViewId).toBe('other');
    });
    expect(useCanvasStore.getState().pendingSearchTarget).toBeNull();
  });

  it('Enter on a same-view edge result selects the edge and centers on its midpoint', async () => {
    const { ref, setCenter } = buildRfInstanceWithEdge();
    useCanvasStore.setState({
      edges: [{ id: 'e1', source: 'n1', target: 'n2' } as any],
    });
    setSearch({
      query: 'flow',
      results: [
        makeResult({
          id: 'edge:default:e1:label',
          kind: 'edge',
          nodeId: undefined,
          edgeId: 'e1',
          matchField: 'label',
          position: undefined,
          title: 'flow',
          excerpt: 'flow',
        }),
      ],
    });
    render(<SearchDialog rfInstance={ref} />);
    fireEvent.keyDown(screen.getByLabelText('Search query'), { key: 'Enter' });
    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledTimes(1);
    });
    // Midpoint of (50, 50) and (250, 150) = (150, 100)
    expect(setCenter).toHaveBeenCalledWith(150, 100, expect.any(Object));
    expect(
      useCanvasStore.getState().edges.find((e) => e.id === 'e1')?.selected
    ).toBe(true);
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('highlights the query term inside result rows (E1)', () => {
    setSearch({
      query: 'tan',
      results: [makeResult({ title: 'tango', excerpt: 'a tan line' })],
    });
    render(<SearchDialog />);
    const option = getResultButtons()[0]!;
    const marks = option.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThanOrEqual(2);
    expect(
      [...marks].every((mark) => mark.textContent?.toLowerCase() === 'tan')
    ).toBe(true);
  });

  it('groups results by canvas and collapses a group header (E2)', () => {
    setSearch({
      query: 'h',
      results: [
        makeResult({ id: 'r1', title: 'First' }),
        makeResult({
          id: 'node:other:n2:title',
          viewId: 'other',
          viewName: 'Other Canvas',
          nodeId: 'n2',
          title: 'Second',
        }),
      ],
    });
    render(<SearchDialog />);
    // Two group headers, one per canvas.
    const collapseButtons = screen.getAllByLabelText('Collapse group');
    expect(collapseButtons).toHaveLength(2);
    expect(getResultButtons()).toHaveLength(2);

    // Collapsing the first canvas hides its row.
    fireEvent.click(collapseButtons[0]!);
    expect(getResultButtons()).toHaveLength(1);
    expect(screen.getByLabelText('Expand group')).toBeInTheDocument();
  });

  it('skips collapsed rows during keyboard navigation (E2)', () => {
    setSearch({
      query: 'h',
      results: [
        makeResult({ id: 'r1', title: 'First' }),
        makeResult({
          id: 'node:other:n2:title',
          viewId: 'other',
          viewName: 'Other Canvas',
          nodeId: 'n2',
          title: 'Second',
        }),
      ],
    });
    render(<SearchDialog />);
    fireEvent.click(screen.getAllByLabelText('Collapse group')[0]!);
    // Only the Other Canvas row remains and becomes the active option.
    const options = getResultButtons();
    expect(options).toHaveLength(1);
    expect(activeResult(0)).toHaveClass('bg-accent-softer');
  });

  it('shows recent cards and canvases in the empty state (E3)', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { title: 'Recent Card', updatedAt: 100 },
        } as any,
      ],
    });
    setSearch({ query: '' });
    render(<SearchDialog />);
    expect(screen.getByText('Recent cards')).toBeInTheDocument();
    expect(screen.getByText('Recent Card')).toBeInTheDocument();
    expect(screen.getByText('Jump to canvas')).toBeInTheDocument();
    // The non-active canvas is offered as a jump target.
    expect(screen.getByText('Other Canvas')).toBeInTheDocument();
  });

  it('jumps to a canvas from the empty state (E3)', async () => {
    setSearch({ query: '' });
    render(<SearchDialog />);
    fireEvent.click(screen.getByText('Other Canvas'));
    await waitFor(() => {
      expect(useCanvasStore.getState().activeViewId).toBe('other');
    });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('navigates empty-state rows with the keyboard and activates on Enter', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'n1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { title: 'Recent Card', updatedAt: 100 },
        } as any,
      ],
    });
    setSearch({ query: '' });
    render(<SearchDialog />);

    // Recent card first, then the "Other Canvas" jump target.
    const options = getResultButtons();
    expect(options).toHaveLength(2);
    expect(activeResult(0)).toHaveClass('bg-accent-softer');

    const input = screen.getByLabelText('Search query');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeResult(1)).toHaveClass('bg-accent-softer');

    // Enter on the canvas row switches view and closes the dialog.
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(useCanvasStore.getState().activeViewId).toBe('other');
    });
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('opens the create menu and closes search on Cmd/Ctrl+N', () => {
    setSearch({ query: '' });
    render(<SearchDialog />);
    expect(useCanvasStore.getState().createMenuOpen).toBe(false);

    fireEvent.keyDown(screen.getByLabelText('Search query'), {
      key: 'n',
      metaKey: true,
    });

    expect(useCanvasStore.getState().createMenuOpen).toBe(true);
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('clicking a cross-view edge result writes the pending target with edgeId', async () => {
    setSearch({
      query: 'flow',
      results: [
        makeResult({
          id: 'edge:other:e9:label',
          kind: 'edge',
          viewId: 'other',
          viewName: 'Other Canvas',
          nodeId: undefined,
          edgeId: 'e9',
          matchField: 'label',
          position: undefined,
          title: 'flow',
          excerpt: 'flow',
        }),
      ],
    });
    render(<SearchDialog />);
    fireEvent.click(getResultButtons()[0]!);
    await waitFor(() => {
      expect(useCanvasStore.getState().activeViewId).toBe('other');
    });
    expect(useCanvasStore.getState().pendingSearchTarget).toEqual({
      viewId: 'other',
      nodeId: undefined,
      edgeId: 'e9',
    });
  });
});
