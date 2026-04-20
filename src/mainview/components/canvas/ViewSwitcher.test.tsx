// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { useCanvasStore } from '@/store/canvasStore';

const rpcMocks = vi.hoisted(() => ({
  isRpcAvailable: vi.fn(),
  loadCanvas: vi.fn(),
  rpcCreateView: vi.fn(),
  rpcDeleteView: vi.fn(),
  rpcListViews: vi.fn(),
  rpcRenameView: vi.fn(),
  rpcSaveManifest: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  loadCanvas: rpcMocks.loadCanvas,
  rpcCreateView: rpcMocks.rpcCreateView,
  rpcDeleteView: rpcMocks.rpcDeleteView,
  rpcListViews: rpcMocks.rpcListViews,
  rpcRenameView: rpcMocks.rpcRenameView,
  rpcSaveManifest: rpcMocks.rpcSaveManifest,
}));

vi.mock('../../../paraglide/messages.js', () => ({
  view_new_canvas: () => 'New Canvas',
  menu_note: () => 'Note',
  menu_checklist: () => 'Checklist',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
}));

const resetStore = () => {
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    activeViewId: 'default',
    views: [{ id: 'default', name: 'Default Canvas' }],
    nodes: [
      {
        id: 'node-1',
        type: 'card',
        position: { x: 0, y: 0 },
        data: { title: 'Saved Node', content: '', color: '#fff' },
        selected: true,
      },
    ],
    edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
    clipboard: [],
    createMenuOpen: false,
    editingEdgeId: null,
  });
};

const renderViewSwitcher = ({
  createMenuOpen = false,
  onCreateNode = vi.fn(),
  setCreateMenuOpen = vi.fn(),
}: {
  createMenuOpen?: boolean;
  onCreateNode?: ReturnType<typeof vi.fn>;
  setCreateMenuOpen?: ReturnType<typeof vi.fn>;
} = {}) =>
  render(
    <ViewSwitcher
      createMenuOpen={createMenuOpen}
      onCreateNode={onCreateNode}
      setCreateMenuOpen={setCreateMenuOpen}
    />
  );

