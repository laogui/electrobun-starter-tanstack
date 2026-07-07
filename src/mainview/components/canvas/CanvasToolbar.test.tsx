// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasToolbar } from '@/components/canvas/CanvasToolbar';
import { useCanvasStore } from '@/store/canvasStore';

describe('CanvasToolbar', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ searchOpen: false, settingsOpen: false });
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('groups the library, tag, and settings entry points', () => {
    render(<CanvasToolbar />);

    expect(
      screen.getByRole('button', { name: 'Note Library' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tag Filter' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('toggles the note library and tag sidebar', () => {
    render(<CanvasToolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Note Library' }));
    expect(useCanvasStore.getState().libraryOpen).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tag Filter' }));
    expect(useCanvasStore.getState().tagSidebarOpen).toBe(true);
  });

  it('opens settings and closes any open search', () => {
    useCanvasStore.setState({ searchOpen: true });
    render(<CanvasToolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(useCanvasStore.getState().settingsOpen).toBe(true);
    expect(useCanvasStore.getState().searchOpen).toBe(false);
  });

  it('marks the tag button active while filters are applied', () => {
    useCanvasStore.setState({ activeTagFilters: ['idea'] });
    render(<CanvasToolbar />);

    expect(screen.getByRole('button', { name: 'Tag Filter' })).toHaveClass(
      'text-primary'
    );
  });
});
