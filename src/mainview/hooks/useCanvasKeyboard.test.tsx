// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import type { ReactFlowInstance } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasKeyboard } from '@/hooks/useCanvasKeyboard';
import { useCanvasStore } from '@/store/canvasStore';
import { useExtensionInstanceStore } from '@/store/extensionInstanceStore';
import { useWidgetStore } from '@/store/widgetStore';
import { createTopicData } from '../../shared/topic';

const PASTE_ID_RE = /^paste-/;

vi.mock('../../paraglide/messages.js', () => ({
  default_folder_title: () => 'New Folder',
  default_new_group_label: () => 'New Group',
  toast_node_deleted: () => 'Card deleted',
  toast_nodes_deleted: ({ count }: { count: number }) =>
    `${count} cards deleted`,
  toast_edge_deleted: () => 'Connection deleted',
  toast_undo: () => 'Undo',
  toast_titles_normalized: () => 'Note titles updated',
  toast_titles_normalize_failed: () => 'Could not normalize titles',
  toast_plugin_command_completed: () => 'Plugin command completed',
  toast_plugin_command_failed: () => 'Plugin command failed',
  toast_topic_tree_frozen: () => 'Tree frozen',
  toast_node_quota: () => 'Quota reached',
  toast_topic_write_paused: () => 'Write paused',
}));

const TestComponent = () => {
  useCanvasKeyboard();
  return <div>keyboard</div>;
};

