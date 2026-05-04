// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens from the right below the measured titlebar area', () => {
    render(<DetachedNotesSidebar onClose={vi.fn()} />);

    const sidebar = screen.getByRole('complementary');

    expect(sidebar).toHaveClass('right-0');
    expect(sidebar).toHaveClass('bottom-0');
    expect(sidebar).toHaveClass('border-l');
    expect(sidebar).not.toHaveClass('left-0');
    expect(sidebar).not.toHaveClass('border-r');
    expect(sidebar.getAttribute('style')).toContain(
      'top: var(--app-titlebar-height, 2.5rem)'
    );
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
});
