// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: (props: Record<string, unknown>) =>
    createElement('a', { href: props.to as string }, props.children as string),
}));

import { ViewSwitcher } from '@/components/canvas/ViewSwitcher';
import type { CreatableCanvasNodeKind } from '@/lib/contentTypes';
import { type CreateNodeOptions, useCanvasStore } from '@/store/canvasStore';

const saveAssetFileWithProgressToastMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/assetImportProgress', () => ({
  saveAssetFileWithProgressToast: saveAssetFileWithProgressToastMock,
}));

const rpcMocks = vi.hoisted(() => ({
  isRpcAvailable: vi.fn(),
  loadCanvas: vi.fn(),
  rpcCreateView: vi.fn(),
  rpcCreateViewFromTemplate: vi.fn(),
  rpcDeleteView: vi.fn(),
  rpcImportMarkdownFiles: vi.fn(),
  rpcListViews: vi.fn(),
  rpcRenameView: vi.fn(),
  rpcRestoreView: vi.fn(),
  rpcSaveManifest: vi.fn(),
  rpcSetActiveView: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  isRpcAvailable: rpcMocks.isRpcAvailable,
  loadCanvas: rpcMocks.loadCanvas,
  rpcCreateView: rpcMocks.rpcCreateView,
  rpcCreateViewFromTemplate: rpcMocks.rpcCreateViewFromTemplate,
  rpcDeleteView: rpcMocks.rpcDeleteView,
  rpcImportMarkdownFiles: rpcMocks.rpcImportMarkdownFiles,
  rpcListViews: rpcMocks.rpcListViews,
  rpcRenameView: rpcMocks.rpcRenameView,
  rpcRestoreView: rpcMocks.rpcRestoreView,
  rpcSaveManifest: rpcMocks.rpcSaveManifest,
  rpcSetActiveView: rpcMocks.rpcSetActiveView,
}));

