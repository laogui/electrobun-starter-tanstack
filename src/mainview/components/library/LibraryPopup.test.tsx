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

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
    expect(screen.getByText('Inbox triage')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search notes…'), {
      target: { value: 'road' },
    });

    expect(screen.getByText('Roadmap')).toBeInTheDocument();
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

    fireEvent.click(screen.getByText('Roadmap'));

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

    fireEvent.click(screen.getByText('Inside child'));

    expect(canvasFocusMock.openFocusedById).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'folder-1' })
    );
  });
});
