// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetViewportPersistSuppression,
  suppressViewportPersist,
} from '@/lib/viewportPersist';
import { DEFAULT_SETTINGS } from '@/settingsClient';
import { useAppSettingsStore } from '@/store/appSettingsStore';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionEnablementStore } from '@/store/extensionEnablementStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import {
  REACHABILITY_CASES,
  targetForReachabilityCase,
} from '../../test/reachabilityMatrix';

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
  rpcCreateWidget: vi.fn(),
  rpcSaveWidget: vi.fn(),
  rpcSetActiveView: vi.fn(),
  rpcListExtensionEnablement: vi.fn(),
  rpcCreateExtensionInstance: vi.fn(),
  rpcLoadExtensionInstances: vi.fn(),
  rpcUpdateExtensionInstance: vi.fn(),
  rpcCloneExtensionInstance: vi.fn(),
  rpcScheduleExtensionTask: vi.fn(),
  rpcCancelExtensionTask: vi.fn(),
  rpcListExtensionTasks: vi.fn(),
}));

const interactionMocks = vi.hoisted(() => ({
  onCreateNode: vi.fn(),
}));

const assetFileMocks = vi.hoisted(() => ({
  saveAssetFileWithProgressToast: vi.fn(),
}));

const recordingMocks = vi.hoisted(() => ({
  lastRecorderProps: null as null | {
    onComplete: (result: {
      blob: Blob;
      durationMs: number;
      mimeType: string;
    }) => void;
    recordingNumber: number;
  },
  saveRecording: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  exportReactFlowCanvasToJson: vi.fn(),
  exportReactFlowCanvasToPng: vi.fn(),
  sanitizeExportFileName: vi.fn(),
}));

const reactFlowMocks = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  props: vi.fn(),
}));

const helperLineMocks = vi.hoisted(() => ({
  onNodesChange: vi.fn(),
}));

const nodeDragMocks = vi.hoisted(() => ({
  draggingNodeIds: [] as string[],
  dropTargetId: null as string | null,
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
  rpcCreateWidget: rpcMocks.rpcCreateWidget,
  rpcSaveWidget: rpcMocks.rpcSaveWidget,
  rpcCloneWidget: vi.fn(),
  rpcSetActiveView: rpcMocks.rpcSetActiveView,
  rpcListExtensionEnablement: rpcMocks.rpcListExtensionEnablement,
  rpcCreateExtensionInstance: rpcMocks.rpcCreateExtensionInstance,
  rpcLoadExtensionInstances: rpcMocks.rpcLoadExtensionInstances,
  rpcUpdateExtensionInstance: rpcMocks.rpcUpdateExtensionInstance,
  rpcCloneExtensionInstance: rpcMocks.rpcCloneExtensionInstance,
  rpcScheduleExtensionTask: rpcMocks.rpcScheduleExtensionTask,
  rpcCancelExtensionTask: rpcMocks.rpcCancelExtensionTask,
  rpcListExtensionTasks: rpcMocks.rpcListExtensionTasks,
}));

vi.mock('@/lib/canvasExport', () => ({
  CANVAS_EXPORT_SCHEMA: 'ghostboard-canvas-export/v1',
  isCanvasExportSchema: (value: unknown) =>
    value === 'ghostboard-canvas-export/v1' ||
    value === 'ghostboard-canvas-export/v2',
  exportReactFlowCanvasToJson: exportMocks.exportReactFlowCanvasToJson,
  exportReactFlowCanvasToPng: exportMocks.exportReactFlowCanvasToPng,
  sanitizeExportFileName: exportMocks.sanitizeExportFileName,
}));

vi.mock('@/lib/assetImportProgress', () => ({
  saveAssetFileWithProgressToast: assetFileMocks.saveAssetFileWithProgressToast,
}));

