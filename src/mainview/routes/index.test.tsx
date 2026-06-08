// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useCanvasStore } from '@/store/canvasStore';

const FOCUSED_RE = /Focused/;
const NEW_RE = /^new$/i;

const rpcMocks = vi.hoisted(() => ({
  isRpcAvailable: vi.fn(),
  loadCanvas: vi.fn(),
  rpcSaveManifest: vi.fn(),
  rpcCreateView: vi.fn(),
  rpcCreateViewFromTemplate: vi.fn(),
  rpcDeleteView: vi.fn(),
  rpcListViews: vi.fn(),
  rpcRenameView: vi.fn(),
  rpcGetSettings: vi.fn(),
  rpcImportMarkdownFiles: vi.fn(),
  rpcSetActiveView: vi.fn(),
}));

const interactionMocks = vi.hoisted(() => ({
  onCreateNode: vi.fn(),
}));

const assetFileMocks = vi.hoisted(() => ({
  saveAssetFileWithProgressToast: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  exportReactFlowCanvasToJson: vi.fn(),
  exportReactFlowCanvasToPng: vi.fn(),
  sanitizeExportFileName: vi.fn(),
}));

const reactFlowMocks = vi.hoisted(() => ({
  props: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

const nodeMetadataMocks = vi.hoisted(() => ({
  map: {},
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  loadCanvas: rpcMocks.loadCanvas,
  rpcSaveManifest: rpcMocks.rpcSaveManifest,
  rpcCreateView: rpcMocks.rpcCreateView,
  rpcCreateViewFromTemplate: rpcMocks.rpcCreateViewFromTemplate,
  rpcDeleteView: rpcMocks.rpcDeleteView,
  rpcListViews: rpcMocks.rpcListViews,
  rpcRenameView: rpcMocks.rpcRenameView,
  rpcGetSettings: rpcMocks.rpcGetSettings,
  rpcImportMarkdownFiles: rpcMocks.rpcImportMarkdownFiles,
  rpcSetActiveView: rpcMocks.rpcSetActiveView,
}));

vi.mock('@/lib/canvasExport', () => ({
  exportReactFlowCanvasToJson: exportMocks.exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng: exportMocks.exportReactFlowCanvasToPng,
  sanitizeExportFileName: exportMocks.sanitizeExportFileName,
}));

vi.mock('@/lib/assetImportProgress', () => ({
  saveAssetFileWithProgressToast: assetFileMocks.saveAssetFileWithProgressToast,
}));

vi.mock('sonner', () => ({
  toast: toastMocks,
}));

vi.mock('better-themes', () => ({
  useTheme: () => ({ theme: 'light', systemTheme: 'light' }),
}));

const paraglideMessageMocks = vi.hoisted(() => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
  view_new_canvas: () => 'New Canvas',
  view_blank_canvas: () => 'Blank Canvas',
  view_from_template: () => 'From Template',
  menu_note: () => 'Note',
  menu_checklist: () => 'Checklist',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_link: () => 'Link',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
  menu_import_markdown: () => 'Import Markdown',
  menu_new_note: () => 'New note',
  menu_new_checklist: () => 'New checklist',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_link: () => 'New link',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_new_file: () => 'New file',
  menu_paste: () => 'Paste',
  menu_reset_zoom: () => 'Reset zoom',
  menu_open_focused: () => 'Open focused',
  menu_copy: () => 'Copy',
  menu_change_color: () => 'Change color',
  menu_edit_tag: () => 'Edit Tag',
  menu_delete: () => 'Delete',
  menu_open: () => 'Open',
  menu_rename: () => 'Rename',
  menu_edit_folder_info: () => 'Edit Info',
  folder_edit_title: () => 'Edit folder',
  folder_edit_description: () => "Update the folder's name and description.",
  folder_edit_name_label: () => 'Name',
  folder_edit_name_placeholder: () => 'Folder name',
  folder_edit_description_label: () => 'Description',
  folder_edit_description_placeholder: () =>
    'Add a short description (optional)',
  folder_edit_save: () => 'Save',
  folder_edit_cancel: () => 'Cancel',
  menu_new: () => 'New',
  menu_new_card_inside: () => 'New child',
  menu_move_out: () => 'Move Out',
  menu_move_to_library: () => 'Move to Library',
  menu_export_markdown: () => 'Export as Markdown',
  menu_export_canvas_markdown: () => 'Export Canvas as Markdown',
  menu_copy_as_markdown: () => 'Copy as Markdown',
  menu_lock: () => 'Lock',
  menu_unlock: () => 'Unlock',
  menu_edge_color: () => 'Cycle Color',
  menu_edit_label: () => 'Edit label',
  menu_toggle_animation: () => 'Toggle animation',
  menu_toggle_straight: () => 'Toggle Straight',
  menu_toggle_curved: () => 'Toggle Curved',
  menu_delete_edge: () => 'Delete edge',
  delete_view_confirm_title: () => 'Delete canvas?',
  delete_view_confirm_body: ({ name }: { name: string }) =>
    `"${name}" and everything on it will be moved to trash.`,
  delete_view_confirm_cancel: () => 'Cancel',
  delete_view_confirm_action: () => 'Delete Canvas',
  toast_view_deleted: ({ name }: { name: string }) =>
    `Canvas "${name}" deleted`,
  toast_view_restored: ({ name }: { name: string }) =>
    `Canvas "${name}" restored`,
  toast_view_restore_failed: () => 'Could not restore canvas',
  toast_undo: () => 'Undo',
  templates_browse_all: () => 'Browse all templates…',
  template_quick_start_name: () => 'Quick Start',
  template_weekly_planner_name: () => 'Weekly Planner',
  template_kanban_name: () => 'Kanban Board',
  template_sprint_retro_name: () => 'Sprint Retro',
  template_brainstorm_mindmap_name: () => 'Brainstorm Mindmap',
  template_eisenhower_matrix_name: () => 'Eisenhower Matrix',
  template_reading_notes_name: () => 'Reading Notes',
  template_demo_name: () => 'Demo Canvas',
  library_button_aria: () => 'Note Library',
  search_button_aria: () => 'Search',
  search_dialog_placeholder: () => 'Search notes, stickies, folders, views…',
  search_no_matches: () => 'No matches',
  search_recent_title: () => 'Recent searches',
  search_recent_clear: () => 'Clear',
  search_filter_all: () => 'All',
  search_filter_notes: () => 'Notes',
  search_filter_folders: () => 'Folders',
  search_filter_links: () => 'Links',
  search_filter_images: () => 'Images',
  library_title: () => 'Note Library',
  library_search_placeholder: () => 'Search notes…',
  library_sort_label: () => 'Sort',
  library_sort_recent: () => 'Recently edited',
  library_sort_name: () => 'Name (A–Z)',
  library_sort_created: () => 'Created',
  library_close: () => 'Close',
  library_ungrouped: () => 'Ungrouped',
  library_detached: () => 'Detached notes',
  library_empty: () => 'Nothing on this canvas yet.',
  library_empty_search: ({ query }: { query: string }) =>
    `No notes match "${query}".`,
  library_group_count: ({ count }: { count: number }) => `${count}`,
  library_untitled: () => 'Untitled',
  library_detached_toast: () => 'This note is not placed on the canvas yet.',
  library_detached_pin_action: () => 'Place on canvas',
  tags_button_aria: () => 'Tag Filter',
  tags_sidebar_title: () => 'Tags',
  tags_sidebar_close: () => 'Close',
  tags_sidebar_empty: () => 'No tags yet.',
  tags_sidebar_clear_filter: () => 'Clear filter',
  tags_sidebar_active_aria: ({ tag }: { tag: string }) => `Filtering by ${tag}`,
  view_node_count_one: () => '1 node',
  view_node_count_other: ({ count }: { count: number }) => `${count} nodes`,
  view_rename_empty: () => 'Name cannot be empty',
  view_rename_too_long: () => 'Name is too long',
  view_rename_duplicate: () => 'A view with this name already exists',
}));
vi.mock('../../../paraglide/messages.js', () => paraglideMessageMocks);
vi.mock('../../paraglide/messages.js', () => paraglideMessageMocks);

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react');
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="rf-provider">{children}</div>
    ),
    ReactFlow: ({
      connectionLineComponent,
      nodes,
      onInit,
      onPaneContextMenu,
      onDragOver,
      onDrop,
      onNodeDoubleClick,
      snapGrid,
      snapToGrid,
      children,
    }: {
      children: React.ReactNode;
      connectionLineComponent?: React.ComponentType;
      nodes: Array<{
        id: string;
        type?: string;
        data: Record<string, unknown>;
      }>;
      onInit?: (instance: {
        getViewport: () => { x: number; y: number; zoom: number };
      }) => void;
      onPaneContextMenu?: (event: MouseEvent) => void;
      onDragOver?: (event: DragEvent) => void;
      onDrop?: (event: DragEvent) => void;
      onNodeDoubleClick?: (
        event: MouseEvent,
        node: { id: string; type?: string; data: Record<string, unknown> }
      ) => void;
      snapGrid?: [number, number];
      snapToGrid?: boolean;
    }) => {
      reactFlowMocks.props({ connectionLineComponent, snapGrid, snapToGrid });
      onInit?.({ getViewport: () => ({ x: 0, y: 0, zoom: 1 }) });
      return (
        <div>
          <button
            onClick={() => {
              onPaneContextMenu?.({
                preventDefault: () => {},
                clientX: 180,
                clientY: 240,
              } as MouseEvent);
            }}
            type="button"
          >
            Open canvas menu
          </button>
          <button
            onClick={() => {
              const file = new File(['hello'], 'notes.txt', {
                type: 'text/plain',
              });
              const event = {
                clientX: 320,
                clientY: 420,
                dataTransfer: {
                  files: [file],
                  getData: () => '',
                  types: ['Files'],
                },
                preventDefault: vi.fn(),
              } as unknown as DragEvent;
              onDrop?.(event);
            }}
            type="button"
          >
            Drop file
          </button>
          <button
            onClick={() => {
              const event = {
                dataTransfer: {
                  dropEffect: 'move',
                  files: [],
                  types: ['Files'],
                },
                preventDefault: vi.fn(),
              } as unknown as DragEvent;
              onDragOver?.(event);
            }}
            type="button"
          >
            Drag file over canvas
          </button>
          <button
            onClick={() => {
              const node = nodes[0];
              if (!node) {
                return;
              }
              onNodeDoubleClick?.({} as MouseEvent, node);
            }}
            type="button"
          >
            Open focused node
          </button>
          {nodes.map((node) => (
            <div data-id={node.id} key={node.id}>
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
    useReactFlow: () => ({
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    }),
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

vi.mock('@/hooks/useNodeMetadata', () => ({
  useNodeMetadata: () => ({
    map: nodeMetadataMocks.map,
    get: () => undefined,
  }),
  useSetNodeMetadata: () => ({ mutate: vi.fn() }),
  useDeleteNodeMetadata: () => ({ mutate: vi.fn() }),
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
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    createFileRoute: () => routeFactoryMock,
  };
});

const resetStore = () => {
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    activeViewId: 'default',
    views: [{ id: 'default', name: 'Default Canvas' }],
    nodes: [],
    edges: [],
    clipboard: [],
    createMenuOpen: false,
    editingEdgeId: null,
  });
  useAppSettingsStore.setState({
    ...DEFAULT_SETTINGS,
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
    rpcMocks.rpcGetSettings.mockReset();
    rpcMocks.rpcGetSettings.mockResolvedValue(null);
    rpcMocks.rpcImportMarkdownFiles.mockReset();
    rpcMocks.rpcImportMarkdownFiles.mockResolvedValue({
      canceled: true,
      notes: [],
    });
    interactionMocks.onCreateNode.mockReset();
    assetFileMocks.saveAssetFileWithProgressToast.mockReset();
    exportMocks.exportReactFlowCanvasToPng.mockReset();
    exportMocks.exportReactFlowCanvasToPng.mockResolvedValue(true);
    exportMocks.exportReactFlowCanvasToJson.mockReset();
    exportMocks.exportReactFlowCanvasToJson.mockResolvedValue(true);
    exportMocks.sanitizeExportFileName.mockReset();
    exportMocks.sanitizeExportFileName.mockImplementation(
      (name: string) => `safe-${name}`
    );
    reactFlowMocks.props.mockReset();
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();

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
    rpcMocks.rpcSetActiveView.mockReset();
    rpcMocks.rpcSetActiveView.mockResolvedValue({ success: true });
    assetFileMocks.saveAssetFileWithProgressToast.mockResolvedValue({
      attachmentFile: 'attachments/file_abc.txt',
      color: '#FFFFFF',
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'notes.txt',
    });
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

  it('enables 24px snap-to-grid dragging', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(reactFlowMocks.props).toHaveBeenCalledWith(
        expect.objectContaining({
          snapGrid: [24, 24],
          snapToGrid: true,
        })
      );
    });
  });

  it('disables snap-to-grid dragging from app settings', async () => {
    useAppSettingsStore.setState({
      canvasSnapToGrid: false,
    });
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(reactFlowMocks.props).toHaveBeenCalledWith(
        expect.objectContaining({
          snapGrid: [24, 24],
          snapToGrid: false,
        })
      );
    });
  });

  it('shows an empty canvas guide for empty manifests', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce({ nodes: [], edges: [] });
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(screen.getByText('Start this canvas')).toBeInTheDocument();
      expect(useCanvasStore.getState().nodes).toEqual([]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create first note' }));
    expect(interactionMocks.onCreateNode).toHaveBeenCalledWith('card');
    expect(
      screen.getByRole('link', { name: 'Browse templates' })
    ).toHaveAttribute('href', '/templates');
  });

  it('supports create menu and canvas context menu flows', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Note' }));

    await waitFor(() => {
      expect(interactionMocks.onCreateNode).toHaveBeenCalledWith('card');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open canvas menu' }));

    expect(screen.getByRole('button', { name: NEW_RE })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Paste ⌘V' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset zoom' })
    ).toBeInTheDocument();
  });

  it('creates link nodes from the create menu URL form', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Link' }));
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'https://example.com/docs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));

    expect(interactionMocks.onCreateNode).toHaveBeenCalledWith('link', {
      data: {
        url: 'https://example.com/docs',
        title: 'example.com',
        color: '#FFFFFF',
      },
    });
  });

  it('creates link nodes from pasted URLs when the canvas is idle', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    const event = new Event('paste', {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: () => 'Read https://example.com/pasted.',
      },
    });
    globalThis.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(interactionMocks.onCreateNode).toHaveBeenCalledWith('link', {
      anchorCenter: {
        x: 512,
        y: 384,
      },
      data: {
        url: 'https://example.com/pasted',
        title: 'example.com',
        color: '#FFFFFF',
      },
    });
  });

  it('creates asset nodes from dropped files', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Drop file' }));

    await waitFor(() => {
      expect(
        assetFileMocks.saveAssetFileWithProgressToast
      ).toHaveBeenCalledWith(expect.objectContaining({ name: 'notes.txt' }));
      expect(interactionMocks.onCreateNode).toHaveBeenCalledWith('asset', {
        anchorCenter: { x: 320, y: 420 },
        data: {
          attachmentFile: 'attachments/file_abc.txt',
          color: '#FFFFFF',
          fileName: 'notes.txt',
          kind: 'file',
          mimeType: 'text/plain',
          size: 5,
          title: 'notes.txt',
        },
      });
    });
  });

  it('logs dropped file import failures instead of swallowing them', async () => {
    const importError = new Error('import failed');
    assetFileMocks.saveAssetFileWithProgressToast.mockRejectedValueOnce(
      importError
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Drop file' }));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        '[canvas] Failed to import dropped file:',
        importError
      );
    });
    expect(interactionMocks.onCreateNode).not.toHaveBeenCalledWith(
      'asset',
      expect.anything()
    );

    errorSpy.mockRestore();
  });

  it('exports the current canvas as PNG from the toolbar', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export canvas' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Export PNG' })
    );

    await waitFor(() => {
      expect(exportMocks.exportReactFlowCanvasToPng).toHaveBeenCalledWith(
        expect.objectContaining({
          backgroundColor: '#EFF3F4',
          fileName: 'safe-Default Canvas',
        })
      );
      expect(toastMocks.success).toHaveBeenCalledWith('PNG 已导出。');
    });
  });

  it('exports the current canvas as JSON from the toolbar', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export canvas' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Export JSON' })
    );

    await waitFor(() => {
      expect(exportMocks.exportReactFlowCanvasToJson).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'safe-Default Canvas',
          viewName: 'Default Canvas',
        })
      );
      expect(toastMocks.success).toHaveBeenCalledWith('JSON 已导出。');
    });
  });

  it('hydrates the saved viewport from loadCanvas into the store', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'loaded-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { title: 'Loaded Card', content: '', color: '#fff' },
        },
      ],
      edges: [],
      viewport: { x: 42, y: 84, zoom: 1.25 },
    });
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(useCanvasStore.getState().viewport).toEqual({
        x: 42,
        y: 84,
        zoom: 1.25,
      });
    });
  });

  it('seeds initial nodes when no manifest exists and rpc is available', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce(null);
    rpcMocks.isRpcAvailable.mockResolvedValueOnce(true);
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(useCanvasStore.getState()._hydrated).toBe(true);
    });

    // Missing manifests still seed the first-run canvas; explicit empty
    // manifests stay empty and show the empty-canvas guide.
    expect(useCanvasStore.getState().nodes.length).toBeGreaterThan(0);
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
  });

  it('keeps loading state when load fails and does not focus without rect', async () => {
    rpcMocks.loadCanvas.mockRejectedValueOnce(new Error('failed load'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
      expect(screen.queryByText(FOCUSED_RE)).toBeNull();
    });

    errorSpy.mockRestore();
  });

  it('hydrates initial nodes in-memory when rpc is unavailable (browser/dev fallback)', async () => {
    // Without Electrobun RPC, `loadCanvas` resolves to `null` (see
    // `@/lib/rpc.ts`). The renderer should then fall back to the in-memory
    // demo nodes so the canvas remains usable for browser-only debugging.
    rpcMocks.loadCanvas.mockResolvedValueOnce(null);
    rpcMocks.isRpcAvailable.mockResolvedValueOnce(false);
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(useCanvasStore.getState().nodes.length).toBeGreaterThan(0);
    });

    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
    expect(screen.queryByText('Loaded Card')).toBeNull();
  });

  it('does not open focused node when the selected element has no rect', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Open focused node' }));

    expect(screen.queryByText('Focused loaded-1')).toBeNull();
  });

  it('registers the custom connection preview line', async () => {
    const module = await import('./index');
    const CanvasRoute = module.Route.options
      .component as () => React.ReactElement;

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(reactFlowMocks.props).toHaveBeenCalled();
    });

    expect(
      reactFlowMocks.props.mock.calls.at(-1)?.[0]?.connectionLineComponent
    ).toBeTypeOf('function');
  });
});
