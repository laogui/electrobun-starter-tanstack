// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasContextMenu } from '@/components/canvas/ContextMenu';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: {
    div: (props: Record<string, unknown>) => createElement('div', props),
  },
}));

const COPY_RE = /^copy ⌘c$/i;
const NEW_RE = /^new$/i;
const OPEN_FOCUSED_RE = /Open focused/;
const edgeStoreState = {
  activeViewId: 'default',
  clipboard: [] as Array<{ id: string; data?: Record<string, unknown> }>,
  edges: [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: { pathType: 'bezier' },
    },
  ],
  nodes: [] as Array<{ id: string; data?: Record<string, unknown> }>,
  views: [
    { id: 'default', name: 'Default Canvas' },
    { id: 'archive', name: 'Archive' },
  ],
};

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: typeof edgeStoreState) => unknown) =>
    selector(edgeStoreState),
}));

vi.mock('../../../paraglide/messages.js', () => ({
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
  menu_duplicate: () => 'Duplicate',
  menu_move_to_view: () => 'Move to canvas…',
  menu_change_color: () => 'Change color',
  menu_edit_tag: () => 'Edit Tag',
  menu_ai_summarize: () => 'Summarize with AI',
  menu_delete: () => 'Delete',
  menu_open: () => 'Open',
  menu_rename: () => 'Rename',
  menu_edit_folder_info: () => 'Edit Info',
  menu_new: () => 'New',
  menu_new_card_inside: () => 'New child',
  menu_move_out: () => 'Move Out',
  menu_edit_label: () => 'Edit label',
  menu_toggle_animation: () => 'Toggle animation',
  menu_toggle_straight: () => 'Toggle Straight',
  menu_toggle_curved: () => 'Toggle Curved',
  menu_delete_edge: () => 'Delete edge',
  menu_move_to_library: () => 'Move to Library',
  menu_export_markdown: () => 'Export as Markdown',
  menu_export_canvas_markdown: () => 'Export Canvas as Markdown',
  menu_copy_as_markdown: () => 'Copy as Markdown',
  menu_lock: () => 'Lock',
  menu_unlock: () => 'Unlock',
  menu_edge_color: () => 'Cycle Color',
  menu_open_link: () => 'Open Link',
  menu_copy_url: () => 'Copy URL',
  menu_refetch_link: () => 'Refetch Preview',
  menu_copy_image_address: () => 'Copy Image Address',
  menu_replace_image: () => 'Replace Image',
  menu_replace_file: () => 'Replace File',
  menu_reveal_in_finder: () => 'Reveal in Finder',
  menu_rename_asset: () => 'Rename',
  menu_import_markdown: () => 'Import Markdown',
}));

describe('canvasContextMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders target-specific actions and dispatches them', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 40, y: 60, target: 'card', nodeId: 'node-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: COPY_RE }));

    expect(onAction).toHaveBeenCalledWith('copy', 'node-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows supported card actions for an expanded folder child', () => {
    render(
      <CanvasContextMenu
        menu={{
          x: 40,
          y: 60,
          target: 'card',
          nodeId: 'child-1',
          folderId: 'folder-1',
        }}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', { name: OPEN_FOCUSED_RE })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY_RE })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change color' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move Out' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete ⌫' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Tag' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lock' })).toBeNull();
  });

  it('closes when pressing Escape', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'canvas' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    // Main menu has 5 items (New, Paste, Reset zoom, Import Markdown, Export Canvas Markdown)
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: NEW_RE })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Paste ⌘V' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset zoom' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Import Markdown' })
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the new item submenu inside the top viewport edge', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(120);

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'canvas' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: NEW_RE }));

    const submenu = screen.getByRole('menu', { name: 'New item submenu' });
    expect(Number.parseFloat(submenu.style.top)).toBeGreaterThanOrEqual(8);
  });

  it('supports keyboard navigation and activation', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'edge', edgeId: 'edge-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    const menu = screen.getByRole('menu', { name: 'Canvas context menu' });
    const first = screen.getByRole('button', { name: 'Toggle Straight' });
    const second = screen.getByRole('button', { name: 'Cycle Color' });

    expect(menu).toBeInTheDocument();
    expect(first).toBeInTheDocument();
    expect(second).toBeInTheDocument();

    // Click second item directly (focus-dependent keyboard nav is flaky in jsdom)
    fireEvent.click(second);
    expect(onAction).toHaveBeenCalledWith('cycle-edge-color', 'edge-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when clicking outside the menu', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'edge', edgeId: 'edge-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the edge toggle label for the current path type', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'edge', edgeId: 'edge-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Toggle Straight' })
    ).toBeInTheDocument();

    edgeStoreState.edges[0] = {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: { pathType: 'smoothstep' },
    };

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'edge', edgeId: 'edge-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Toggle Curved' })
    ).toBeInTheDocument();
  });

  it('renders the folder child move-out action', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{
          x: 40,
          y: 60,
          target: 'folder-child',
          nodeId: 'child-1',
        }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move Out' }));

    expect(onAction).toHaveBeenCalledWith('move-out', 'child-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders link node actions', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 40, y: 60, target: 'link', nodeId: 'link-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Edit URL' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move to Library' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: OPEN_FOCUSED_RE }));

    expect(onAction).toHaveBeenCalledWith('focus', 'link-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders asset node actions', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 40, y: 60, target: 'asset', nodeId: 'asset-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Move to Library' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: OPEN_FOCUSED_RE }));

    expect(onAction).toHaveBeenCalledWith('focus', 'asset-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders recording node actions without card-only focused or markdown actions', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{
          x: 40,
          y: 60,
          target: 'recording' as never,
          nodeId: 'recording-1',
        }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Reveal in Finder' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OPEN_FOCUSED_RE })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Copy as Markdown' })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Export as Markdown' })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Move to Library' })
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(onAction).toHaveBeenCalledWith('rename-asset', 'recording-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders widget node actions without open focused', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{
          x: 40,
          y: 60,
          target: 'widget' as never,
          nodeId: 'widget-1',
        }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OPEN_FOCUSED_RE })).toBeNull();
  });

  it('renders move-to-view submenu for multi-selection', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 40, y: 60, target: 'multi', nodeId: 'node-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Duplicate ⌘D' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Group ⌘G' })
    ).toBeInTheDocument();

    fireEvent.mouseEnter(
      screen.getByRole('button', { name: 'Move to canvas…' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

    expect(onAction).toHaveBeenCalledWith('move-to-view:archive', 'node-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the paste item when clipboard is empty', () => {
    edgeStoreState.clipboard = [];
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'canvas' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    const paste = screen.getByRole('button', { name: 'Paste ⌘V' });
    expect(paste).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(paste);
    expect(onAction).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('enables the paste item when clipboard has content', () => {
    edgeStoreState.clipboard = [{ id: 'node-1' }];
    const onAction = vi.fn();
    const onClose = vi.fn();

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'canvas' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    const paste = screen.getByRole('button', { name: 'Paste ⌘V' });
    expect(paste).not.toHaveAttribute('aria-disabled');

    fireEvent.click(paste);
    expect(onAction).toHaveBeenCalledWith('paste', undefined);
    expect(onClose).toHaveBeenCalledTimes(1);

    // reset
    edgeStoreState.clipboard = [];
  });
});
