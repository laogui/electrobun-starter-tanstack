// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '@/store/canvasStore';

const rpcMocks = vi.hoisted(() => ({
  isRpcAvailable: vi.fn(),
  loadCanvas: vi.fn(),
  rpcSaveManifest: vi.fn(),
  rpcCreateView: vi.fn(),
  rpcDeleteView: vi.fn(),
  rpcListViews: vi.fn(),
  rpcRenameView: vi.fn(),
}));

const interactionMocks = vi.hoisted(() => ({
  onCreateNode: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  loadCanvas: rpcMocks.loadCanvas,
  rpcSaveManifest: rpcMocks.rpcSaveManifest,
  rpcCreateView: rpcMocks.rpcCreateView,
  rpcDeleteView: rpcMocks.rpcDeleteView,
  rpcListViews: rpcMocks.rpcListViews,
  rpcRenameView: rpcMocks.rpcRenameView,
}));

vi.mock('better-themes', () => ({
  useTheme: () => ({ theme: 'light', systemTheme: 'light' }),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
  view_new_canvas: () => 'New Canvas',
  menu_note: () => 'Note',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
  menu_new_note: () => 'New note',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_paste: () => 'Paste',
  menu_reset_zoom: () => 'Reset zoom',
  menu_open_focused: () => 'Open focused',
  menu_copy: () => 'Copy',
  menu_change_color: () => 'Change color',
  menu_move_to_folder: () => 'Move to folder',
  menu_delete: () => 'Delete',
  menu_open: () => 'Open',
  menu_rename: () => 'Rename',
  menu_new_card_inside: () => 'New child',
  menu_edit_label: () => 'Edit label',
  menu_toggle_animation: () => 'Toggle animation',
  menu_toggle_path_type: () => 'Toggle path type',
  menu_delete_edge: () => 'Delete edge',
}));
vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
  view_new_canvas: () => 'New Canvas',
  menu_note: () => 'Note',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
  menu_new_note: () => 'New note',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_paste: () => 'Paste',
  menu_reset_zoom: () => 'Reset zoom',
  menu_open_focused: () => 'Open focused',
  menu_copy: () => 'Copy',
  menu_change_color: () => 'Change color',
  menu_move_to_folder: () => 'Move to folder',
  menu_delete: () => 'Delete',
  menu_open: () => 'Open',
  menu_rename: () => 'Rename',
  menu_new_card_inside: () => 'New child',
  menu_edit_label: () => 'Edit label',
  menu_toggle_animation: () => 'Toggle animation',
  menu_toggle_path_type: () => 'Toggle path type',
  menu_delete_edge: () => 'Delete edge',
}));

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid='rf-provider'>{children}</div>
    ),
    ReactFlow: ({
      nodes,
      onInit,
      onPaneContextMenu,
      onNodeDoubleClick,
      children,
    }: {
      children: React.ReactNode;
      nodes: Array<{
        id: string;
        type?: string;
        data: Record<string, unknown>;
      }>;
      onInit?: (instance: {
        getViewport: () => { x: number; y: number; zoom: number };
      }) => void;
      onPaneContextMenu?: (event: MouseEvent) => void;
      onNodeDoubleClick?: (
        event: MouseEvent,
        node: { id: string; type?: string; data: Record<string, unknown> }
      ) => void;
    }) => {
      onInit?.({ getViewport: () => ({ x: 0, y: 0, zoom: 1 }) });
      return (
        <div>
          <button
            type='button'
            onClick={() => {
              onPaneContextMenu?.({
                preventDefault: () => {},
                clientX: 180,
                clientY: 240,
              } as MouseEvent);
            }}
          >
            Open canvas menu
          </button>
          <button
            type='button'
            onClick={() => {
              const node = nodes[0];
              if (!node) return;
              onNodeDoubleClick?.({} as MouseEvent, node);
            }}
          >
            Open focused node
          </button>
          {nodes.map((node) => (
            <div key={node.id} data-id={node.id}>
              {String(node.data.title ?? node.id)}
            </div>
          ))}
          {children}
        </div>
      );
    },
    Background: () => <div>Background</div>,
    Controls: () => <div>Controls</div>,
    MiniMap: () => <div>MiniMap</div>,
  };
});