vi.mock('@/lib/recordingFiles', () => ({
  saveRecording: recordingMocks.saveRecording,
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
  menu_pomodoro: () => 'Pomodoro',
  menu_reminder: () => 'Reminder',
  menu_sticky: () => 'Sticky',
  menu_image: () => 'Image',
  menu_link: () => 'Link',
  menu_folder: () => 'Folder',
  menu_group: () => 'Group',
  menu_file: () => 'File',
  menu_recording: () => 'Recording',
  menu_more: () => 'More',
  menu_create_button_aria: () => 'Create',
  menu_note_library: () => 'Note Library',
  menu_import_markdown: () => 'Import Markdown',
  empty_canvas_title: () => 'Start this canvas',
  empty_canvas_description: () =>
    'Add a note, open your library, or start from a reusable canvas template.',
  empty_canvas_create_note: () => 'Create first note',
  empty_canvas_browse_templates: () => 'Browse templates',
  empty_canvas_open_library: () => 'Open note library',
  empty_canvas_hint_drop: () => 'Drop files anywhere to add them',
  empty_canvas_hint_create_menu: () => 'Cmd+N opens the create menu',
  menu_new_note: () => 'New note',
  menu_new_checklist: () => 'New checklist',
  menu_new_pomodoro: () => 'New pomodoro',
  menu_new_reminder: () => 'New reminder',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_link: () => 'New link',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_new_file: () => 'New file',
  menu_new_recording: () => 'New Recording',
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
  toast_view_switch_save_failed: () =>
    'Could not save the current canvas — switch canceled.',
  toast_undo: () => 'Undo',
  toast_canvas_not_ready: () => 'Canvas is not ready to export yet.',
  toast_png_exported: () => 'PNG exported.',
  toast_json_exported: () => 'JSON exported.',
  toast_export_failed: () => 'Export failed',
  toast_move_selection_failed: () => 'Could not move selection',
  toast_recording_save_failed: () => 'Localized recording save failed',
  toast_widget_create_failed: () => 'Could not create widget.',
  menu_duplicate: () => 'Duplicate',
  menu_move_to_view: () => 'Move to canvas…',
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
  settings_title: () => 'Settings',
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
  canvas_bg_button_aria: () => 'Canvas background',
  canvas_bg_picker_title: () => 'Canvas background',
  canvas_bg_picker_description: () => 'Choose a canvas color.',
  canvas_bg_add_color: () => 'Add color',
  canvas_bg_color_picker_title: () => 'Custom color',
  canvas_bg_remove_color: () => 'Remove color',
  settings_canvas_bg_default: () => 'Default',
  settings_canvas_bg_paper: () => 'Paper',
  settings_canvas_bg_cream: () => 'Cream',
  settings_canvas_bg_mono: () => 'Mono',
  settings_canvas_bg_lavender: () => 'Lavender',
  settings_canvas_bg_sage: () => 'Sage',
  settings_canvas_bg_mist: () => 'Mist',
  settings_canvas_bg_sand: () => 'Sand',
  settings_canvas_bg_ivory: () => 'Ivory',
  settings_canvas_bg_mint: () => 'Mint',
  settings_canvas_bg_lichen: () => 'Lichen',
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
      onNodeClick,
      onNodeDoubleClick,
      onNodesChange,
      onMoveEnd,
      snapGrid,
      snapToGrid,
      zoomOnDoubleClick,
      children,
    }: {
      children: React.ReactNode;
      connectionLineComponent?: React.ComponentType;
      nodes: Array<{
        id: string;
        selected?: boolean;
        type?: string;
        data: Record<string, unknown>;
        zIndex?: number;
      }>;
      onInit?: (instance: {
        fitBounds: typeof reactFlowMocks.fitBounds;
        getViewport: () => { x: number; y: number; zoom: number };
      }) => void;
      onPaneContextMenu?: (event: MouseEvent) => void;
      onDragOver?: (event: DragEvent) => void;
      onDrop?: (event: DragEvent) => void;
      onNodeClick?: (
        event: MouseEvent,
        node: { id: string; type?: string; data: Record<string, unknown> }
      ) => void;
      onNodeDoubleClick?: (
        event: MouseEvent,
        node: { id: string; type?: string; data: Record<string, unknown> }
      ) => void;
      onNodesChange?: (
        changes: Array<{ id: string; type: string; selected?: boolean }>
      ) => void;
      onMoveEnd?: (
        event: MouseEvent | TouchEvent | null,
        viewport: { x: number; y: number; zoom: number }
      ) => void;
      snapGrid?: [number, number];
      snapToGrid?: boolean;
      zoomOnDoubleClick?: boolean;
    }) => {
      reactFlowMocks.props({
        connectionLineComponent,
        nodes,
        onMoveEnd,
        snapGrid,
        snapToGrid,
        zoomOnDoubleClick,
      });
      onInit?.({
        fitBounds: reactFlowMocks.fitBounds,
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      });
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
              const file = new File(
                [
                  JSON.stringify({
                    schema: 'ghostboard-canvas-export/v1',
                    exportedAt: '2026-07-08T00:00:00.000Z',
                    nodes: [
                      {
                        id: 'exported-widget-node',
                        type: 'widget',
                        position: { x: 10, y: 20 },
                        data: {
                          widgetId: 'widget_exported',
                          kind: 'checklist',
                        },
                      },
                    ],
                    edges: [],
                    widgets: {
                      widget_exported: {
                        schema: 'ghostboard-widget/v1',
                        id: 'widget_exported',
                        kind: 'checklist',
                        title: 'Imported Checklist',
                        createdAt: '2026-07-08T00:00:00.000Z',
                        updatedAt: '2026-07-08T00:00:00.000Z',
                        data: {
                          items: [
                            {
                              id: 'item_exported',
                              text: 'Imported task',
                              checked: false,
                            },
                          ],
                        },
                      },
                    },
                  }),
                ],
                'canvas.json',
                { type: 'application/json' }
              );
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
            Drop canvas JSON
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
          <button
            onClick={() => {
              const node = nodes[0];
              if (!node) {
                return;
              }
              onNodeClick?.({} as MouseEvent, node);
            }}
            type="button"
          >
            Click focused node
          </button>
          <button
            onClick={() => {
              const node = nodes[0];
              if (!node) {
                return;
              }
              onNodeClick?.({ shiftKey: true } as MouseEvent, node);
            }}
            type="button"
          >
            Shift-click focused node
          </button>
          <button
            onClick={() => {
              const node = nodes[0];
              if (!node) {
                return;
              }
              onNodesChange?.([
                { id: node.id, selected: true, type: 'select' },
              ]);
            }}
            type="button"
          >
            Apply RF selection
          </button>
          {nodes.map((node) => (
            <div className="react-flow__node" data-id={node.id} key={node.id}>
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
    Panel: ({ children }: { children?: ReactNode }) => (
      <div data-testid="rf-panel">{children}</div>
    ),
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
    draggingNodeIds: nodeDragMocks.draggingNodeIds,
    dropTargetId: nodeDragMocks.dropTargetId,
    repelAnimationActive: false,
    onNodeDragStart: vi.fn(),
    onNodeDrag: vi.fn(),
    onNodeDragStop: vi.fn(),
  }),
}));

