// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DetachedNotesSidebar } from '@/components/canvas/DetachedNotesSidebar';
import { useCanvasStore } from '@/store/canvasStore';

describe('DetachedNotesSidebar', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('opens full-height on the right with a titlebar-height header', () => {
    render(<DetachedNotesSidebar onClose={vi.fn()} />);

    const sidebar = screen.getByRole('complementary');
    const header = sidebar.querySelector('header');

    expect(sidebar).toHaveClass('right-0');
    expect(sidebar).toHaveClass('inset-y-0');
    expect(sidebar).toHaveClass('border-l');
    expect(sidebar).not.toHaveClass('left-0');
    expect(sidebar).not.toHaveClass('border-r');
    expect(header).toHaveClass('h-10');
    expect(header).toHaveClass('electrobun-webkit-app-region-drag');
  });

  it('keeps only the close action when the library is empty', () => {
    const onClose = vi.fn();

    render(<DetachedNotesSidebar onClose={onClose} />);

    expect(screen.getByText('Note Library')).toBeInTheDocument();
    expect(screen.queryByText('Create note')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New detached note' })
    ).not.toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists detached links and assets and pins them back to the canvas', () => {
    const pinNoteToCanvas = vi.fn();
    act(() => {
      useCanvasStore.setState({
        nodes: [
          {
            id: 'link-1',
            type: 'link',
            position: { x: 0, y: 0 },
            data: {
              color: '#FFFFFF',
              detached: true,
              title: 'Docs',
              url: 'https://example.com/docs',
            },
          },
          {
            id: 'asset-1',
            type: 'asset',
            position: { x: 0, y: 0 },
            data: {
              attachmentFile: 'attachments/file_abc.pdf',
              color: '#FFFFFF',
              detached: true,
              fileName: 'report.pdf',
              kind: 'file',
              mimeType: 'application/pdf',
              title: 'Report',
            },
          },
        ] as any,
        pinNoteToCanvas,
      });
    });

    render(<DetachedNotesSidebar onClose={vi.fn()} />);

    expect(screen.getAllByText('Docs').length).toBeGreaterThan(0);
    expect(screen.getByText('https://example.com/docs')).toBeInTheDocument();
    expect(screen.getAllByText('Report').length).toBeGreaterThan(0);
    expect(screen.getByText('application/pdf')).toBeInTheDocument();

    const docsItem = screen.getAllByText('Docs')[0].closest('li');
    expect(docsItem).not.toBeNull();
    fireEvent.click(
      within(docsItem!).getByRole('button', { name: 'Pin to canvas' })
    );

    expect(pinNoteToCanvas).toHaveBeenCalledWith(
      'link-1',
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
    );
  });
});
