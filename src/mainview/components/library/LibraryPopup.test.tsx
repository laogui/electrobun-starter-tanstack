// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { LibraryPopup } from './LibraryPopup';

const { canvasFocusMock } = vi.hoisted(() => ({
  canvasFocusMock: { openFocusedById: vi.fn(() => Promise.resolve()) },
}));

vi.mock('@/lib/canvasFocus', () => ({
  openFocusedById: canvasFocusMock.openFocusedById,
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
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ libraryOpen: false });
    vi.clearAllMocks();
    canvasFocusMock.openFocusedById.mockClear();
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
});
