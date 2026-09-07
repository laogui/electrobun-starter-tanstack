// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { UNLINKED_REACHABILITY_CASES } from '../../../test/reachabilityMatrix';
import { LibraryPopup } from './LibraryPopup';

const { canvasFocusMock } = vi.hoisted(() => ({
  canvasFocusMock: { openFocusedById: vi.fn(() => Promise.resolve()) },
}));

const { rpcMocks } = vi.hoisted(() => ({
  rpcMocks: { rpcScanUnlinkedNotes: vi.fn() },
}));

vi.mock('@/lib/canvasFocus', () => ({
  openFocusedById: canvasFocusMock.openFocusedById,
}));

vi.mock('@/lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rpc')>()),
  rpcScanUnlinkedNotes: rpcMocks.rpcScanUnlinkedNotes,
}));

vi.mock('sonner', () => ({
  toast: vi.fn(),
}));

function Harness() {
  const ref = useRef(null);
  return <LibraryPopup rfInstance={ref} />;
}

function seedNodes(nodes: Node[]) {
  useCanvasStore.setState({ nodes, _hydrated: true });
}

describe('LibraryPopup', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ libraryOpen: true });
    rpcMocks.rpcScanUnlinkedNotes.mockResolvedValue([]);
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ libraryOpen: false });
    vi.clearAllMocks();
    canvasFocusMock.openFocusedById.mockClear();
    rpcMocks.rpcScanUnlinkedNotes.mockReset();
  });

  it('renders nothing when libraryOpen is false', () => {
    useCanvasStore.setState({ libraryOpen: false });
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no focusable nodes', () => {
    render(<Harness />);
    expect(screen.getByText('Nothing on this canvas yet.')).toBeInTheDocument();
  });

  it('lists ungrouped focusable nodes and filters by search query', () => {
    seedNodes([
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Roadmap' },
      } as unknown as Node,
      {
        id: 'card-2',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Inbox triage' },
      } as unknown as Node,
    ]);
    render(<Harness />);

    // Titles appear twice per card: once in the scaled live preview and once
    // in the footer caption.
    expect(screen.getAllByText('Roadmap').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inbox triage').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Search notes…'), {
      target: { value: 'road' },
    });

    expect(screen.getAllByText('Roadmap').length).toBeGreaterThan(0);
    expect(screen.queryByText('Inbox triage')).not.toBeInTheDocument();
  });

  it('closes via the close button and the backdrop', () => {
    render(<Harness />);
    expect(useCanvasStore.getState().libraryOpen).toBe(true);

    // The header close button has aria-label "Close"; the backdrop button uses
    // the same label. Click the first ("X" icon in header).
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeButtons[0]!);
    expect(useCanvasStore.getState().libraryOpen).toBe(false);
  });

  it('clicking a card item closes the popup and calls openFocusedById', () => {
    seedNodes([
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Roadmap' },
      } as unknown as Node,
    ]);
    render(<Harness />);

    fireEvent.click(screen.getAllByText('Roadmap')[0]!);

    expect(useCanvasStore.getState().libraryOpen).toBe(false);
    expect(canvasFocusMock.openFocusedById).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'card-1' })
    );
  });

  it('clicking a folder child opens the parent folder (option A)', () => {
    seedNodes([
      {
        id: 'folder-1',
        type: 'folder',
        position: { x: 0, y: 0 },
        data: {
          title: 'Project',
          children: [
            { id: 'c1', type: 'card', data: { title: 'Inside child' } },
          ],
        },
      } as unknown as Node,
    ]);
    render(<Harness />);

    fireEvent.click(screen.getAllByText('Inside child')[0]!);

    expect(canvasFocusMock.openFocusedById).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'folder-1' })
    );
  });

  it('shows the total item count in the header (D5)', () => {
    seedNodes([
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'One' },
      } as unknown as Node,
      {
        id: 'card-2',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Two' },
      } as unknown as Node,
    ]);
    render(<Harness />);

    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('renders an image thumbnail and a text excerpt (D1)', () => {
    seedNodes([
      {
        id: 'img-1',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { title: 'Shot', thumbnailUrl: 'data:image/png;base64,AAAA' },
      } as unknown as Node,
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Notes', previewExcerpt: 'A short preview excerpt' },
      } as unknown as Node,
    ]);
    render(<Harness />);

    const thumb = document.querySelector(
      'img[src="data:image/png;base64,AAAA"]'
    );
    expect(thumb).not.toBeNull();
    expect(screen.getByText('A short preview excerpt')).toBeInTheDocument();
  });

  it('navigates with arrow keys and opens the focused card on Enter (D2)', () => {
    seedNodes([
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Alpha', updatedAt: 200 },
      } as unknown as Node,
      {
        id: 'card-2',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Bravo', updatedAt: 100 },
      } as unknown as Node,
    ]);
    render(<Harness />);

    const dialog = screen.getByRole('dialog');
    // First ArrowDown selects index 0, second selects index 1.
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });

    expect(useCanvasStore.getState().libraryOpen).toBe(false);
    expect(canvasFocusMock.openFocusedById).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'card-2' })
    );
  });

  it('focuses the search input with Cmd+F (D2)', () => {
    seedNodes([
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Alpha' },
      } as unknown as Node,
    ]);
    render(<Harness />);

    const search = screen.getByLabelText('Search notes…');
    fireEvent.keyDown(screen.getByRole('dialog'), {
      key: 'f',
      metaKey: true,
    });

    expect(document.activeElement).toBe(search);
  });

  it('offers a clear-search button and recent recommendations when a query has no matches (D4)', () => {
    seedNodes([
      {
        id: 'card-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Roadmap', updatedAt: 100 },
      } as unknown as Node,
    ]);
    render(<Harness />);

    fireEvent.change(screen.getByLabelText('Search notes…'), {
      target: { value: 'zzzznomatch' },
    });

    expect(screen.getByText('Clear search')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    // The recent recommendation surfaces the existing card despite the query.
    expect(screen.getAllByText('Roadmap').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Clear search'));
    expect(screen.queryByText('Clear search')).not.toBeInTheDocument();
  });

  it('surfaces unlinked files and recovers stable note records without exposing typed records as cards', async () => {
    rpcMocks.rpcScanUnlinkedNotes.mockResolvedValueOnce(
      UNLINKED_REACHABILITY_CASES.map((entry, index) => ({
        file: entry.file,
        hasFrontmatterId: entry.noteId !== null,
        modifiedAt: index + 1,
        noteId: entry.noteId,
        size: 64 + index * 64,
        title: entry.title,
      }))
    );
    const createNode = vi.fn(async () => 'node-recovered');
    useCanvasStore.setState({ createNode: createNode as any });

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText('Unlinked Files')).toBeInTheDocument();
      for (const entry of UNLINKED_REACHABILITY_CASES) {
        expect(screen.getByText(entry.title)).toBeInTheDocument();
      }
    });
    expect(screen.getByText('No frontmatter id')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Place on canvas' })
    ).toHaveLength(2);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Place on canvas' })[0]!
    );

    await waitFor(() => {
      const markdown = UNLINKED_REACHABILITY_CASES[0]!;
      expect(createNode).toHaveBeenCalledWith(
        'card',
        null,
        expect.objectContaining({
          canEnterGroup: false,
          data: expect.objectContaining({
            file: markdown.file,
            noteId: markdown.noteId,
            title: markdown.title,
          }),
        })
      );
      expect(screen.queryByText(markdown.title)).not.toBeInTheDocument();
    });
  });

  it('keeps the recovery section visible when the unlinked scan fails', async () => {
    rpcMocks.rpcScanUnlinkedNotes.mockRejectedValueOnce(new Error('disk full'));
    render(<Harness />);

    await waitFor(() => {
      expect(
        screen.getByText('Unable to scan content directory.')
      ).toBeInTheDocument();
    });
  });

  it('recovers a BlockNote sidecar by noteId without passing its JSON path as markdown', async () => {
    const sidecar = UNLINKED_REACHABILITY_CASES.find(
      (entry) => entry.type === 'sidecar'
    )!;
    rpcMocks.rpcScanUnlinkedNotes.mockResolvedValueOnce([
      {
        file: sidecar.file,
        hasFrontmatterId: true,
        modifiedAt: 1,
        noteId: sidecar.noteId,
        size: 512,
        title: sidecar.title,
      },
    ]);
    const createNode = vi.fn(async () => 'node-sidecar');
    useCanvasStore.setState({ createNode: createNode as any });

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByText(sidecar.title)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Place on canvas' })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Place on canvas' }));

    await waitFor(() => {
      expect(createNode).toHaveBeenCalledWith(
        'card',
        null,
        expect.objectContaining({
          canEnterGroup: false,
          data: expect.objectContaining({
            noteId: sidecar.noteId,
            title: sidecar.title,
          }),
        })
      );
      const options = (
        createNode.mock.calls[0] as unknown as [
          unknown,
          unknown,
          { data?: Record<string, unknown> },
        ]
      )[2];
      expect(options.data).not.toHaveProperty('file');
      expect(screen.queryByText(sidecar.title)).not.toBeInTheDocument();
    });
  });
});
