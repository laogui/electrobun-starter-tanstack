// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasContextMenu } from '@/components/canvas/ContextMenu';

const COPY_RE = /copy/i;
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
  menu_edit_label: () => 'Edit label',
  menu_toggle_animation: () => 'Toggle animation',
  menu_toggle_straight: () => 'Toggle Straight',
  menu_toggle_curved: () => 'Toggle Curved',
  menu_delete_edge: () => 'Delete edge',
  menu_remove_arrow: () => 'Remove Arrow',
  menu_add_arrow: () => 'Add Arrow',
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
      ...edgeStoreState.edges[0],
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

  it('shows arrow toggle label based on edge markerEnd', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();

    edgeStoreState.edges[0] = {
      ...edgeStoreState.edges[0],
      data: { pathType: 'bezier' },
      markerEnd: undefined,
    };

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'edge', edgeId: 'edge-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Add Arrow' })
    ).toBeInTheDocument();

    edgeStoreState.edges[0] = {
      ...edgeStoreState.edges[0],
      markerEnd: { type: 'arrowclosed' } as never,
    };

    render(
      <CanvasContextMenu
        menu={{ x: 10, y: 10, target: 'edge', edgeId: 'edge-1' }}
        onAction={onAction}
        onClose={onClose}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Remove Arrow' })
    ).toBeInTheDocument();
  });
});