vi.mock('@/hooks/useCanvasPersistence', () => ({
  useCanvasPersistence: vi.fn(),
}));

vi.mock('@/hooks/useNodeDrag', () => ({
  useNodeDrag: () => ({
    dropTargetId: null,
    onNodeDragStart: vi.fn(),
    onNodeDrag: vi.fn(),
    onNodeDragStop: vi.fn(),
  }),
}));

vi.mock('@/hooks/useHelperLines', () => ({
  useHelperLines: () => ({
    helperLineH: null,
    helperLineV: null,
    onNodesChange: vi.fn(),
  }),
}));

vi.mock('@/hooks/useNodeCreation', () => ({
  useNodeCreation: () => ({
    onCreateNode: interactionMocks.onCreateNode,
  }),
}));

vi.mock('@/components/canvas/FocusedView', () => ({
  FocusedView: ({ node }: { node: { id: string } }) => (
    <div>Focused {node.id}</div>
  ),
}));

vi.mock('@/components/canvas/FolderView', () => ({
  FolderView: ({ folder }: { folder: { id: string } }) => (
    <div>Folder {folder.id}</div>
  ),
}));

vi.mock('@/components/canvas/HelperLines', () => ({
  HelperLines: () => <div>HelperLines</div>,
}));

const routeFactoryMock = vi.fn((options) => ({ options }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => routeFactoryMock,
}));

const resetStore = () => {
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    activeViewId: 'default',
    views: [{ id: 'default', name: 'Default Canvas' }],
    nodes: [],
    edges: [],
    clipboard: [],
    createMenuOpen: false,
    nodeIdCounter: 100,
    editingEdgeId: null,
  });
};

describe('routes/index', () => {
  beforeEach(() => {
    resetStore();
    rpcMocks.loadCanvas.mockReset();
    rpcMocks.isRpcAvailable.mockReset();
    rpcMocks.rpcSaveManifest.mockReset();
    rpcMocks.rpcCreateView.mockReset();
    rpcMocks.rpcDeleteView.mockReset();
    rpcMocks.rpcListViews.mockReset();
    rpcMocks.rpcRenameView.mockReset();
    interactionMocks.onCreateNode.mockReset();

    rpcMocks.loadCanvas.mockResolvedValue({
      nodes: [
        {
          id: 'loaded-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { title: 'Loaded Card', content: '', color: '#fff' },
        },
      ],
      edges: [],
    });
    rpcMocks.isRpcAvailable.mockResolvedValue(true);
    rpcMocks.rpcSaveManifest.mockResolvedValue({ success: true });
    rpcMocks.rpcCreateView.mockResolvedValue({
      id: 'view-2',
      name: 'Canvas 2',
    });
    rpcMocks.rpcDeleteView.mockResolvedValue({
      success: true,
      activeViewId: 'default',
    });
    rpcMocks.rpcListViews.mockResolvedValue({
      views: [{ id: 'default', name: 'Default Canvas' }],
      activeViewId: 'default',
    });
    rpcMocks.rpcRenameView.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('hydrates loaded canvas data and opens a focused node', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    const rect = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    } as DOMRect;
    const element = document.querySelector('[data-id="loaded-1"]');
    vi.spyOn(element!, 'getBoundingClientRect').mockReturnValue(rect);

    fireEvent.click(screen.getByRole('button', { name: 'Open focused node' }));

    await waitFor(() => {
      expect(screen.getByText('Focused loaded-1')).toBeInTheDocument();
    });
  });

  it('supports create menu and canvas context menu flows', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Canvas' }));
    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'Note' }));

    await waitFor(() => {
      expect(interactionMocks.onCreateNode).toHaveBeenCalledWith('card');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open canvas menu' }));
    fireEvent.click(screen.getByRole('button', { name: /new note/i }));

    await waitFor(() => {
      expect(useCanvasStore.getState().nodes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
