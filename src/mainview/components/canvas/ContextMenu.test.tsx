// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasContextMenu } from '@/components/canvas/ContextMenu';

const COPY_RE = /copy/i;
const NEW_NOTE_RE = /new note/i;
const OPEN_FOCUSED_RE = /Open focused/;
const edgeStoreState = {
  edges: [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      data: { pathType: 'bezier' },
    },
  ],
};

vi.mock('@/store/canvasStore', () => ({
  useCanvasStore: (selector: (state: typeof edgeStoreState) => unknown) =>
    selector(edgeStoreState),
}));

vi.mock('../../../paraglide/messages.js', () => ({
  menu_new_note: () => 'New note',
  menu_new_checklist: () => 'New checklist',
  menu_new_sticky: () => 'New sticky',
  menu_new_image: () => 'New image',
  menu_new_folder: () => 'New folder',
  menu_new_group: () => 'New group',
  menu_paste: () => 'Paste',
  menu_reset_zoom: () => 'Reset zoom',
  menu_open_focused: () => 'Open focused',
  menu_copy: () => 'Copy',
  menu_change_color: () => 'Change color',
  menu_delete: () => 'Delete',
  menu_open: () => 'Open',
  menu_rename: () => 'Rename',
  menu_new_card_inside: () => 'New child',
  menu_move_out: () => 'Move Out',
  menu_edit_label: () => 'Edit label',
  menu_toggle_animation: () => 'Toggle animation',
  menu_toggle_straight: () => 'Toggle Straight',
  menu_toggle_curved: () => 'Toggle Curved',
  menu_delete_edge: () => 'Delete edge',
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

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Paste ⌘V' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset zoom' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: NEW_NOTE_RE })
    ).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

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

    fireEvent.click(screen.getByRole('button', { name: OPEN_FOCUSED_RE }));

    expect(onAction).toHaveBeenCalledWith('focus', 'asset-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