describe('viewSwitcher', () => {
  beforeEach(() => {
    resetStore();
    rpcMocks.rpcListViews.mockReset();
    rpcMocks.isRpcAvailable.mockReset();
    rpcMocks.rpcSaveManifest.mockReset();
    rpcMocks.loadCanvas.mockReset();
    rpcMocks.rpcCreateView.mockReset();
    rpcMocks.rpcDeleteView.mockReset();
    rpcMocks.rpcRenameView.mockReset();

    rpcMocks.rpcListViews.mockResolvedValue({
      views: [
        { id: 'default', name: 'Default Canvas' },
        { id: 'focus', name: 'Focus Mode' },
      ],
      activeViewId: 'default',
    });
    rpcMocks.isRpcAvailable.mockResolvedValue(true);
    rpcMocks.rpcSaveManifest.mockResolvedValue({ success: true });
    rpcMocks.loadCanvas.mockResolvedValue({
      nodes: [
        {
          id: 'hydrated-1',
          type: 'card',
          position: { x: 1, y: 2 },
          data: { title: 'Hydrated', content: '', color: '#fff' },
        },
      ],
      edges: [],
    });
    rpcMocks.rpcCreateView.mockResolvedValue({
      id: 'view-2',
      name: 'Canvas 3',
    });
    rpcMocks.rpcDeleteView.mockResolvedValue({
      success: true,
      activeViewId: 'focus',
    });
    rpcMocks.rpcRenameView.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads views on mount and switches view with manifest flush', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalledTimes(1);
      expect(useCanvasStore.getState().views).toHaveLength(2);
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Focus Mode' }));

    await waitFor(() => {
      expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledWith(
        'default',
        [
          {
            id: 'node-1',
            type: 'card',
            position: { x: 0, y: 0 },
            data: { title: 'Saved Node', content: '', color: '#fff' },
          },
        ],
        [{ id: 'edge-1', source: 'node-1', target: 'node-2' }]
      );
      // ViewSwitcher no longer loads the new canvas; index.tsx's effect handles that
      expect(useCanvasStore.getState().activeViewId).toBe('focus');
      expect(useCanvasStore.getState()._hydrated).toBe(false);
    });
  });

  it('creates a new view and switches to it', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Canvas' }));

    await waitFor(() => {
      expect(rpcMocks.rpcCreateView).toHaveBeenCalledWith('Canvas 3');
      expect(
        useCanvasStore
          .getState()
          .views.some((view: { id: string }) => view.id === 'view-2')
      ).toBe(true);
      expect(useCanvasStore.getState().activeViewId).toBe('view-2');
    });
  });

  it('renames a view from the menu', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    const input = screen.getByDisplayValue('Focus Mode');
    fireEvent.change(input, { target: { value: 'Deep Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));

    await waitFor(() => {
      expect(rpcMocks.rpcRenameView).toHaveBeenCalledWith('focus', 'Deep Work');
      expect(
        useCanvasStore
          .getState()
          .views.find(
            (view: { id: string; name: string }) => view.id === 'focus'
          )?.name
      ).toBe('Deep Work');
    });
  });

  it('deletes a non-active view from the menu', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Focus Mode' }));

    await waitFor(() => {
      expect(rpcMocks.rpcDeleteView).toHaveBeenCalledWith('focus');
      expect(useCanvasStore.getState().views).toEqual([
        { id: 'default', name: 'Default Canvas' },
      ]);
    });
  });

  it('keeps state unchanged when create rpc calls return null', async () => {
    rpcMocks.rpcCreateView.mockResolvedValueOnce(null);

    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Canvas' }));

    await waitFor(() => {
      expect(useCanvasStore.getState().views).toEqual([
        { id: 'default', name: 'Default Canvas' },
        { id: 'focus', name: 'Focus Mode' },
      ]);
    });
  });

  it('keeps state unchanged when delete rpc calls return null', async () => {
    rpcMocks.rpcDeleteView.mockResolvedValueOnce(null);

    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Focus Mode' }));

    await waitFor(() => {
      expect(useCanvasStore.getState().views).toEqual([
        { id: 'default', name: 'Default Canvas' },
        { id: 'focus', name: 'Focus Mode' },
      ]);
    });
  });

  it('skips manifest flush when rpc is unavailable during a view switch', async () => {
    rpcMocks.isRpcAvailable.mockResolvedValueOnce(false);

    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Focus Mode' }));

    await waitFor(() => {
      expect(useCanvasStore.getState().activeViewId).toBe('focus');
    });

    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
  });

  it('cancels rename when confirm is attempted with an empty name', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    const input = screen.getByDisplayValue('Focus Mode');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Focus Mode')).toBeNull();
    });
    expect(rpcMocks.rpcRenameView).not.toHaveBeenCalled();
  });

  it('clears rename state when the menu closes', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    expect(screen.getByDisplayValue('Focus Mode')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Default Canvas')[0]!);

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Focus Mode')).toBeNull();
    });
  });

  it('does not delete the only remaining view', async () => {
    rpcMocks.rpcListViews.mockResolvedValueOnce({
      views: [{ id: 'default', name: 'Default Canvas' }],
      activeViewId: 'default',
    });

    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));

    expect(
      screen.queryByRole('button', { name: 'Delete Default Canvas' })
    ).toBeNull();
    expect(rpcMocks.rpcDeleteView).not.toHaveBeenCalled();
  });

  it('creates supported nodes from the create menu and ignores disabled items', async () => {
    const onCreateNode = vi.fn();
    renderViewSwitcher({ createMenuOpen: true, onCreateNode });

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Image' }));
    expect(onCreateNode).toHaveBeenCalledWith('image');

    const fileItem = screen.getByRole('menuitem', { name: 'File' });
    expect(fileItem).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(fileItem);
    expect(onCreateNode).toHaveBeenCalledTimes(1);
  });

  it('closes the menu without saving when switching to the active view', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Default Canvas' }));

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'Focus Mode' })).toBeNull();
    });
    expect(rpcMocks.isRpcAvailable).not.toHaveBeenCalled();
    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
  });

  it('cancels rename from the inline cancel button', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    expect(screen.getByDisplayValue('Focus Mode')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel rename' }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue('Focus Mode')).toBeNull();
    });
    expect(rpcMocks.rpcRenameView).not.toHaveBeenCalled();
  });

  it('confirms rename when pressing enter in the input', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    const input = screen.getByDisplayValue('Focus Mode');
    fireEvent.change(input, { target: { value: 'Keyboard Rename' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(rpcMocks.rpcRenameView).toHaveBeenCalledWith(
        'focus',
        'Keyboard Rename'
      );
    });
  });
});
