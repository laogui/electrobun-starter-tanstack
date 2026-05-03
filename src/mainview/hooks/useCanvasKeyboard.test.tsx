// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasStore } from '@/store/canvasStore';

const PASTE_ID_RE = /^paste-/;

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
  toast_node_deleted: () => 'Card deleted',
  toast_nodes_deleted: ({ count }: { count: number }) =>
    `${count} cards deleted`,
  toast_edge_deleted: () => 'Connection deleted',
  toast_undo: () => 'Undo',
}));

const TestComponent = () => {
  useCanvasKeyboard();
  return <div>keyboard</div>;
};

const dispatchKeyboard = (eventInit: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...eventInit });
  globalThis.dispatchEvent(event);
  return event;
};

const resetStore = () => {
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    clipboard: [],
    createMenuOpen: false,
    editingEdgeId: null,
  });
};

describe('useCanvasKeyboard', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('deletes selected nodes on Delete', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({ key: 'Delete' });

    expect(useCanvasStore.getState().nodes).toEqual([]);
  });

  it('copies and pastes selected nodes with modifier shortcuts', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 10, y: 20 },
          data: { title: 'Copied', content: '', color: '#fff' },
          selected: true,
        },
      ],
    });

    render(<TestComponent />);

    dispatchKeyboard({ key: 'c', metaKey: true });
    expect(useCanvasStore.getState().clipboard).toHaveLength(1);

    dispatchKeyboard({ key: 'v', metaKey: true, cancelable: true });
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
    expect(useCanvasStore.getState().nodes[1]?.id).toMatch(PASTE_ID_RE);
  });

  it('calls undo and redo with the correct shortcuts', () => {
    const undo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const redo = vi.spyOn(useCanvasStore.getState(), 'redo');

    render(<TestComponent />);

    dispatchKeyboard({ key: 'z', ctrlKey: true, cancelable: true });
    dispatchKeyboard({
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('does not trigger global shortcuts while typing in inputs', () => {
    const copySelected = vi.spyOn(useCanvasStore.getState(), 'copySelected');
    const undo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    render(<TestComponent />);

    dispatchKeyboard({ key: 'c', metaKey: true });
    dispatchKeyboard({ key: 'z', metaKey: true, cancelable: true });

    expect(copySelected).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores destructive shortcuts when a modal is focused', () => {
    const deleteNodes = vi.spyOn(useCanvasStore.getState(), 'deleteNodes');
    useCanvasStore.setState({
      focusedNode: {
        id: 'node-1',
        data: {},
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          top: 0,
          left: 0,
          right: 100,
          bottom: 100,
          toJSON: () => ({}),
        } as DOMRect,
      },
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({ key: 'Delete' });

    expect(deleteNodes).not.toHaveBeenCalled();
  });

  it('selects all nodes and toggles the create menu from shortcuts', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: false,
        },
        {
          id: 'node-2',
          type: 'folder',
          position: { x: 10, y: 10 },
          data: {},
          selected: false,
        },
      ],
      createMenuOpen: false,
    });

    render(<TestComponent />);

    dispatchKeyboard({ key: 'a', metaKey: true, cancelable: true });
    expect(useCanvasStore.getState().nodes.every((node) => node.selected)).toBe(
      true
    );

    dispatchKeyboard({ key: 'n', metaKey: true, cancelable: true });
    expect(useCanvasStore.getState().createMenuOpen).toBe(true);
  });

  it('handles escape and enter for focused cards and folders', () => {
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

    useCanvasStore.setState({
      nodes: [
        {
          id: 'folder-1',
          type: 'folder',
          position: { x: 0, y: 0 },
          data: { title: 'Folder' },
          selected: true,
        },
      ],
      focusedNode: { id: 'focused-card', data: {}, rect },
    });

    const element = document.createElement('div');
    vi.spyOn(document, 'querySelector').mockReturnValue(element);
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);

    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'Escape' });
    });
    expect(useCanvasStore.getState().focusedNode).toBeNull();

    act(() => {
      dispatchKeyboard({ key: 'Enter' });
    });
    expect(useCanvasStore.getState().focusedFolder).toEqual({
      id: 'folder-1',
      data: { title: 'Folder' },
      rect,
    });

    act(() => {
      dispatchKeyboard({ key: 'Escape' });
    });
    expect(useCanvasStore.getState().focusedFolder).toBeNull();
  });

  it('short-circuits canvas shortcuts while in document layout mode', () => {
    useCanvasStore.setState({
      layoutMode: 'document',
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
      ],
    });

    render(<TestComponent />);

    // Delete must not fall through to deleteNodes.
    act(() => {
      dispatchKeyboard({ key: 'Delete' });
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(1);

    // Cmd+N must not toggle the canvas create menu.
    act(() => {
      dispatchKeyboard({ key: 'n', metaKey: true, cancelable: true });
    });
    expect(useCanvasStore.getState().createMenuOpen).toBe(false);

    // Cmd+A must not select all canvas nodes.
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: false,
        },
      ],
    });
    act(() => {
      dispatchKeyboard({ key: 'a', metaKey: true, cancelable: true });
    });
    expect(useCanvasStore.getState().nodes[0]?.selected).toBe(false);

    // Cmd+K is still allowed: search remains reachable from document mode.
    expect(useCanvasStore.getState().searchOpen).toBe(false);
    act(() => {
      dispatchKeyboard({ key: 'k', metaKey: true, cancelable: true });
    });
    expect(useCanvasStore.getState().searchOpen).toBe(true);
  });

  it('cleans up the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const view = render(<TestComponent />);

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
