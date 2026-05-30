// @vitest-environment jsdom

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

import { renderWithProviders } from '../../../test/renderWithProviders';

import { TagSidebar } from './TagSidebar';

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: {
    rpcListTags: vi.fn(),
    rpcRenameTag: vi.fn(),
    rpcDeleteTag: vi.fn(),
  },
}));

vi.mock('@/lib/rpc', () => ({
  rpcListTags: rpcMock.rpcListTags,
  rpcRenameTag: rpcMock.rpcRenameTag,
  rpcDeleteTag: rpcMock.rpcDeleteTag,
}));

const ACTIVE_FILTER_RE = /Filtering by Work/;
const RENAME_WORK_RE = /Rename Work/;
const RENAME_INBOX_RE = /Rename Inbox/;
const DELETE_PERSONAL_RE = /Delete Personal/;

describe('TagSidebar', () => {
  beforeEach(() => {
    rpcMock.rpcListTags.mockReset();
    rpcMock.rpcRenameTag.mockReset();
    rpcMock.rpcDeleteTag.mockReset();
    rpcMock.rpcListTags.mockResolvedValue([
      { name: 'Work', count: 3 },
      { name: 'Inbox', count: 2 },
      { name: 'Personal', count: 1 },
    ]);
    rpcMock.rpcRenameTag.mockResolvedValue({ updated: 1 });
    rpcMock.rpcDeleteTag.mockResolvedValue({ updated: 1 });
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
    expect(
      screen.queryByRole('complementary', { name: 'Tags' })
    ).not.toBeInTheDocument();
  });

  it('renders as a non-modal complementary region when open', async () => {
    renderWithProviders(<TagSidebar />);
    const aside = await screen.findByRole('complementary', { name: 'Tags' });
    expect(aside).toBeInTheDocument();
    expect(aside.getAttribute('aria-modal')).toBeNull();
  });

  it('closes the palette when Escape is pressed', async () => {
    renderWithProviders(<TagSidebar />);
    await screen.findByText('Work');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(useCanvasStore.getState().tagSidebarOpen).toBe(false);
    });
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

  it('clicking a tag adds it to activeTagFilters in the store', async () => {
    renderWithProviders(<TagSidebar />);
    const btn = await screen.findByRole('button', { name: 'Work' });
    fireEvent.click(btn);
    expect(useCanvasStore.getState().activeTagFilters).toEqual(['Work']);
  });

  it('clicking a second tag adds it (multi-select, OR semantics)', async () => {
    renderWithProviders(<TagSidebar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inbox' }));
    expect(useCanvasStore.getState().activeTagFilters).toEqual([
      'Work',
      'Inbox',
    ]);
  });

  it('clicking an active tag again removes only that tag (toggle)', async () => {
    useCanvasStore.setState({ activeTagFilters: ['Work', 'Inbox'] });
    renderWithProviders(<TagSidebar />);
    const btn = await screen.findByRole('button', { name: ACTIVE_FILTER_RE });
    fireEvent.click(btn);
    expect(useCanvasStore.getState().activeTagFilters).toEqual(['Inbox']);
  });

  it('renders the clear button only when at least one filter is active', async () => {
    renderWithProviders(<TagSidebar />);
    await screen.findByText('Work');
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();

    useCanvasStore.setState({ activeTagFilters: ['Work'] });
    const clearBtn = await screen.findByText('Clear');
    fireEvent.click(clearBtn);
    expect(useCanvasStore.getState().activeTagFilters).toEqual([]);
  });

  it('shows the selected-count badge in the footer', async () => {
    useCanvasStore.setState({ activeTagFilters: ['Work', 'Inbox'] });
    renderWithProviders(<TagSidebar />);
    await screen.findByText('2 selected');
  });

  it('closing via X button clears every active filter', async () => {
    useCanvasStore.setState({ activeTagFilters: ['Work', 'Inbox'] });
    renderWithProviders(<TagSidebar />);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(useCanvasStore.getState().tagSidebarOpen).toBe(false);
    });
    expect(useCanvasStore.getState().activeTagFilters).toEqual([]);
  });

  it('closing via Escape clears every active filter', async () => {
    useCanvasStore.setState({ activeTagFilters: ['Work'] });
    renderWithProviders(<TagSidebar />);
    await screen.findByText('Work');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(useCanvasStore.getState().tagSidebarOpen).toBe(false);
    });
    expect(useCanvasStore.getState().activeTagFilters).toEqual([]);
  });

  it('shows empty state when rpc returns no tags', async () => {
    rpcMock.rpcListTags.mockResolvedValue([]);
    renderWithProviders(<TagSidebar />);
    await screen.findByText('No tags yet.');
  });

  it('renames a tag through rpcRenameTag and updates the active filter list', async () => {
    useCanvasStore.setState({ activeTagFilters: ['Work', 'Inbox'] });
    renderWithProviders(<TagSidebar />);
    const renameBtn = await screen.findByRole('button', {
      name: RENAME_WORK_RE,
    });
    fireEvent.click(renameBtn);

    const input = await screen.findByDisplayValue('Work');
    fireEvent.change(input, { target: { value: 'Job' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(rpcMock.rpcRenameTag).toHaveBeenCalledWith('Work', 'Job');
    });
    await waitFor(() => {
      expect(useCanvasStore.getState().activeTagFilters).toEqual([
        'Job',
        'Inbox',
      ]);
    });
  });

  it('cancels rename on Escape without calling rpc', async () => {
    renderWithProviders(<TagSidebar />);
    const renameBtn = await screen.findByRole('button', {
      name: RENAME_INBOX_RE,
    });
    fireEvent.click(renameBtn);

    const input = await screen.findByDisplayValue('Inbox');
    fireEvent.change(input, { target: { value: 'Mailbox' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Mailbox')).not.toBeInTheDocument();
    });
    expect(rpcMock.rpcRenameTag).not.toHaveBeenCalled();
  });

  it('deletes a tag and removes it from the active filter list', async () => {
    useCanvasStore.setState({ activeTagFilters: ['Personal', 'Work'] });
    renderWithProviders(<TagSidebar />);
    const deleteBtn = await screen.findByRole('button', {
      name: DELETE_PERSONAL_RE,
    });
    fireEvent.click(deleteBtn);

    const confirmBtn = await screen.findByRole('button', {
      name: 'Delete Tag',
    });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(rpcMock.rpcDeleteTag).toHaveBeenCalledWith('Personal');
    });
    await waitFor(() => {
      expect(useCanvasStore.getState().activeTagFilters).toEqual(['Work']);
    });
  });
});
