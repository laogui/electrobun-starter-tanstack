// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasStore } from '@/store/canvasStore';

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
}));

const TestComponent = () => {
  useCanvasKeyboard();
  return <div>keyboard</div>;
};

const dispatchKeyboard = (eventInit: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, ...eventInit });
  window.dispatchEvent(event);
  return event;
};

const resetStore = () => {
  useCanvasStore.getState().reset();
  useCanvasStore.setState({
    clipboard: [],
    createMenuOpen: false,
    nodeIdCounter: 100,
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
    expect(useCanvasStore.getState().nodes[1]?.id).toMatch(/^paste-/);
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

  it('cleans up the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const view = render(<TestComponent />);

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