vi.mock('sonner', () => {
  const toastFn = vi.fn() as unknown as {
    (msg: string, opts?: unknown): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  return { toast: toastFn };
});

vi.mock('../../../paraglide/messages.js', () => ({
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
  menu_more: () => 'More',
  menu_note_library: () => 'Note Library',
  menu_import_markdown: () => 'Import Markdown',
  toast_markdown_imported: ({ count }: { count: number }) =>
    `Imported ${count}`,
  toast_markdown_import_failed: () => 'Import failed',
  toast_markdown_import_partial: ({
    imported,
    failed,
  }: {
    imported: number;
    failed: number;
  }) => `Imported ${imported}, failed ${failed}`,
  menu_new_note: () => 'New Note',
  menu_new_checklist: () => 'New Checklist',
  menu_new_sticky: () => 'New Sticky',
  menu_new_image: () => 'New Image',
  menu_new_link: () => 'New Link',
  menu_new_folder: () => 'New Folder',
  menu_new_group: () => 'New Group',
  menu_new_file: () => 'New File',
  menu_recording: () => 'Recording',
  menu_new_recording: () => 'New Recording',
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
  view_node_count_one: () => '1 node',
  view_node_count_other: ({ count }: { count: number }) => `${count} nodes`,
  view_rename_empty: () => 'Name cannot be empty',
  view_rename_too_long: () => 'Name is too long',
  view_rename_duplicate: () => 'A view with this name already exists',
  templates_browse_all: () => 'Browse all templates…',
  template_quick_start_name: () => 'Quick Start',
  template_weekly_planner_name: () => 'Weekly Planner',
  template_kanban_name: () => 'Kanban Board',
  template_sprint_retro_name: () => 'Sprint Retro',
  template_brainstorm_mindmap_name: () => 'Brainstorm Mindmap',
  template_eisenhower_matrix_name: () => 'Eisenhower Matrix',
  template_reading_notes_name: () => 'Reading Notes',
  template_demo_name: () => 'Demo Canvas',
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
    _hydrated: true,
  });
};

const renderViewSwitcher = ({
  createMenuOpen = false,
  onCreateNode = vi.fn(),
  onOpenImagePicker = vi.fn(),
  onOpenRecorder = vi.fn(),
  setCreateMenuOpen = vi.fn(),
}: {
  createMenuOpen?: boolean;
  onCreateNode?: (
    type: CreatableCanvasNodeKind,
    options?: CreateNodeOptions
  ) => void;
  onOpenImagePicker?: () => void;
  onOpenRecorder?: () => void;
  setCreateMenuOpen?: (v: boolean) => void;
} = {}) =>
  render(
    <ViewSwitcher
      createMenuOpen={createMenuOpen}
      onCreateNode={onCreateNode}
      onOpenImagePicker={onOpenImagePicker}
      onOpenRecorder={onOpenRecorder}
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
    rpcMocks.rpcCreateViewFromTemplate.mockReset();
    rpcMocks.rpcDeleteView.mockReset();
    rpcMocks.rpcImportMarkdownFiles.mockReset();
    rpcMocks.rpcRenameView.mockReset();
    saveAssetFileWithProgressToastMock.mockReset();

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
      trashId: 'trash_test',
    });
    rpcMocks.rpcImportMarkdownFiles.mockResolvedValue({
      canceled: true,
      notes: [],
    });
    rpcMocks.rpcRestoreView.mockReset();
    rpcMocks.rpcRestoreView.mockResolvedValue({
      success: true,
      view: {
        id: 'focus',
        name: 'Focus Mode',
        file: 'views/focus.canvas.json',
      },
      activeViewId: 'default',
    });
    rpcMocks.rpcRenameView.mockResolvedValue({ success: true });
    rpcMocks.rpcSetActiveView.mockReset();
    rpcMocks.rpcSetActiveView.mockResolvedValue({ success: true });
    rpcMocks.rpcCreateViewFromTemplate.mockResolvedValue({
      id: 'view-tpl',
      name: 'Canvas 3',
    });
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
        [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
        undefined
      );
      // ViewSwitcher no longer loads the new canvas; index.tsx's effect handles that
      expect(useCanvasStore.getState().activeViewId).toBe('focus');
      expect(useCanvasStore.getState()._hydrated).toBe(false);
    });
  });

  it('flushes the current viewport when switching views', async () => {
    useCanvasStore.setState({
      viewport: { x: 12, y: 34, zoom: 0.8 },
      persistedViewport: { x: 12, y: 34, zoom: 0.8 },
    });
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalledTimes(1);
      expect(useCanvasStore.getState().views).toHaveLength(2);
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Focus Mode' }));

    await waitFor(() => {
      expect(rpcMocks.rpcSaveManifest).toHaveBeenCalledTimes(1);
    });

    const lastCall = rpcMocks.rpcSaveManifest.mock.calls.at(-1);
    expect(lastCall?.[3]).toEqual({ x: 12, y: 34, zoom: 0.8 });
  });

  it('creates a new view and switches to it', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    // "New Canvas" is now a submenu trigger
    fireEvent.click(screen.getByText('New Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Blank Canvas' }));

    await waitFor(() => {
      expect(rpcMocks.rpcCreateView).toHaveBeenCalledWith('Canvas 3');
      expect(
        useCanvasStore
          .getState()
          .views.some((view: { id: string }) => view.id === 'view-2')
      ).toBe(true);
      expect(useCanvasStore.getState().activeViewId).toBe('view-2');
    });
    expect(await screen.findByDisplayValue('Canvas 3')).toBeInTheDocument();
  });

  it('keeps every view when rapid blank canvas creates resolve from the same render', async () => {
    let resolveFirst:
      | ((value: { id: string; name: string }) => void)
      | undefined;
    let resolveSecond:
      | ((value: { id: string; name: string }) => void)
      | undefined;
    rpcMocks.rpcCreateView
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          })
      );

    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByText('New Canvas'));
    const blankCanvasItem = screen.getByRole('menuitem', {
      name: 'Blank Canvas',
    });
    fireEvent.click(blankCanvasItem);
    fireEvent.click(blankCanvasItem);

    await act(async () => {
      resolveFirst?.({ id: 'view-a', name: 'Canvas 3' });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        useCanvasStore
          .getState()
          .views.some((view: { id: string }) => view.id === 'view-a')
      ).toBe(true);
    });

    await act(async () => {
      resolveSecond?.({ id: 'view-b', name: 'Canvas 3' });
      await Promise.resolve();
    });

    await waitFor(() => {
      const viewIds = useCanvasStore
        .getState()
        .views.map((view: { id: string }) => view.id);
      expect(viewIds).toEqual(
        expect.arrayContaining(['default', 'focus', 'view-a', 'view-b'])
      );
    });
  });

  it('creates a canvas from any quick template via the submenu', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByText('New Canvas'));
    expect(
      screen.getByRole('menuitem', { name: 'Quick Start' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Weekly Planner' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Brainstorm Mindmap' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quick Start' }));

    await waitFor(() => {
      expect(rpcMocks.rpcCreateViewFromTemplate).toHaveBeenCalledWith(
        'Canvas 3',
        'quick-start'
      );
      expect(
        useCanvasStore
          .getState()
          .views.some((view: { id: string }) => view.id === 'view-tpl')
      ).toBe(true);
      expect(useCanvasStore.getState().activeViewId).toBe('view-tpl');
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

  it('deletes a non-active view after confirming the dialog', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Focus Mode' }));

    // Dialog is open — rpc must not have been called yet
    expect(rpcMocks.rpcDeleteView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Canvas' }));

    await waitFor(() => {
      expect(rpcMocks.rpcDeleteView).toHaveBeenCalledWith('focus');
      expect(useCanvasStore.getState().views).toEqual([
        { id: 'default', name: 'Default Canvas' },
      ]);
    });
  });

  it('cancels deletion when the dialog Cancel button is clicked', async () => {
    renderViewSwitcher();
    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Focus Mode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(rpcMocks.rpcDeleteView).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().views).toEqual([
      { id: 'default', name: 'Default Canvas' },
      { id: 'focus', name: 'Focus Mode' },
    ]);
  });

  it('keeps state unchanged when create rpc calls return null', async () => {
    rpcMocks.rpcCreateView.mockResolvedValueOnce(null);

    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByText('New Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Blank Canvas' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Delete Canvas' }));

    await waitFor(() => {
      expect(useCanvasStore.getState().views).toEqual([
        { id: 'default', name: 'Default Canvas' },
        { id: 'focus', name: 'Focus Mode' },
      ]);
    });
  });

  it('aborts the view switch when the pre-switch flush fails', async () => {
    rpcMocks.rpcSaveManifest.mockResolvedValueOnce({ success: false });

    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Focus Mode' }));

    await waitFor(() => {
      expect(rpcMocks.rpcSaveManifest).toHaveBeenCalled();
    });

    const { toast } = await import('sonner');
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Could not save the current canvas — switch canceled.'
      );
    });
    expect(useCanvasStore.getState().activeViewId).toBe('default');
    expect(rpcMocks.rpcSetActiveView).not.toHaveBeenCalled();
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

  it('creates supported nodes from the create menu', async () => {
    const onCreateNode = vi.fn();
    const onOpenImagePicker = vi.fn();
    const onOpenRecorder = vi.fn();
    renderViewSwitcher({
      createMenuOpen: true,
      onCreateNode,
      onOpenImagePicker,
      onOpenRecorder,
    });

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Image' }));
    expect(onOpenImagePicker).toHaveBeenCalledTimes(1);
    expect(onCreateNode).not.toHaveBeenCalledWith('image');

    const fileItem = screen.getByRole('menuitem', { name: 'File' });
    expect(fileItem).not.toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Recording' }));
    expect(onOpenRecorder).toHaveBeenCalledTimes(1);
    expect(onCreateNode).not.toHaveBeenCalledWith('recording');
  });

  it('opens the renderer picker and creates one asset per selected file', async () => {
    const onCreateNode = vi.fn();
    const firstAssetData = {
      attachmentFile: 'attachments/file_abc.txt',
      color: '#FFFFFF',
      fileName: 'notes.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'notes.txt',
    };
    const secondAssetData = {
      ...firstAssetData,
      attachmentFile: 'attachments/file_def.txt',
      fileName: 'tasks.txt',
      title: 'tasks.txt',
    };
    saveAssetFileWithProgressToastMock
      .mockResolvedValueOnce(firstAssetData)
      .mockResolvedValueOnce(secondAssetData);

    const { container } = renderViewSwitcher({
      createMenuOpen: true,
      onCreateNode,
    });
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const inputClick = vi.spyOn(input, 'click');
    const firstFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const secondFile = new File(['tasks'], 'tasks.txt', { type: 'text/plain' });

    fireEvent.click(screen.getByRole('menuitem', { name: 'File' }));

    expect(inputClick).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('multiple');

    fireEvent.change(input, { target: { files: [firstFile, secondFile] } });

    await waitFor(() => {
      expect(saveAssetFileWithProgressToastMock).toHaveBeenNthCalledWith(
        1,
        firstFile
      );
      expect(saveAssetFileWithProgressToastMock).toHaveBeenNthCalledWith(
        2,
        secondFile
      );
      expect(onCreateNode).toHaveBeenNthCalledWith(1, 'asset', {
        data: firstAssetData,
      });
      expect(onCreateNode).toHaveBeenNthCalledWith(2, 'asset', {
        data: secondAssetData,
      });
    });
  });

  it('continues importing selected files after one file fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onCreateNode = vi.fn();
    const savedAsset = {
      attachmentFile: 'attachments/file_def.txt',
      color: '#FFFFFF',
      fileName: 'tasks.txt',
      kind: 'file',
      mimeType: 'text/plain',
      size: 5,
      title: 'tasks.txt',
    };
    saveAssetFileWithProgressToastMock
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce(savedAsset);
    const { container } = renderViewSwitcher({ onCreateNode });
    const input = container.querySelector('input[type="file"]')!;
    const firstFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const secondFile = new File(['tasks'], 'tasks.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [firstFile, secondFile] } });

    await waitFor(() => {
      expect(saveAssetFileWithProgressToastMock).toHaveBeenNthCalledWith(
        2,
        secondFile
      );
      expect(onCreateNode).toHaveBeenCalledWith('asset', { data: savedAsset });
    });
  });

  it('imports markdown files from the create menu', async () => {
    const onCreateNode = vi.fn();
    rpcMocks.rpcImportMarkdownFiles.mockResolvedValueOnce({
      notes: [
        { noteId: 'note_imported_1', title: 'Imported One' },
        { noteId: 'note_imported_2', title: 'Imported Two' },
      ],
    });

    renderViewSwitcher({
      createMenuOpen: true,
      onCreateNode,
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Import Markdown' }));

    await waitFor(() => {
      expect(rpcMocks.rpcImportMarkdownFiles).toHaveBeenCalledTimes(1);
      expect(onCreateNode).toHaveBeenNthCalledWith(1, 'card', {
        data: {
          color: '#FFFFFF',
          content: undefined,
          noteId: 'note_imported_1',
          title: 'Imported One',
          type: 'text',
        },
        focusViewport: false,
      });
      expect(onCreateNode).toHaveBeenNthCalledWith(2, 'card', {
        data: {
          color: '#FFFFFF',
          content: undefined,
          noteId: 'note_imported_2',
          title: 'Imported Two',
          type: 'text',
        },
        focusViewport: true,
      });
    });
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

  it('shows node count label in the trigger (F1)', async () => {
    useCanvasStore.setState({
      nodes: [
        { id: 'n1', type: 'card', position: { x: 0, y: 0 }, data: {} },
        { id: 'n2', type: 'card', position: { x: 10, y: 10 }, data: {} },
      ],
    });
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    expect(screen.getByText('· 2 nodes')).toBeInTheDocument();
  });

  it('shows single-node label when only one node exists (F1)', async () => {
    useCanvasStore.setState({
      nodes: [{ id: 'n1', type: 'card', position: { x: 0, y: 0 }, data: {} }],
    });
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    expect(screen.getByText('· 1 node')).toBeInTheDocument();
  });

  it('blocks rename when name exceeds max length (F2)', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    const input = screen.getByDisplayValue('Focus Mode');
    const longName = 'a'.repeat(81);
    fireEvent.change(input, { target: { value: longName } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));

    expect(rpcMocks.rpcRenameView).not.toHaveBeenCalled();
    expect(screen.getByText('Name is too long')).toBeInTheDocument();
  });

  it('blocks rename when name duplicates an existing view (F2)', async () => {
    renderViewSwitcher();

    await waitFor(() => {
      expect(rpcMocks.rpcListViews).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByText('Default Canvas'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename Focus Mode' }));
    const input = screen.getByDisplayValue('Focus Mode');
    fireEvent.change(input, { target: { value: 'Default Canvas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rename' }));

    expect(rpcMocks.rpcRenameView).not.toHaveBeenCalled();
    expect(
      screen.getByText('A view with this name already exists')
    ).toBeInTheDocument();
  });
});
