// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { renderWithProviders } from '../../../test/renderWithProviders';

import { TagSidebar } from './TagSidebar';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: { rpcListTags: vi.fn() },
}));

vi.mock('@/lib/rpc', () => ({
  rpcListTags: rpcMock.rpcListTags,
}));

const ACTIVE_FILTER_RE = /Filtering by Work/;

describe('TagSidebar', () => {
  beforeEach(() => {
    rpcMock.rpcListTags.mockReset();
    rpcMock.rpcListTags.mockResolvedValue([
      { name: 'Work', count: 3 },
      { name: 'Inbox', count: 2 },
      { name: 'Personal', count: 1 },
    ]);
    useCanvasStore.getState().reset();
    useCanvasStore.setState({ tagSidebarOpen: true });
  });

  afterEach(() => {
    useCanvasStore.getState().reset();
    vi.clearAllMocks();
  });

  it('renders nothing when tagSidebarOpen is false', () => {
    useCanvasStore.setState({ tagSidebarOpen: false });
    renderWithProviders(<TagSidebar />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists tags from the rpc response with counts', async () => {
    renderWithProviders(<TagSidebar />);
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument();
    });
    expect(screen.getByText('Inbox')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('clicking a tag sets activeTagFilter in the store', async () => {
    renderWithProviders(<TagSidebar />);
    const btn = await screen.findByRole('button', { name: 'Work' });
    fireEvent.click(btn);
    expect(useCanvasStore.getState().activeTagFilter).toBe('Work');
  });

  it('clicking the active tag again clears the filter', async () => {
    useCanvasStore.setState({ activeTagFilter: 'Work' });
    renderWithProviders(<TagSidebar />);
    const btn = await screen.findByRole('button', { name: ACTIVE_FILTER_RE });
    fireEvent.click(btn);
    expect(useCanvasStore.getState().activeTagFilter).toBeNull();
  });

  it('renders the clear-filter button only when a filter is active', async () => {
    renderWithProviders(<TagSidebar />);
    await screen.findByText('Work');
    expect(screen.queryByText('Clear filter')).not.toBeInTheDocument();

    useCanvasStore.setState({ activeTagFilter: 'Work' });
    await screen.findByText('Clear filter');
    fireEvent.click(screen.getByText('Clear filter'));
    expect(useCanvasStore.getState().activeTagFilter).toBeNull();
  });

  it('shows empty state when rpc returns no tags', async () => {
    rpcMock.rpcListTags.mockResolvedValue([]);
    renderWithProviders(<TagSidebar />);
    await screen.findByText('No tags yet.');
  });
});
