// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import { useCanvasStore } from '@/store/canvasStore';

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
    nodeIdCounter: 100,
    editingEdgeId: null,
  });
};

describe('ViewSwitcher', () => {
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
    render(<ViewSwitcher />);

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalledTimes(1);
      expect(useCanvasStore.getState().views).toHaveLength(2);
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Focus Mode' }));

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
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('focus');
      expect(useCanvasStore.getState().activeViewId).toBe('focus');
      expect(useCanvasStore.getState().nodes[0]?.id).toBe('hydrated-1');
    });
  });

  it('creates a new view and switches to it', async () => {
    render(<ViewSwitcher />);
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Canvas' }));

    await waitFor(() => {
      expect(rpcMocks.rpcCreateView).toHaveBeenCalledWith('Canvas 3');
      expect(
        useCanvasStore.getState().views.some((view) => view.id === 'view-2')
      ).toBe(true);
      expect(useCanvasStore.getState().activeViewId).toBe('view-2');
    });
  });

  it('renames a view from the menu', async () => {
    render(<ViewSwitcher />);
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
        useCanvasStore.getState().views.find((view) => view.id === 'focus')
          ?.name
      ).toBe('Deep Work');
    });
  });

  it('deletes a non-active view from the menu', async () => {
    render(<ViewSwitcher />);
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
});