const TestComponentWithViewport = ({
  rfInstance,
}: {
  rfInstance: React.MutableRefObject<ReactFlowInstance<any, any> | null>;
}) => {
  useCanvasKeyboard({ rfInstance });
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
    pendingSearchQuery: null,
    searchOpen: false,
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

  it('copies and pastes selected nodes with modifier shortcuts', async () => {
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
    await act(async () => {
      await Promise.resolve();
    });
    expect(useCanvasStore.getState().nodes).toHaveLength(2);
    expect(useCanvasStore.getState().nodes[1]?.id).toMatch(PASTE_ID_RE);
  });

  it('cuts selected nodes with Cmd+X', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 0, y: 0 },
          data: { title: 'Cut' },
          selected: true,
        },
        {
          id: 'node-2',
          type: 'card',
          position: { x: 100, y: 0 },
          data: { title: 'Keep' },
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({ key: 'x', metaKey: true, cancelable: true });

    const state = useCanvasStore.getState();
    expect(state.clipboard).toHaveLength(1);
    expect(state.clipboard[0]?.id).toBe('node-1');
    expect(state.nodes.map((node) => node.id)).toEqual(['node-2']);
  });

  it('duplicates selected nodes with Cmd+D', async () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 10, y: 20 },
          data: { title: 'Original' },
          selected: true,
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({ key: 'd', metaKey: true, cancelable: true });
    await act(async () => {
      await Promise.resolve();
    });

    const state = useCanvasStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.nodes[1]?.id).toMatch(PASTE_ID_RE);
    expect(state.nodes[1]?.selected).toBe(true);
  });

  it('routes native menu canvas-undo and canvas-redo events', () => {
    const undo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const redo = vi.spyOn(useCanvasStore.getState(), 'redo');

    render(<TestComponent />);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent('canvas-undo'));
      globalThis.dispatchEvent(new CustomEvent('canvas-redo'));
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
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

  it('routes undo and redo to the focused widget when a widget is focused', () => {
    const canvasUndo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const canvasRedo = vi.spyOn(useCanvasStore.getState(), 'redo');
    const undoWidget = vi
      .spyOn(useWidgetStore.getState(), 'undoWidget')
      .mockImplementation(() => undefined);
    const redoWidget = vi
      .spyOn(useWidgetStore.getState(), 'redoWidget')
      .mockImplementation(() => undefined);
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
      focusedNode: {
        id: 'widget-node-1',
        type: 'widget',
        data: { widgetId: 'widget_1', kind: 'checklist' },
        rect,
      },
    });

    render(<TestComponent />);

    dispatchKeyboard({ key: 'z', metaKey: true, cancelable: true });
    dispatchKeyboard({
      key: 'Z',
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });

    expect(undoWidget).toHaveBeenCalledWith('widget_1');
    expect(redoWidget).toHaveBeenCalledWith('widget_1');
    expect(canvasUndo).not.toHaveBeenCalled();
    expect(canvasRedo).not.toHaveBeenCalled();
  });

  it('routes undo and redo to the focused extension surface', () => {
    const canvasUndo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const canvasRedo = vi.spyOn(useCanvasStore.getState(), 'redo');
    const undoInstance = vi
      .spyOn(useExtensionInstanceStore.getState(), 'undoInstance')
      .mockImplementation(() => undefined);
    const redoInstance = vi
      .spyOn(useExtensionInstanceStore.getState(), 'redoInstance')
      .mockImplementation(() => undefined);

    render(<TestComponent />);

    const host = document.createElement('div');
    host.setAttribute('data-extension-instance', 'extinst_abc');
    document.body.append(host);
    host.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'z',
        metaKey: true,
      })
    );
    host.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Z',
        metaKey: true,
        shiftKey: true,
      })
    );

    expect(undoInstance).toHaveBeenCalledWith('extinst_abc');
    expect(redoInstance).toHaveBeenCalledWith('extinst_abc');
    expect(canvasUndo).not.toHaveBeenCalled();
    expect(canvasRedo).not.toHaveBeenCalled();
  });

  it('routes global undo and redo to the focused extension instance', () => {
    const canvasUndo = vi.spyOn(useCanvasStore.getState(), 'undo');
    const canvasRedo = vi.spyOn(useCanvasStore.getState(), 'redo');
    const undoInstance = vi
      .spyOn(useExtensionInstanceStore.getState(), 'undoInstance')
      .mockImplementation(() => undefined);
    const redoInstance = vi
      .spyOn(useExtensionInstanceStore.getState(), 'redoInstance')
      .mockImplementation(() => undefined);
    useCanvasStore.setState({
      focusedNode: {
        id: 'extension-node-1',
        type: 'extension',
        data: {
          canvasTypeId: 'ghostboard.productivity/checklist',
          instanceId: 'extinst_focused',
        },
        rect: new DOMRect(0, 0, 100, 100),
      },
    });

    render(<TestComponent />);

    dispatchKeyboard({ key: 'z', metaKey: true, cancelable: true });
    dispatchKeyboard({
      key: 'Z',
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });

    expect(undoInstance).toHaveBeenCalledWith('extinst_focused');
    expect(redoInstance).toHaveBeenCalledWith('extinst_focused');
    expect(canvasUndo).not.toHaveBeenCalled();
    expect(canvasRedo).not.toHaveBeenCalled();
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

  it('deselects all nodes with Cmd+Shift+A', () => {
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
    dispatchKeyboard({
      key: 'A',
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });

    expect(useCanvasStore.getState().nodes[0]?.selected).toBe(false);
  });

  it('groups and ungroups selected nodes with modifier shortcuts', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'node-1',
          type: 'card',
          position: { x: 100, y: 100 },
          data: {},
          selected: true,
          style: { width: 100, height: 100 },
        },
        {
          id: 'node-2',
          type: 'card',
          position: { x: 240, y: 100 },
          data: {},
          selected: true,
          style: { width: 100, height: 100 },
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({ key: 'g', metaKey: true, cancelable: true });

    const group = useCanvasStore
      .getState()
      .nodes.find((node) => node.type === 'group');
    expect(group).toBeDefined();
    expect(group?.selected).toBe(true);

    dispatchKeyboard({
      key: 'G',
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });

    expect(
      useCanvasStore.getState().nodes.some((node) => node.type === 'group')
    ).toBe(false);
    expect(useCanvasStore.getState().nodes.every((node) => node.selected)).toBe(
      true
    );
  });

  it('uses zoom keyboard shortcuts when a React Flow instance is provided', () => {
    const rf = {
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomTo: vi.fn(),
    } as unknown as ReactFlowInstance<any, any>;
    const rfInstance = { current: rf };

    render(<TestComponentWithViewport rfInstance={rfInstance} />);

    dispatchKeyboard({ key: '=', metaKey: true, cancelable: true });
    dispatchKeyboard({ key: '-', metaKey: true, cancelable: true });
    dispatchKeyboard({ key: '0', metaKey: true, cancelable: true });

    expect(rf.zoomIn).toHaveBeenCalledWith({ duration: 180 });
    expect(rf.zoomOut).toHaveBeenCalledWith({ duration: 180 });
    expect(rf.zoomTo).toHaveBeenCalledWith(1, { duration: 180 });
  });

  it('selects the nearest node in the arrow direction', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'left',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
        {
          id: 'right',
          type: 'card',
          position: { x: 200, y: 0 },
          data: {},
        },
        {
          id: 'down',
          type: 'card',
          position: { x: 0, y: 200 },
          data: {},
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({ key: 'ArrowRight', cancelable: true });

    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'right')
        ?.selected
    ).toBe(true);
    expect(
      useCanvasStore.getState().nodes.find((node) => node.id === 'left')
        ?.selected
    ).toBe(false);
  });

  it('extends the selection with Shift+Arrow navigation', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'left',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
        },
        {
          id: 'right',
          type: 'card',
          position: { x: 200, y: 0 },
          data: {},
        },
      ],
    });

    render(<TestComponent />);
    dispatchKeyboard({
      key: 'ArrowRight',
      shiftKey: true,
      cancelable: true,
    });

    const selectedIds = useCanvasStore
      .getState()
      .nodes.filter((node) => node.selected)
      .map((node) => node.id);
    expect(selectedIds).toEqual(['left', 'right']);
  });

  it('centers an arrow-selected node when it is outside the viewport', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600,
    });
    useCanvasStore.setState({
      nodes: [
        {
          id: 'left',
          type: 'card',
          position: { x: 0, y: 0 },
          data: {},
          selected: true,
          style: { width: 100, height: 100 },
        },
        {
          id: 'far-right',
          type: 'card',
          position: { x: 2000, y: 0 },
          data: {},
          style: { width: 100, height: 100 },
        },
      ],
    });
    const rf = {
      getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
      setCenter: vi.fn(),
    } as unknown as ReactFlowInstance<any, any>;
    const rfInstance = { current: rf };

    render(<TestComponentWithViewport rfInstance={rfInstance} />);
    dispatchKeyboard({ key: 'ArrowRight', cancelable: true });

    expect(rf.setCenter).toHaveBeenCalledWith(2050, 50, {
      duration: 180,
      zoom: 1,
    });
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

  it('starts inline sticky editing instead of focusing on Enter', () => {
    useCanvasStore.setState({
      nodes: [
        {
          id: 'sticky-1',
          type: 'sticky',
          position: { x: 0, y: 0 },
          data: { content: 'Note' },
          selected: true,
        },
      ],
    });

    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'Enter', cancelable: true });
    });

    expect(useCanvasStore.getState().editingStickyId).toBe('sticky-1');
    expect(useCanvasStore.getState().focusedNode).toBeNull();
  });

  it('opens the search dialog and seeds the query when typing on the canvas', () => {
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'h' });
    });

    const state = useCanvasStore.getState();
    expect(state.searchOpen).toBe(true);
    expect(state.pendingSearchQuery).toBe('h');
  });

  it('does not open the search dialog when typing inside an input', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'h' });
    });

    const state = useCanvasStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.pendingSearchQuery).toBeNull();
  });

  it('does not seed the search query for modifier shortcuts', () => {
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'a', metaKey: true, cancelable: true });
    });

    const state = useCanvasStore.getState();
    expect(state.pendingSearchQuery).toBeNull();
  });

  it('does not open search when pressing space (reserved for canvas pan)', () => {
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: ' ' });
    });

    const state = useCanvasStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.pendingSearchQuery).toBeNull();
  });

  it('does not open search or preventDefault for Cmd/Ctrl + letter shortcuts', () => {
    render(<TestComponent />);

    let prevented = false;
    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'q',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      globalThis.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });

    const state = useCanvasStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.pendingSearchQuery).toBeNull();
    expect(prevented).toBe(false);
  });

  it('does not open search for Alt + letter (accent input on macOS)', () => {
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'q', altKey: true, cancelable: true });
    });

    const state = useCanvasStore.getState();
    expect(state.searchOpen).toBe(false);
    expect(state.pendingSearchQuery).toBeNull();
  });

  it('does not intercept Tab for a selected Topic outside command context', () => {
    useCanvasStore.setState({
      nodes: [
        {
          data: { ...createTopicData('Root') },
          id: 'topic-1',
          position: { x: 0, y: 0 },
          selected: true,
          type: 'topic',
        },
      ],
      topicCommandContextId: null,
    });
    render(<TestComponent />);

    let prevented = false;
    act(() => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
      });
      globalThis.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });

    expect(prevented).toBe(false);
    expect(useCanvasStore.getState().topicDraft).toBeNull();
  });

  it('creates a child draft on Tab only while Topic command context is active', () => {
    useCanvasStore.setState({
      nodes: [
        {
          data: { ...createTopicData('Root') },
          id: 'topic-1',
          position: { x: 0, y: 0 },
          selected: true,
          type: 'topic',
        },
      ],
      topicCommandContextId: 'topic-1',
    });
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ cancelable: true, key: 'Tab' });
    });
    expect(useCanvasStore.getState().topicDraft?.relation).toEqual({
      kind: 'child',
      topicId: 'topic-1',
    });
  });

  it('lets Tab leave after Esc exits Topic command context', () => {
    useCanvasStore.setState({
      nodes: [
        {
          data: { ...createTopicData('Root') },
          id: 'topic-1',
          position: { x: 0, y: 0 },
          selected: true,
          type: 'topic',
        },
      ],
      topicCommandContextId: 'topic-1',
    });
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'Escape' });
    });
    expect(useCanvasStore.getState().topicCommandContextId).toBeNull();
    expect(useCanvasStore.getState().nodes[0]?.selected).toBe(true);

    let prevented = false;
    act(() => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
      });
      globalThis.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    expect(useCanvasStore.getState().topicDraft).toBeNull();
  });

  it('F2 re-enters Topic command context on a selected Topic', () => {
    useCanvasStore.setState({
      nodes: [
        {
          data: { ...createTopicData('Root') },
          id: 'topic-1',
          position: { x: 0, y: 0 },
          selected: true,
          type: 'topic',
        },
      ],
      topicCommandContextId: null,
    });
    render(<TestComponent />);

    act(() => {
      dispatchKeyboard({ key: 'F2' });
    });
    expect(useCanvasStore.getState().editingTopicId).toBe('topic-1');
    expect(useCanvasStore.getState().topicCommandContextId).toBe('topic-1');
  });

  it('cleans up the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(globalThis, 'removeEventListener');
    const view = render(<TestComponent />);

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