vi.mock('@/hooks/useHelperLines', () => ({
  useHelperLines: () => ({
    helperLineH: null,
    helperLineV: null,
    onNodesChange: helperLineMocks.onNodesChange,
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

vi.mock('@/components/canvas/RecordingRecorder', () => ({
  RecordingRecorder: (props: {
    onComplete: (result: {
      blob: Blob;
      durationMs: number;
      mimeType: string;
    }) => void;
    recordingNumber: number;
  }) => {
    recordingMocks.lastRecorderProps = props;
    return (
      <button
        onClick={() => {
          Promise.resolve(
            props.onComplete({
              blob: new Blob(['audio'], { type: 'audio/mp4' }),
              durationMs: 1000,
              mimeType: 'audio/mp4',
            })
          ).catch(() => undefined);
        }}
        type="button"
      >
        Finish recording
      </button>
    );
  },
}));

vi.mock('@/components/canvas/HelperLines', () => ({
  HelperLines: () => <div>HelperLines</div>,
}));

vi.mock('@/components/canvas/SelectionAIToolbar', () => ({
  SelectionAIToolbar: () => null,
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
  useExtensionEnablementStore.setState({ disabledCanvasTypes: [] });
  useExtensionInstanceStore.setState({ records: {}, history: {} });
};

describe('routes/index', () => {
  let CanvasRoute: () => React.ReactElement;

  beforeAll(async () => {
    const module = await import('./index');
    CanvasRoute = module.Route.options.component as () => React.ReactElement;
  }, 20_000);

  beforeEach(() => {
    cleanup();
    resetViewportPersistSuppression();
    resetStore();
    rpcMocks.loadCanvas.mockReset();
    rpcMocks.rpcListExtensionEnablement.mockReset();
    rpcMocks.rpcListExtensionEnablement.mockResolvedValue({
      disabledCanvasTypes: [],
      instanceCounts: {},
    });
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
    rpcMocks.rpcCreateExtensionInstance.mockReset();
    rpcMocks.rpcCreateExtensionInstance.mockImplementation(
      async (input: { canvasTypeId: string }) => ({
        success: true,
        record: {
          schema: 'ghostboard-extension-instance/v1',
          id: `extinst_${input.canvasTypeId.replaceAll('/', '_')}`,
          canvasTypeId: input.canvasTypeId,
          appVersion: 'test',
          dataVersion: 1,
          revision: 1,
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
          state: {},
          presentation: { title: input.canvasTypeId },
        },
      })
    );
    rpcMocks.rpcCreateWidget.mockReset();
    rpcMocks.rpcCreateWidget.mockImplementation(
      async (kind: string, title?: string) => ({
        success: true,
        widget: {
          schema: 'ghostboard-widget/v1',
          id:
            title === 'Prio before launch'
              ? 'widget_seed_prio'
              : 'widget_seed_bugs',
          kind,
          title: title ?? kind,
          createdAt: '2026-07-08T00:00:00.000Z',
          updatedAt: '2026-07-08T00:00:00.000Z',
          data: { items: [] },
        },
      })
    );
    rpcMocks.rpcSaveWidget.mockReset();
    rpcMocks.rpcSaveWidget.mockResolvedValue({ success: true });
    interactionMocks.onCreateNode.mockReset();
    assetFileMocks.saveAssetFileWithProgressToast.mockReset();
    recordingMocks.saveRecording.mockReset();
    recordingMocks.saveRecording.mockResolvedValue({
      attachmentFile: 'attachments/recording-1.m4a',
      color: '#FFFFFF',
      fileName: 'recording-1.m4a',
      mimeType: 'audio/mp4',
      recordingNumber: 1,
      title: '',
    });
    recordingMocks.lastRecorderProps = null;
    exportMocks.exportReactFlowCanvasToPng.mockReset();
    exportMocks.exportReactFlowCanvasToPng.mockResolvedValue(true);
    exportMocks.exportReactFlowCanvasToJson.mockReset();
    exportMocks.exportReactFlowCanvasToJson.mockResolvedValue(true);
    exportMocks.sanitizeExportFileName.mockReset();
    exportMocks.sanitizeExportFileName.mockImplementation(
      (name: string) => `safe-${name}`
    );
    reactFlowMocks.props.mockReset();
    reactFlowMocks.fitBounds.mockReset();
    nodeDragMocks.draggingNodeIds = [];
    nodeDragMocks.dropTargetId = null;
    helperLineMocks.onNodesChange.mockReset();
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
    resetViewportPersistSuppression();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('hydrates loaded canvas data and opens a focused node', async () => {
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

  it('opens the focused view on a plain single click', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
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

    // A single plain click opens directly, no prior selection required.
    fireEvent.click(screen.getByRole('button', { name: 'Click focused node' }));

    await waitFor(() => {
      expect(screen.getByText('Focused loaded-1')).toBeInTheDocument();
    });
  });

  it('expands folder children into the canvas on a plain single click', async () => {
    rpcMocks.loadCanvas.mockResolvedValue({
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: 'My Folder',
            subtitle: '',
            children: [
              {
                id: 'folder-child-1',
                type: 'card',
                data: { title: 'Inside', content: 'Folder child' },
              },
            ],
          },
        },
      ],
      edges: [],
    });

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('My Folder')).toBeInTheDocument();
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
    const element = document.querySelector('[data-id="folder-1"]');
    vi.spyOn(element!, 'getBoundingClientRect').mockReturnValue(rect);

    // Folders expand directly inside React Flow on a single plain click.
    fireEvent.click(screen.getByRole('button', { name: 'Click focused node' }));

    await waitFor(() => {
      expect(useCanvasStore.getState().focusedFolder?.id).toBe('folder-1');
      expect(document.querySelector('.folder-expansion-active')).not.toBeNull();
      expect(
        document.querySelector(
          '[data-id="folderExpandedChild:folder-1:folder-child-1"]'
        )
      ).not.toBeNull();
    });

    const renderedNodes = reactFlowMocks.props.mock.calls.at(-1)?.[0]
      ?.nodes as Array<{
      data: { expansionChildren?: unknown[] };
      id: string;
      zIndex?: number;
    }>;
    const renderedFolder = renderedNodes.find((node) => node.id === 'folder-1');
    const renderedChild = renderedNodes.find((node) =>
      node.id.startsWith('folderExpandedChild:')
    );
    expect(renderedFolder?.zIndex).toBeGreaterThan(renderedChild?.zIndex ?? 0);
    expect(renderedFolder?.data.expansionChildren).toHaveLength(1);
    expect(reactFlowMocks.fitBounds).not.toHaveBeenCalled();
  });

  it('opens a focusable Folder-child search target inside its owning Folder', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: 'Search Folder',
            children: [
              {
                id: 'child-1',
                type: 'card',
                data: { title: 'Search child', content: 'unique body' },
              },
            ],
          },
        },
      ],
      edges: [],
    });

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('Search Folder')).toBeInTheDocument();
    });

    act(() => {
      useCanvasStore.getState().setPendingSearchTarget({
        viewId: 'default',
        nodeId: 'child-1',
        target: {
          type: 'folder-child',
          viewId: 'default',
          folderId: 'folder-1',
          childId: 'child-1',
          placement: 'folder',
          content: { kind: 'note', id: 'note-child-1' },
        },
      });
    });

    await waitFor(() => {
      expect(useCanvasStore.getState().focusedFolder?.id).toBe('folder-1');
      expect(useCanvasStore.getState().focusedNode?.id).toBe('child-1');
      expect(screen.getByText('Focused child-1')).toBeInTheDocument();
      expect(useCanvasStore.getState().pendingSearchTarget).toBeNull();
    });
  });

  it('opens the matrix Folder child target inside its owning Folder', async () => {
    const entry = REACHABILITY_CASES.find(
      (candidate) => candidate.id === 'folder-note'
    )!;
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'reachability-folder',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: 'Reachability Folder',
            children: [
              {
                id: entry.nodeId,
                type: entry.nodeType,
                data: entry.data,
              },
            ],
          },
        },
      ],
      edges: [],
    });

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('Reachability Folder')).toBeInTheDocument();
    });

    const target = targetForReachabilityCase(entry);
    if (target.type !== 'folder-child') {
      throw new Error(
        'The reachability Folder case must produce a child target'
      );
    }
    act(() => {
      useCanvasStore.getState().setPendingSearchTarget({
        viewId: 'default',
        nodeId: entry.nodeId,
        target: { ...target, viewId: 'default' },
      });
    });

    await waitFor(() => {
      expect(useCanvasStore.getState().focusedFolder?.id).toBe(
        'reachability-folder'
      );
      expect(useCanvasStore.getState().focusedNode?.id).toBe(entry.nodeId);
      expect(useCanvasStore.getState().pendingSearchTarget).toBeNull();
    });
  });

  it('opens a cross-view Folder-child target and leaves non-focusable legacy content in the Folder layer', async () => {
    useCanvasStore.setState({
      views: [
        { id: 'default', name: 'Default Canvas' },
        { id: 'view-2', name: 'Second Canvas' },
      ],
    });
    rpcMocks.loadCanvas.mockImplementation(async (viewId: string) =>
      viewId === 'view-2'
        ? {
            nodes: [
              {
                id: 'folder-2',
                type: 'folder',
                position: { x: 0, y: 0 },
                data: {
                  title: 'Second Search Folder',
                  children: [
                    {
                      id: 'legacy-widget-child',
                      type: 'widget',
                      data: {
                        title: 'Legacy widget child',
                        widgetId: 'widget-legacy-child',
                        kind: 'checklist',
                      },
                    },
                  ],
                },
              },
            ],
            edges: [],
          }
        : { nodes: [], edges: [] }
    );

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(useCanvasStore.getState()._hydrated).toBe(true);
    });

    act(() => {
      useCanvasStore.getState().setActiveView('view-2');
    });
    act(() => {
      useCanvasStore.getState().setPendingSearchTarget({
        viewId: 'view-2',
        nodeId: 'legacy-widget-child',
        target: {
          type: 'folder-child',
          viewId: 'view-2',
          folderId: 'folder-2',
          childId: 'legacy-widget-child',
          placement: 'folder',
          content: { kind: 'widget', id: 'widget-legacy-child' },
        },
      });
    });

    await waitFor(() => {
      expect(useCanvasStore.getState()._hydrated).toBe(true);
      expect(useCanvasStore.getState().focusedFolder?.id).toBe('folder-2');
      expect(useCanvasStore.getState().focusedNode).toBeNull();
      expect(
        document.querySelector(
          '[data-id="folderExpandedChild:folder-2:legacy-widget-child"]'
        )
      ).not.toBeNull();
      expect(useCanvasStore.getState().pendingSearchTarget).toBeNull();
    });
  });

  it('clears a folder-child search target if the folder never mounts', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: 'Search Folder',
            children: [
              {
                id: 'child-1',
                type: 'card',
                data: { title: 'Search child' },
              },
            ],
          },
        },
      ],
      edges: [],
    });

    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('Search Folder')).toBeInTheDocument();
    });

    vi.useFakeTimers();
    vi.spyOn(document, 'querySelector').mockReturnValue(null);
    act(() => {
      useCanvasStore.getState().setPendingSearchTarget({
        viewId: 'default',
        nodeId: 'child-1',
        target: {
          type: 'folder-child',
          viewId: 'default',
          folderId: 'folder-1',
          childId: 'child-1',
          placement: 'folder',
        },
      });
    });

    expect(useCanvasStore.getState().pendingSearchTarget).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(useCanvasStore.getState().pendingSearchTarget).toBeNull();
    vi.useRealTimers();
  });

  it('does not open the focused view on a modifier-click (selection only)', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    // Shift-click is reserved for adjusting selection, so it must not open.
    fireEvent.click(
      screen.getByRole('button', { name: 'Shift-click focused node' })
    );

    expect(screen.queryByText('Focused loaded-1')).toBeNull();
  });

  it('drops the selection change from a plain click on a node', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    // Pressing down on a node (no modifier) arms suppression; the pure
    // selection change React Flow would emit for that click is then dropped
    // before it reaches the selection pipeline.
    const element = document.querySelector('[data-id="loaded-1"]');
    fireEvent.pointerDown(element!);
    fireEvent.click(screen.getByRole('button', { name: 'Apply RF selection' }));

    expect(helperLineMocks.onNodesChange).not.toHaveBeenCalled();
  });

  it('keeps selection changes from marquee/modifier interactions', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(screen.getByText('Loaded Card')).toBeInTheDocument();
    });

    // A press that does not originate on a node (marquee on the pane) leaves
    // suppression off, so the selection change flows through untouched.
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Apply RF selection' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply RF selection' }));

    expect(helperLineMocks.onNodesChange).toHaveBeenCalledWith([
      { id: 'loaded-1', selected: true, type: 'select' },
    ]);
  });

  it('enables 24px snap-to-grid dragging', async () => {
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

  it('keeps a pane click from zooming while closing an expanded folder', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(reactFlowMocks.props).toHaveBeenCalledWith(
        expect.objectContaining({ zoomOnDoubleClick: false })
      );
    });
  });

  it('disables snap-to-grid dragging from app settings', async () => {
    useAppSettingsStore.setState({
      canvasSnapToGrid: false,
    });
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

  it('temporarily elevates dragged cards above a folder drop target without changing stored z-order', async () => {
    nodeDragMocks.dropTargetId = 'folder-high';
    nodeDragMocks.draggingNodeIds = ['card-low'];
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'card-low',
          type: 'card',
          position: { x: 0, y: 0 },
          zIndex: 1,
          data: { title: 'Low Card', content: '', color: '#fff' },
        },
        {
          id: 'folder-high',
          type: 'folder',
          position: { x: 100, y: 100 },
          selected: true,
          zIndex: 5000,
          data: { title: 'High Folder', subtitle: '', children: [] },
        },
      ],
      edges: [],
    });
    render(<CanvasRoute />);

    await waitFor(() => {
      const calls = reactFlowMocks.props.mock.calls;
      const lastProps = calls.at(-1)?.[0] as
        | {
            nodes: Array<{
              id: string;
              zIndex?: number;
            }>;
          }
        | undefined;
      const renderedCard = lastProps?.nodes.find(
        (node) => node.id === 'card-low'
      );
      const renderedFolder = lastProps?.nodes.find(
        (node) => node.id === 'folder-high'
      );

      expect(renderedCard?.zIndex).toBeGreaterThan(
        (renderedFolder?.zIndex ?? 0) + 1000
      );
    });

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'card-low')
    ).toMatchObject({ zIndex: 1 });
  });

  it('temporarily elevates dragged cards above a group drop target without changing stored z-order', async () => {
    nodeDragMocks.dropTargetId = 'group-high';
    nodeDragMocks.draggingNodeIds = ['card-low'];
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'card-low',
          type: 'card',
          position: { x: 0, y: 0 },
          zIndex: 1,
          data: { title: 'Low Card', content: '', color: '#fff' },
        },
        {
          id: 'group-high',
          type: 'group',
          position: { x: 100, y: 100 },
          selected: true,
          zIndex: 5000,
          data: { label: 'High Group', color: 'blue' },
        },
      ],
      edges: [],
    });
    render(<CanvasRoute />);

    await waitFor(() => {
      const calls = reactFlowMocks.props.mock.calls;
      const lastProps = calls.at(-1)?.[0] as
        | {
            nodes: Array<{
              id: string;
              zIndex?: number;
            }>;
          }
        | undefined;
      const renderedCard = lastProps?.nodes.find(
        (node) => node.id === 'card-low'
      );
      const renderedGroup = lastProps?.nodes.find(
        (node) => node.id === 'group-high'
      );

      expect(renderedCard?.zIndex).toBeGreaterThan(
        (renderedGroup?.zIndex ?? 0) + 1000
      );
    });

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'card-low')
    ).toMatchObject({ zIndex: 1 });
  });

  it('shows an empty canvas guide for empty manifests', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce({ nodes: [], edges: [] });
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

  it('creates widget records from the bottom create menu', async () => {
    rpcMocks.rpcCreateWidget.mockResolvedValueOnce({
      success: true,
      widget: {
        schema: 'ghostboard-widget/v1',
        id: 'widget_menu_pomodoro',
        kind: 'pomodoro',
        title: 'pomodoro',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
        data: {
          mode: 'focus',
          status: 'idle',
          durationMs: 1_500_000,
          remainingMs: 1_500_000,
          focusDurationMs: 1_500_000,
          shortBreakMs: 300_000,
          longBreakMs: 900_000,
          completedFocusCount: 0,
        },
      },
    });
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pomodoro' }));

    await waitFor(() => {
      expect(rpcMocks.rpcCreateExtensionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasTypeId: 'ghostboard.productivity/pomodoro',
        })
      );
    });
  });

  it('creates completed recordings at the canvas context-menu anchor', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open canvas menu' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: NEW_RE }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recording' }));

    expect(recordingMocks.lastRecorderProps?.recordingNumber).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }));

    await waitFor(() => {
      expect(recordingMocks.saveRecording).toHaveBeenCalledWith({
        blob: expect.any(Blob),
        durationMs: 1000,
        mimeType: 'audio/mp4',
        recordingNumber: 1,
      });
      expect(rpcMocks.rpcCreateExtensionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasTypeId: 'ghostboard.media/recording',
          state: expect.objectContaining({
            attachmentFile: 'attachments/recording-1.m4a',
            fileName: 'recording-1.m4a',
            mimeType: 'audio/mp4',
            recordingNumber: 1,
          }),
        })
      );
    });
  });

  it('numbers recordings after existing folder-child recordings', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce({
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: {
            title: 'Folder',
            subtitle: '',
            children: [
              {
                id: 'recording-child',
                type: 'recording',
                data: {
                  fileName: 'recording-4.m4a',
                  mimeType: 'audio/mp4',
                  recordingNumber: 4,
                  title: '',
                },
              },
            ],
          },
        },
      ],
      edges: [],
    });
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recording' }));

    expect(recordingMocks.lastRecorderProps?.recordingNumber).toBe(5);
  });

  it('keeps the recorder open while the previous save is still pending', async () => {
    let resolveSave!: (value: {
      attachmentFile: string;
      color: string;
      fileName: string;
      mimeType: string;
      recordingNumber: number;
      title: string;
    }) => void;
    recordingMocks.saveRecording.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recording' }));

    expect(recordingMocks.lastRecorderProps?.recordingNumber).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }));

    // Overlay stays up while save is in flight so a hang never looks like a
    // silent no-op. Number is already reserved, so the next open gets #2.
    await waitFor(() => {
      expect(recordingMocks.saveRecording).toHaveBeenCalled();
    });
    expect(
      screen.getByRole('button', { name: 'Finish recording' })
    ).toBeInTheDocument();
    expect(recordingMocks.lastRecorderProps?.recordingNumber).toBe(1);

    resolveSave({
      attachmentFile: 'attachments/recording-1.m4a',
      color: '#FFFFFF',
      fileName: 'recording-1.m4a',
      mimeType: 'audio/mp4',
      recordingNumber: 1,
      title: '',
    });

    await waitFor(() => {
      expect(rpcMocks.rpcCreateExtensionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasTypeId: 'ghostboard.media/recording',
          state: expect.objectContaining({
            recordingNumber: 1,
          }),
        })
      );
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Finish recording' })).toBe(
        null
      );
    });
  });

  it('uses the localized recording save failure toast', async () => {
    recordingMocks.saveRecording.mockRejectedValueOnce(new Error('disk full'));
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button').at(-1)!);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Recording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish recording' }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Localized recording save failed'
      );
    });
  });

  it('creates link nodes from the create menu URL form', async () => {
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

    await waitFor(() => {
      expect(rpcMocks.rpcCreateExtensionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasTypeId: 'ghostboard.web/link',
          state: expect.objectContaining({
            url: 'https://example.com/docs',
            title: 'example.com',
          }),
        })
      );
    });
  });

  it('creates link nodes from pasted URLs when the canvas is idle', async () => {
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
    await waitFor(() => {
      expect(rpcMocks.rpcCreateExtensionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasTypeId: 'ghostboard.web/link',
          state: expect.objectContaining({
            url: 'https://example.com/pasted',
            title: 'example.com',
          }),
        })
      );
    });
  });

  it('creates asset nodes from dropped files', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Drop file' }));

    await waitFor(() => {
      expect(
        assetFileMocks.saveAssetFileWithProgressToast
      ).toHaveBeenCalledWith(expect.objectContaining({ name: 'notes.txt' }));
      expect(rpcMocks.rpcCreateExtensionInstance).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasTypeId: 'ghostboard.media/file',
          state: expect.objectContaining({
            attachmentFile: 'attachments/file_abc.txt',
            fileName: 'notes.txt',
            title: 'notes.txt',
          }),
        })
      );
    });
  });

  it('imports canvas JSON files with cloned widget records', async () => {
    rpcMocks.rpcCreateWidget.mockResolvedValueOnce({
      success: true,
      widget: {
        schema: 'ghostboard-widget/v1',
        id: 'widget_imported_new',
        kind: 'checklist',
        title: 'Imported Checklist',
        createdAt: '2026-07-08T01:00:00.000Z',
        updatedAt: '2026-07-08T01:00:00.000Z',
        data: { items: [] },
      },
    });
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Drop canvas JSON' }));

    await waitFor(() => {
      expect(rpcMocks.rpcCreateWidget).toHaveBeenCalledWith(
        'checklist',
        'Imported Checklist'
      );
      expect(rpcMocks.rpcSaveWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'widget_imported_new',
          title: 'Imported Checklist',
          data: {
            items: [
              {
                id: 'item_exported',
                text: 'Imported task',
                checked: false,
              },
            ],
          },
        })
      );
    });

    expect(
      assetFileMocks.saveAssetFileWithProgressToast
    ).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'widget',
          position: { x: 320, y: 420 },
          data: { widgetId: 'widget_imported_new', kind: 'checklist' },
          selected: true,
        }),
      ])
    );
  });

  it('logs dropped file import failures instead of swallowing them', async () => {
    const importError = new Error('import failed');
    assetFileMocks.saveAssetFileWithProgressToast.mockRejectedValueOnce(
      importError
    );
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
      expect(toastMocks.success).toHaveBeenCalledWith('PNG exported.');
    });
  });

  it('exports the current canvas as JSON from the toolbar', async () => {
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
      expect(toastMocks.success).toHaveBeenCalledWith('JSON exported.');
    });
  });

  it('ignores disk viewport from loadCanvas and cold-starts without session cache', async () => {
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
      // Legacy manifests may still contain viewport; renderer must ignore it.
      viewport: { x: 42, y: 84, zoom: 1.25 },
    });
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(useCanvasStore.getState()._hydrated).toBe(true);
      expect(useCanvasStore.getState().viewport).toBeNull();
      expect(useCanvasStore.getState().sessionViewport).toBeNull();
    });
  });

  it('writes user-driven viewport moves to the session cache during suppression windows', async () => {
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
    });

    const initialViewport = { x: 0, y: 0, zoom: 1 };
    useCanvasStore.setState({
      viewport: initialViewport,
      sessionViewport: initialViewport,
    });

    suppressViewportPersist(300);
    const lastProps = reactFlowMocks.props.mock.calls.at(-1)?.[0] as {
      onMoveEnd?: (
        event: MouseEvent | TouchEvent | null,
        viewport: { x: number; y: number; zoom: number }
      ) => void;
    };
    lastProps.onMoveEnd?.({} as MouseEvent, { x: 500, y: 600, zoom: 0.5 });

    expect(useCanvasStore.getState().viewport).toEqual({
      x: 500,
      y: 600,
      zoom: 0.5,
    });
    expect(useCanvasStore.getState().sessionViewport).toEqual({
      x: 500,
      y: 600,
      zoom: 0.5,
    });
  });

  it('seeds initial nodes when no manifest exists and rpc is available', async () => {
    rpcMocks.loadCanvas.mockResolvedValueOnce(null);
    rpcMocks.isRpcAvailable.mockResolvedValueOnce(true);
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(useCanvasStore.getState()._hydrated).toBe(true);
    });

    // Missing manifests still seed the first-run canvas; explicit empty
    // manifests stay empty and show the empty-canvas guide.
    expect(useCanvasStore.getState().nodes.length).toBeGreaterThan(0);
    expect(rpcMocks.rpcCreateWidget).toHaveBeenCalledWith(
      'checklist',
      'Prio before launch'
    );
    expect(rpcMocks.rpcCreateWidget).toHaveBeenCalledWith('checklist', 'Bugs');
    expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    const savedNodes = rpcMocks.rpcSaveManifest.mock.calls[0]?.[1] as Array<{
      data: Record<string, unknown>;
      id: string;
      type: string;
    }>;
    expect(savedNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-init0003',
          type: 'widget',
          data: { widgetId: 'widget_seed_prio', kind: 'checklist' },
        }),
        expect.objectContaining({
          id: 'node-init0008',
          type: 'widget',
          data: { widgetId: 'widget_seed_bugs', kind: 'checklist' },
        }),
      ])
    );
  });

  it('keeps loading state when load fails and does not focus without rect', async () => {
    rpcMocks.loadCanvas.mockRejectedValueOnce(new Error('failed load'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(rpcMocks.loadCanvas).toHaveBeenCalledWith('default');
      expect(useCanvasStore.getState().nodes.length).toBeGreaterThan(0);
    });

    expect(rpcMocks.rpcSaveManifest).not.toHaveBeenCalled();
    expect(screen.queryByText('Loaded Card')).toBeNull();
  });

  it('does not open focused node when the selected element has no rect', async () => {
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
    render(<CanvasRoute />);

    await waitFor(() => {
      expect(reactFlowMocks.props).toHaveBeenCalled();
    });

    expect(
      reactFlowMocks.props.mock.calls.at(-1)?.[0]?.connectionLineComponent
    ).toBeTypeOf('function');
  });
});
