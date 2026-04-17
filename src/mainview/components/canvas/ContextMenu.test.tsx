// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasContextMenu } from '@/components/canvas/ContextMenu';

const COPY_RE = /copy/i;

vi.mock('../../../paraglide/messages.js', () => ({
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
});
